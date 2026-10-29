import "server-only";
import { aftEnv } from "@aft/config/env";
import type { z } from "zod";
import { AppError, normalizeError, toProblem, type ErrorMapper } from "../errors";
import type { Logger } from "../log";
import {
  DEFAULT_MAX_BODY_BYTES,
  MAX_BODY_BYTES_CEILING,
  input,
  parseInput,
  readJsonBody,
} from "../validate";
import {
  controlFlowOf,
  controlFlowOutcome,
  idempotentControlFlow,
  ownerOf,
  runCommitted,
  userIdOf,
} from "./call";
import { fingerprintOf, isIdempotencyKey, runIdempotent, type Reply } from "./idempotency";
import type {
  AuthMode,
  Caller,
  ContextResolver,
  IdempotencyStore,
  ResolvedContext,
  TransactionRunner,
} from "./types";

// What every handler gets: one id and one instant per call, and a logger with the ids bound.
export type BaseContext = {
  requestId: string;
  now: Date;
  log: Logger;
};

// A signed in call also gets its caller and the call's one transaction.
export type CallerContext<Tx> = BaseContext & {
  caller: Caller;
  userId?: string;
  organizationId?: string;
  role?: string;
  db: Tx;
};

export type RouteContext<Tx, A extends AuthMode> = A extends "public"
  ? BaseContext
  : A extends "org"
    ? CallerContext<Tx> & { organizationId: string }
    : CallerContext<Tx>;

// What authorize sees: the call's context before its transaction opens.
export type AuthorizeContext<Tx, A extends AuthMode> = Omit<RouteContext<Tx, A>, "db">;

export type RouteReply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

type Schema = z.ZodType;
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

export type RouteDefinition<
  Tx,
  A extends AuthMode,
  B extends Schema | undefined,
  Q extends Schema | undefined,
  P extends Schema | undefined,
> = {
  // Unique among routes; written to the access line.
  name: string;
  // Must equal the route file's folder (checked by ci.test.ts); with the method it is the idempotency scope.
  path: string;
  auth: A;
  body?: B;
  query?: Q;
  params?: P;
  // Default 100 KB, at most 1 MB (AC-7).
  maxBodyBytes?: number;
  // false gives forbidden (403); feature 41 adds role helpers.
  authorize?: (ctx: AuthorizeContext<Tx, A>) => boolean | Promise<boolean>;
  handler: (args: {
    body: Out<B>;
    query: Out<Q>;
    params: Out<P>;
    ctx: RouteContext<Tx, A>;
  }) => Promise<RouteReply>;
};

export type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

export type RouteWrapperOptions<Tx> = {
  logger: Logger;
  resolver: ContextResolver;
  store: IdempotencyStore<Tx>;
  transactions: TransactionRunner<Tx>;
  errorMappers?: readonly ErrorMapper[];
  // Origins a signed in browser may write from (AC-10): the BETTER_AUTH_URL origin plus Better
  // Auth's trustedOrigins. A function is called on the first write that needs it.
  allowedOrigins: readonly string[] | (() => readonly string[] | Promise<readonly string[]>);
  // Resolves an `Authorization: Bearer` call; feature 75 supplies it. Without it such calls get 401.
  verifyApiKey?: ContextResolver;
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Signed in writes that must carry an Idempotency-Key (AC-5). Public routes (webhooks) dedupe
// through the webhook inbox instead.
const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "DELETE"]);

// An API key call is any request carrying a Bearer token; everything else is a session call (AC-10).
const BEARER = /^bearer\s/i;

// Query values are strings; a key given more than once becomes an array.
function queryObject(url: URL): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    result[key] = values.length === 1 ? values[0]! : values;
  }
  return result;
}

// An absent schema means nothing is accepted there: strict, like every boundary (AC-6).
const EMPTY = input({});

const KEY_MESSAGE = "Send an Idempotency-Key header of 1 to 255 printable ASCII characters";

export function createRouteWrapper<Tx>({
  logger,
  resolver,
  store,
  transactions,
  errorMappers = [],
  allowedOrigins,
  verifyApiKey,
}: RouteWrapperOptions<Tx>) {
  let origins: Promise<ReadonlySet<string>> | undefined;
  // Compared as URL origins, so a trailing slash or a path in the configured value does not matter.
  function originsAllowed(): Promise<ReadonlySet<string>> {
    origins ??= Promise.resolve(
      typeof allowedOrigins === "function" ? allowedOrigins() : allowedOrigins,
    ).then(
      (list) => new Set(list.map((origin) => new URL(origin).origin)),
      (error: unknown) => {
        origins = undefined;
        throw error;
      },
    );
    return origins;
  }

  // A session write must come from one of our own pages (CSRF, X24). A missing Origin or
  // `Origin: null` is refused too.
  async function checkOrigin(headers: Headers): Promise<void> {
    const origin = headers.get("origin");
    if (!origin || origin === "null" || !(await originsAllowed()).has(origin))
      throw new AppError("forbidden");
  }

  return function defineRoute<
    A extends AuthMode,
    B extends Schema | undefined = undefined,
    Q extends Schema | undefined = undefined,
    P extends Schema | undefined = undefined,
  >(definition: RouteDefinition<Tx, A, B, Q, P>): RouteHandler {
    const maxBodyBytes = definition.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (
      !Number.isSafeInteger(maxBodyBytes) ||
      maxBodyBytes < 1 ||
      maxBodyBytes > MAX_BODY_BYTES_CEILING
    )
      throw new RangeError(
        `${definition.name}: maxBodyBytes must be 1 to ${MAX_BODY_BYTES_CEILING}`,
      );
    const auth: AuthMode = definition.auth;

    return async (request, context) => {
      const started = performance.now();
      const requestId = crypto.randomUUID();
      const now = new Date();
      const method = request.method;
      const clientRequestId = request.headers.get("x-request-id");
      const exposeInternal = aftEnv() === "development";
      let log = logger.child({ requestId });

      let idempotent = false;
      let status: number;
      let result: string;
      let replayed = false;
      let response: Response;
      const headers = new Headers({ "X-Request-Id": requestId });
      if (WRITE_METHODS.has(method)) headers.set("Cache-Control", "no-store");

      try {
        // The order of work (spec 0011): the first failure wins, so a caller with no session gets
        // 401 before anything reads the body.
        const apiKeyCall = BEARER.test(request.headers.get("authorization") ?? "");
        let resolved: ResolvedContext | null = null;
        if (auth !== "public") {
          const via = apiKeyCall ? verifyApiKey : resolver;
          resolved = via ? await via.resolve({ headers: request.headers, mode: auth }) : null;
          if (!resolved) throw new AppError("unauthenticated");
        }
        const userId = resolved ? userIdOf(resolved.caller) : undefined;
        // The workspace (and the role in it) belong to org mode only; user mode runs unscoped.
        const organizationId = auth === "org" ? resolved?.organizationId : undefined;
        const role = auth === "org" ? resolved?.role : undefined;
        if (resolved)
          log = log.child({
            ...(userId ? { userId } : {}),
            ...(organizationId ? { organizationId } : {}),
          });

        if (resolved && !apiKeyCall && WRITE_METHODS.has(method))
          await checkOrigin(request.headers);

        idempotent = auth !== "public" && IDEMPOTENT_METHODS.has(method);
        const key = request.headers.get("idempotency-key");
        if (idempotent && !isIdempotencyKey(key)) throw new AppError("bad_request", KEY_MESSAGE);

        const rawBody = definition.body ? await readJsonBody(request, maxBodyBytes) : undefined;
        const params = parseInput(definition.params ?? EMPTY, (await context.params) ?? {});
        const query = parseInput(definition.query ?? EMPTY, queryObject(new URL(request.url)));
        const body = definition.body ? parseInput(definition.body, rawBody) : undefined;

        // A caller outside the workspace sees the same 404 as a workspace that does not exist (X15).
        if (auth === "org" && !organizationId) throw new AppError("not_found");

        const base = { requestId, now, log };
        const callerContext = resolved
          ? { ...base, caller: resolved.caller, userId, organizationId, role }
          : base;
        if (
          definition.authorize &&
          !(await definition.authorize(callerContext as AuthorizeContext<Tx, A>))
        )
          throw new AppError("forbidden");

        let replyHeaders: Record<string, string> = {};
        const run = async (db?: Tx): Promise<Reply> => {
          const ctx = resolved ? { ...callerContext, db } : callerContext;
          const reply = await definition.handler({
            body: body as Out<B>,
            query: query as Out<Q>,
            params: params as Out<P>,
            ctx: ctx as RouteContext<Tx, A>,
          });
          replyHeaders = reply.headers ?? {};
          return { status: reply.status, body: reply.body ?? null };
        };

        let reply: Reply;
        if (!resolved) {
          reply = await run();
        } else if (idempotent) {
          const scope = `${method} ${definition.path}`;
          const outcome = await runIdempotent({
            store,
            transactions,
            id: {
              ...ownerOf(resolved.caller),
              organizationId: organizationId ?? "",
              scope,
              key: key!,
            },
            fingerprint: fingerprintOf(method, scope, { params, query, body }),
            now,
            tier: aftEnv(),
            log,
            errorMappers,
            handler: run,
            errorReply: (error) => ({
              status: error.status,
              body: toProblem(error, { requestId, exposeInternal }),
            }),
          });
          replayed = outcome.replayed;
          reply = outcome;
        } else {
          reply = await runCommitted(transactions, organizationId, run);
        }

        status = reply.status;
        if (replayed) {
          headers.set("Idempotent-Replayed", "true");
          const code = (reply.body as { code?: unknown } | null)?.code;
          result = status >= 400 && typeof code === "string" ? code : "ok";
        } else {
          for (const [name, value] of Object.entries(replyHeaders)) headers.set(name, value);
          result = "ok";
        }
        if (reply.body === null) {
          response = new Response(null, { status, headers });
        } else {
          headers.set(
            "Content-Type",
            status >= 400 ? "application/problem+json" : "application/json",
          );
          response = new Response(JSON.stringify(reply.body), { status, headers });
        }
      } catch (caught) {
        // Next.js control flow first (AC-9): rethrown for Next.js to answer, never logged as an error.
        const controlFlow = controlFlowOf(caught);
        if (controlFlow && !idempotent) {
          ({ status, result } = controlFlowOutcome(controlFlow.error));
          writeAccessLine();
          throw controlFlow.error;
        }
        let error: AppError;
        try {
          error = controlFlow
            ? idempotentControlFlow(definition.name, aftEnv())
            : normalizeError(caught, errorMappers);
        } catch (programmingError) {
          status = 500;
          result = "internal";
          writeAccessLine();
          throw programmingError;
        }
        // A crash is anything that was not an AppError and no mapper recognized (X31).
        if (!(caught instanceof AppError) && error.code === "internal")
          log.error({ err: controlFlow ? error.cause : caught }, "request failed");
        status = error.status;
        result = error.code;
        headers.set("Content-Type", "application/problem+json");
        headers.set("Cache-Control", "no-store");
        if (error.retryAfterSeconds !== undefined)
          headers.set("Retry-After", String(error.retryAfterSeconds));
        const problem = toProblem(error, { requestId, exposeInternal });
        response = new Response(JSON.stringify(problem), { status, headers });
      }

      writeAccessLine();
      return response;

      // One info line per call (AC-13).
      function writeAccessLine() {
        log.info(
          {
            kind: "route",
            route: definition.path,
            method,
            status,
            result,
            durationMs: Math.round(performance.now() - started),
            replayed,
            ...(clientRequestId ? { clientRequestId } : {}),
          },
          "request",
        );
      }
    };
  };
}
