import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
import { createLogger } from "../log";
import { input, text } from "../validate";
import { fakeDatabase, fakeResolver } from "./fakes.test-support";
import { createRouteWrapper } from "./route";

// The thin thread (spec 0011 build step 1): a fixture route made with the real factory.
function setup() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "web",
    level: "info",
    destination: {
      write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>),
    },
  });
  const { store, transactions } = fakeDatabase();
  const defineRoute = createRouteWrapper({
    logger,
    resolver: fakeResolver(),
    store,
    transactions,
    errorMappers: [(error) => (error === "mapped" ? new AppError("conflict") : null)],
    allowedOrigins: ["http://localhost"],
  });
  const handler = vi.fn(async ({ body }: { body: { title: string } }) => ({
    status: 201,
    body: { id: "p1", title: body.title },
  }));
  const route = defineRoute({
    name: "things.create",
    path: "/api/v1/things",
    auth: "public",
    body: input({ title: text({ max: 10 }) }),
    handler,
  });
  return { lines, route, handler, defineRoute };
}

const url = "http://localhost/api/v1/things";
const noParams = { params: Promise.resolve({}) };
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", ...headers },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defineRoute (public)", () => {
  it("covers AC-13: runs the handler, replies JSON, sets X-Request-Id, and writes one access line", async () => {
    const { lines, route } = setup();
    const response = await route(
      post('{"title":"  Hi "}', { "x-request-id": "client-1" }),
      noParams,
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe("client-1");
    expect(await response.json()).toEqual({ id: "p1", title: "Hi" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "request",
      kind: "route",
      route: "/api/v1/things",
      method: "POST",
      status: 201,
      result: "ok",
      replayed: false,
      requestId,
      clientRequestId: "client-1",
    });
    expect(typeof lines[0]!.durationMs).toBe("number");
  });

  it("X20, covers AC-8: a validation failure is a problem reply with field errors", async () => {
    const { route, handler, lines } = setup();
    const response = await route(post('{"title":"ok","admin":true}'), noParams);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const problem = (await response.json()) as Record<string, unknown>;
    expect(problem).toMatchObject({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      code: "validation_failed",
      requestId: response.headers.get("x-request-id"),
      errors: [{ path: "admin", message: "Unknown field" }],
    });
    expect(handler).not.toHaveBeenCalled();
    expect(lines[0]).toMatchObject({ status: 400, result: "validation_failed" });
  });

  it("X22, X23: 413 over the cap and 415 for another media type", async () => {
    const { route } = setup();
    expect((await route(post(`{"title":"${"x".repeat(100_001)}"}`), noParams)).status).toBe(413);
    const plain = new Request(url, {
      method: "POST",
      body: "{}",
      headers: { "content-type": "text/plain" },
    });
    expect((await route(plain, noParams)).status).toBe(415);
  });

  it("covers AC-6: an unexpected query parameter is refused", async () => {
    const { route } = setup();
    const response = await route(
      new Request(`${url}?debug=1`, {
        method: "POST",
        body: '{"title":"a"}',
        headers: { "content-type": "application/json" },
      }),
      noParams,
    );
    expect(response.status).toBe(400);
  });

  it("X31: a crash is internal with the generic message, logs the error, and never leaks a stack", async () => {
    const { defineRoute, lines } = setup();
    const route = defineRoute({
      name: "things.crash",
      path: "/api/v1/things",
      auth: "public",
      handler: () => Promise.reject(new Error("db exploded at host 10.0.0.5")),
    });
    const response = await route(new Request(url), noParams);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toMatchObject({ code: "internal", detail: "Something went wrong" });
    expect(text).not.toContain("10.0.0.5");
    expect(text).not.toMatch(/\bat \S+:\d+/);
    expect(lines.map((line) => line.level)).toEqual(["error", "info"]);
    expect(lines[0]).toMatchObject({ msg: "request failed" });
  });

  it("X31: under AFT_ENV=development the real message shows", async () => {
    vi.stubEnv("AFT_ENV", "development");
    const { defineRoute } = setup();
    const route = defineRoute({
      name: "things.crash",
      path: "/api/v1/things",
      auth: "public",
      handler: () => Promise.reject(new Error("db exploded")),
    });
    expect(await (await route(new Request(url), noParams)).json()).toMatchObject({
      detail: "db exploded",
    });
  });

  it("covers AC-8: a mapped error and an AppError are not logged as crashes; Retry-After is set", async () => {
    const { defineRoute, lines } = setup();
    const mapped = defineRoute({
      name: "things.mapped",
      path: "/api/v1/things",
      auth: "public",
      handler: () => Promise.reject("mapped"),
    });
    expect((await mapped(new Request(url), noParams)).status).toBe(409);
    const limited = defineRoute({
      name: "things.limited",
      path: "/api/v1/things",
      auth: "public",
      handler: () =>
        Promise.reject(new AppError("rate_limited", undefined, { retryAfterSeconds: 30 })),
    });
    const response = await limited(new Request(url), noParams);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(lines.every((line) => line.level === "info")).toBe(true);
  });

  it("validates params with their schema", async () => {
    const { defineRoute } = setup();
    const route = defineRoute({
      name: "things.get",
      path: "/api/v1/things/[id]",
      auth: "public",
      params: input({ id: text({ max: 5 }) }),
      handler: ({ params }) => Promise.resolve({ status: 200, body: params }),
    });
    const ok = await route(new Request(`${url}/abc`), { params: Promise.resolve({ id: "abc" }) });
    expect(await ok.json()).toEqual({ id: "abc" });
    const bad = await route(new Request(`${url}/abcdefg`), {
      params: Promise.resolve({ id: "abcdefg" }),
    });
    expect(bad.status).toBe(400);
  });

  it("refuses a maxBodyBytes above 1 MB at definition", () => {
    const { defineRoute } = setup();
    expect(() =>
      defineRoute({
        name: "x",
        path: "/api/v1/x",
        auth: "public",
        maxBodyBytes: 1_000_001,
        handler: () => Promise.resolve({ status: 204 }),
      }),
    ).toThrow(RangeError);
  });
});
