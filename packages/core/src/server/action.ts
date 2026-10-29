import "server-only";
import { headers } from "next/headers";
import { aftEnv } from "@aft/config/env";
import type { z } from "zod";
import {
  AppError,
  normalizeError,
  toActionError,
  type ActionError,
  type ErrorMapper,
} from "../errors";
import type { Logger } from "../log";
import { parseInput } from "../validate";
import {
  controlFlowOf,
  controlFlowOutcome,
  idempotentControlFlow,
  ownerOf,
  runCommitted,
  userIdOf,
} from "./call";
import { fingerprintOf, isIdempotencyKey, runIdempotent, type Reply } from "./idempotency";
import type { AuthorizeContext, RouteContext } from "./route";
import type { AuthMode, ContextResolver, IdempotencyStore, TransactionRunner } from "./types";

// Server actions (spec 0011, Server actions): the UI's way to call the server. A failure comes back
// as a value, never a throw, so the form can show it.

export type ActionContext<Tx, A extends AuthMode> = RouteContext<Tx, A>;

export type ActionResult<T> =
  { ok: true; data: T; replayed?: true } | { ok: false; error: ActionError; replayed?: true };

export type ActionDefinition<Tx, A extends AuthMode, S extends z.ZodType, T> = {
  // Unique among actions; written to the access line, and "action:<name>" is the idempotency scope.
  name: string;
  auth: A;
  // For actions that create, charge, or deliver something: the client sends `idempotencyKey`.
  // A public action can't be idempotent (there is no caller to own the key).
  idempotent?: A extends "public" ? false : boolean;
  input: S;
  // false gives forbidden; feature 41 adds role helpers.
  authorize?: (ctx: AuthorizeContext<Tx, A>) => boolean | Promise<boolean>;
  handler: (args: { input: z.output<S>; ctx: ActionContext<Tx, A> }) => Promise<T>;
};

// The one plain object argument an action takes; the wrapper removes `idempotencyKey` first. An
// empty strict schema types as an index signature of never, which would refuse the key.
type KeyArg = { idempotencyKey?: string };
export type ActionArgs<S extends z.ZodType> = string extends keyof z.input<S>
  ? KeyArg
  : z.input<S> & KeyArg;

export type ActionWrapperOptions<Tx> = {
  logger: Logger;
  resolver: ContextResolver;
  store: IdempotencyStore<Tx>;
  transactions: TransactionRunner<Tx>;
  errorMappers?: readonly ErrorMapper[];
};

const KEY_MESSAGE = "Send an idempotencyKey of 1 to 255 printable ASCII characters";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function createActionWrapper<Tx>({
  logger,
  resolver,
  store,
  transactions,
  errorMappers = [],
}: ActionWrapperOptions<Tx>) {
  return function defineAction<A extends AuthMode, S extends z.ZodType, T>(
    definition: ActionDefinition<Tx, A, S, T>,
  ): (args: ActionArgs<S>) => Promise<ActionResult<T>> {
    const auth: AuthMode = definition.auth;
    const idempotent = definition.idempotent === true;
    if (idempotent && auth === "public")
      throw new TypeError(`${definition.name}: a public action can't be idempotent`);
    const scope = `action:${definition.name}`;

    return async (args) => {
      const started = performance.now();
      const requestId = crypto.randomUUID();
      const now = new Date();
      const exposeInternal = aftEnv() === "development";
      let log = logger.child({ requestId });

      let status = 200;
      let result = "ok";
      let replayed = false;
      let response: ActionResult<T>;

      try {
        // The same order of work as routes (spec 0011): the caller first, then the input.
        const resolved =
          auth === "public"
            ? null
            : await resolver.resolve({ headers: await headers(), mode: auth });
        if (auth !== "public" && !resolved) throw new AppError("unauthenticated");
        const userId = resolved ? userIdOf(resolved.caller) : undefined;
        // The workspace (and the role in it) belong to org mode only; user mode runs unscoped.
        const organizationId = auth === "org" ? resolved?.organizationId : undefined;
        const role = auth === "org" ? resolved?.role : undefined;
        if (resolved)
          log = log.child({
            ...(userId ? { userId } : {}),
            ...(organizationId ? { organizationId } : {}),
          });

        // One plain object, never FormData (spec 0011); no argument at all reads as {}.
        const raw: unknown = args === undefined ? {} : args;
        if (!isPlainObject(raw)) throw new AppError("bad_request", "Send one plain object");
        const { idempotencyKey, ...rest } = raw;
        if (idempotent && !isIdempotencyKey(idempotencyKey))
          throw new AppError("bad_request", KEY_MESSAGE);
        const input: z.output<S> = parseInput(definition.input, rest);

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

        const run = (db?: Tx): Promise<T> =>
          definition.handler({
            input,
            ctx: (resolved ? { ...callerContext, db } : callerContext) as ActionContext<Tx, A>,
          });

        if (!resolved) {
          response = { ok: true, data: await run() };
        } else if (idempotent) {
          const outcome = await runIdempotent({
            store,
            transactions,
            id: {
              ...ownerOf(resolved.caller),
              organizationId: organizationId ?? "",
              scope,
              // Checked above.
              key: idempotencyKey as string,
            },
            fingerprint: fingerprintOf("POST", scope, input),
            now,
            tier: aftEnv(),
            log,
            errorMappers,
            // Through JSON, so the first reply is exactly what a replay returns.
            handler: async (tx): Promise<Reply> => ({
              status: 200,
              body: JSON.parse(JSON.stringify({ ok: true, data: await run(tx) })) as unknown,
            }),
            errorReply: (error) => ({
              status: error.status,
              body: { ok: false, error: toActionError(error, { requestId, exposeInternal }) },
            }),
          });
          replayed = outcome.replayed;
          status = outcome.status;
          response = outcome.body as ActionResult<T>;
          if (!response.ok) result = response.error.code;
          if (replayed) response = { ...response, replayed: true };
        } else {
          response = { ok: true, data: await runCommitted(transactions, organizationId, run) };
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
          log.error({ err: controlFlow ? error.cause : caught }, "action failed");
        status = error.status;
        result = error.code;
        response = { ok: false, error: toActionError(error, { requestId, exposeInternal }) };
      }

      writeAccessLine();
      return response;

      // One info line per call (AC-13).
      function writeAccessLine() {
        log.info(
          {
            kind: "action",
            action: definition.name,
            status,
            result,
            durationMs: Math.round(performance.now() - started),
            replayed,
          },
          "request",
        );
      }
    };
  };
}
