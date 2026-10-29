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

// What every handler gets: one id and one instant per call, and a logger with the ids bound.
export type RouteContext = {
  requestId: string;
  now: Date;
  log: Logger;
};

export type RouteReply = {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
};

type Schema = z.ZodType;
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;

export type RouteDefinition<
  B extends Schema | undefined,
  Q extends Schema | undefined,
  P extends Schema | undefined,
> = {
  // Unique among routes; written to the access line.
  name: string;
  // Must equal the route file's folder (checked by ci.test.ts); with the method it is the idempotency scope.
  path: string;
  auth: "public";
  body?: B;
  query?: Q;
  params?: P;
  // Default 100 KB, at most 1 MB (AC-7).
  maxBodyBytes?: number;
  handler: (args: {
    body: Out<B>;
    query: Out<Q>;
    params: Out<P>;
    ctx: RouteContext;
  }) => Promise<RouteReply>;
};

export type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string | string[] | undefined>> },
) => Promise<Response>;

export type RouteWrapperOptions = {
  logger: Logger;
  errorMappers?: readonly ErrorMapper[];
};

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

export function createRouteWrapper({ logger, errorMappers = [] }: RouteWrapperOptions) {
  return function defineRoute<
    B extends Schema | undefined = undefined,
    Q extends Schema | undefined = undefined,
    P extends Schema | undefined = undefined,
  >(definition: RouteDefinition<B, Q, P>): RouteHandler {
    const maxBodyBytes = definition.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    if (
      !Number.isSafeInteger(maxBodyBytes) ||
      maxBodyBytes < 1 ||
      maxBodyBytes > MAX_BODY_BYTES_CEILING
    )
      throw new RangeError(
        `${definition.name}: maxBodyBytes must be 1 to ${MAX_BODY_BYTES_CEILING}`,
      );

    return async (request, context) => {
      const started = performance.now();
      const requestId = crypto.randomUUID();
      const now = new Date();
      const method = request.method;
      const clientRequestId = request.headers.get("x-request-id");
      const log = logger.child({ requestId });
      const ctx: RouteContext = { requestId, now, log };

      let status: number;
      let result: string;
      let response: Response;
      const headers = new Headers({ "X-Request-Id": requestId });
      if (WRITE_METHODS.has(method)) headers.set("Cache-Control", "no-store");

      try {
        const rawBody = definition.body ? await readJsonBody(request, maxBodyBytes) : undefined;
        const params = parseInput(definition.params ?? EMPTY, (await context.params) ?? {});
        const query = parseInput(definition.query ?? EMPTY, queryObject(new URL(request.url)));
        const body = definition.body ? parseInput(definition.body, rawBody) : undefined;

        const reply = await definition.handler({
          body: body as Out<B>,
          query: query as Out<Q>,
          params: params as Out<P>,
          ctx,
        });
        for (const [name, value] of Object.entries(reply.headers ?? {})) headers.set(name, value);
        status = reply.status;
        result = "ok";
        if (reply.body === undefined) {
          response = new Response(null, { status, headers });
        } else {
          headers.set("Content-Type", "application/json");
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
        const problem = toProblem(error, { requestId, exposeInternal: aftEnv() === "development" });
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
          replayed: false,
          ...(clientRequestId ? { clientRequestId } : {}),
        },
        "request",
      );
      return response;
    };
  };
}
