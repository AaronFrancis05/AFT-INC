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
import { fingerprintOf, isIdempotencyKey, runIdempotent, type Reply } from "./idempotency";
import type {
  AuthMode,
  Caller,
  ContextResolver,
  IdempotencyId,
  IdempotencyStore,
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
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Signed in writes that must carry an Idempotency-Key (AC-5). Public routes (webhooks) dedupe
// through the webhook inbox instead.
const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "DELETE"]);

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

function ownerOf(caller: Caller): Pick<IdempotencyId, "ownerKind" | "ownerId"> {
  return caller.kind === "user"
    ? { ownerKind: "user", ownerId: caller.userId }
    : { ownerKind: "api_key", ownerId: caller.apiKeyId };
}

export function createRouteWrapper<Tx>({
  logger,
  resolver,
  store,
  transactions,
  errorMappers = [],
}: RouteWrapperOptions<Tx>) {
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

      let status: number;
      let result: string;
      let replayed = false;
      let response: Response;
      const headers = new Headers({ "X-Request-Id": requestId });
      if (WRITE_METHODS.has(method)) headers.set("Cache-Control", "no-store");

      try {
        // The order of work (spec 0011): the first failure wins, so a caller with no session gets
        // 401 before anything reads the body.
        const resolved =
          auth === "public"
            ? null
            : await resolver.resolve({ headers: request.headers, mode: auth });
        if (auth !== "public" && !resolved) throw new AppError("unauthenticated");
        const userId =
          resolved?.caller.kind === "user" ? resolved.caller.userId : resolved?.caller.userId;
        const organizationId = resolved?.organizationId;
        if (resolved)
          log = log.child({
            ...(userId ? { userId } : {}),
            ...(organizationId ? { organizationId } : {}),
          });

        const idempotent = auth !== "public" && IDEMPOTENT_METHODS.has(method);
        const key = request.headers.get("idempotency-key");
        if (idempotent && !isIdempotencyKey(key)) throw new AppError("bad_request", KEY_MESSAGE);

        const rawBody = definition.body ? await readJsonBody(request, maxBodyBytes) : undefined;
        const params = parseInput(definition.params ?? EMPTY, (await context.params) ?? {});
        const query = parseInput(definition.query ?? EMPTY, queryObject(new URL(request.url)));
        const body = definition.body ? parseInput(definition.body, rawBody) : undefined;

        // A caller outside the workspace sees the same 404 as a workspace that does not exist (X15).
        if (auth === "org" && !organizationId) throw new AppError("not_found");

        let replyHeaders: Record<string, string> = {};
        const run = async (db?: Tx): Promise<Reply> => {
          const base = { requestId, now, log };
          const ctx = resolved
            ? { ...base, caller: resolved.caller, userId, organizationId, role: resolved.role, db }
            : base;
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
          reply = await transactions.run(organizationId, run);
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
        const error = normalizeError(caught, errorMappers);
        // A crash is anything that was not an AppError and no mapper recognized (X31).
        if (!(caught instanceof AppError) && error.code === "internal")
          log.error({ err: caught }, "request failed");
        status = error.status;
        result = error.code;
        headers.set("Content-Type", "application/problem+json");
        headers.set("Cache-Control", "no-store");
        if (error.retryAfterSeconds !== undefined)
          headers.set("Retry-After", String(error.retryAfterSeconds));
        const problem = toProblem(error, { requestId, exposeInternal });
        response = new Response(JSON.stringify(problem), { status, headers });
      }

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
      return response;
    };
  };
}
