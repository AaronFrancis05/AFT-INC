import { notFound, redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../log";
import { input, text } from "../validate";
import { fakeDatabase, fakeResolver, type FakeTx } from "./fakes.test-support";
import { createRouteWrapper, type RouteWrapperOptions } from "./route";
import type { ContextResolver, ResolvedContext } from "./types";

// Routes: the Origin check, API key calls, authorize, and Next.js control flow (spec 0011 build
// step 4), with the in memory store and runner.
const member: ResolvedContext = {
  caller: { kind: "user", userId: "u1" },
  organizationId: "org_a",
  role: "owner",
};

function setup(
  context: ResolvedContext | null = member,
  options: Partial<RouteWrapperOptions<FakeTx>> = {},
) {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({
    service: "web",
    level: "info",
    destination: {
      write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>),
    },
  });
  const database = fakeDatabase();
  const resolver = fakeResolver(context);
  const defineRoute = createRouteWrapper<FakeTx>({
    logger,
    resolver,
    store: database.store,
    transactions: database.transactions,
    // Written with a trailing slash on purpose: origins are compared as URL origins.
    allowedOrigins: ["https://aft.example/", "https://trusted.example"],
    ...options,
  });
  const handler = vi.fn(async ({ body }: { body: { title: string } }) => ({
    status: 201,
    body: { title: body.title },
  }));
  const route = defineRoute({
    name: "projects.create",
    path: "/api/v1/projects",
    auth: "org",
    body: input({ title: text({ max: 50 }) }),
    handler,
  });
  return { lines, route, handler, defineRoute, database, resolver };
}

const url = "https://aft.example/api/v1/projects";
const noParams = { params: Promise.resolve({}) };
const write = (headers: Record<string, string>, method = "POST") =>
  new Request(url, {
    method,
    body: JSON.stringify({ title: "a" }),
    headers: { "content-type": "application/json", "idempotency-key": "k1", ...headers },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Origin check on session writes (AC-10, X24)", () => {
  it("a session POST, PATCH, or DELETE from our own origins passes", async () => {
    const { route } = setup();
    for (const [origin, method] of [
      ["https://aft.example", "POST"],
      ["https://trusted.example", "PATCH"],
      ["https://aft.example", "DELETE"],
    ] as const) {
      const response = await route(write({ origin }, method), noParams);
      expect(response.status, `${method} ${origin}`).toBe(201);
    }
  });

  it("a foreign origin, Origin: null, or no Origin gets 403 before the key or body is read", async () => {
    const { route, handler } = setup();
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "https://aft.example.evil.example" },
      { origin: "http://aft.example" },
      { origin: "null" },
      {},
    ] as Record<string, string>[]) {
      const request = new Request(url, {
        method: "POST",
        body: "not json",
        headers: { "content-type": "text/plain", ...headers },
      });
      const response = await route(request, noParams);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(await response.json()).toMatchObject({ code: "forbidden" });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("GET is not checked, and an unauthenticated write gets 401 first", async () => {
    const { defineRoute } = setup();
    const list = defineRoute({
      name: "projects.list",
      path: "/api/v1/projects",
      auth: "org",
      handler: async () => ({ status: 200, body: [] }),
    });
    expect((await list(new Request(url), noParams)).status).toBe(200);
    const { route } = setup(null);
    expect((await route(write({ origin: "https://evil.example" }), noParams)).status).toBe(401);
  });

  it("public routes skip it", async () => {
    const { defineRoute } = setup();
    const hook = defineRoute({
      name: "hooks.receive",
      path: "/api/v1/hooks",
      auth: "public",
      handler: async () => ({ status: 202 }),
    });
    const request = new Request(url, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect((await hook(request, noParams)).status).toBe(202);
  });

  it("reads a function of allowed origins once, on the first write that needs it", async () => {
    const allowedOrigins = vi.fn(async () => ["https://aft.example"]);
    const { route } = setup(member, { allowedOrigins });
    expect(allowedOrigins).not.toHaveBeenCalled();
    await route(write({ origin: "https://aft.example" }), noParams);
    await route(write({ origin: "https://aft.example" }, "PATCH"), noParams);
    expect(allowedOrigins).toHaveBeenCalledTimes(1);
  });
});

describe("API key calls (AC-10, AC-11)", () => {
  const apiKey: ResolvedContext = {
    caller: { kind: "api_key", apiKeyId: "key_1", userId: "u9" },
    organizationId: "org_k",
  };

  it("a Bearer call without verifyApiKey configured is unauthenticated, even with a session", async () => {
    const { route, handler } = setup();
    const response = await route(write({ authorization: "Bearer sk_live_x" }), noParams);
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("a Bearer call goes to verifyApiKey, skips the Origin check, and owns its key", async () => {
    const verifyApiKey: ContextResolver = { resolve: vi.fn(async () => apiKey) };
    const { route, resolver, database, lines } = setup(member, { verifyApiKey });
    const resolve = vi.spyOn(resolver, "resolve");
    const response = await route(write({ authorization: "bearer sk_live_x" }), noParams);
    expect(response.status).toBe(201);
    expect(resolve).not.toHaveBeenCalled();
    expect([...database.rows.keys()]).toEqual(["api_key:key_1:org_k:POST /api/v1/projects:k1"]);
    expect(lines.at(-1)).toMatchObject({ userId: "u9", organizationId: "org_k" });
  });

  it("verifyApiKey returning null is unauthenticated", async () => {
    const { route } = setup(member, { verifyApiKey: { resolve: async () => null } });
    expect((await route(write({ authorization: "Bearer bad" }), noParams)).status).toBe(401);
  });
});

describe("authorize and modes (AC-11)", () => {
  it("authorize false gets 403 before the transaction; it sees the role but no db", async () => {
    const { defineRoute, database } = setup();
    const seen: unknown[] = [];
    const remove = defineRoute({
      name: "projects.delete",
      path: "/api/v1/projects",
      auth: "org",
      authorize: async (ctx) => {
        seen.push({ role: ctx.role, org: ctx.organizationId, hasDb: "db" in ctx });
        return false;
      },
      handler: async () => ({ status: 204 }),
    });
    const response = await remove(write({ origin: "https://aft.example" }, "DELETE"), noParams);
    expect(response.status).toBe(403);
    expect(seen).toEqual([{ role: "owner", org: "org_a", hasDb: false }]);
    expect(database.runs).toEqual([]);
  });

  it("user mode ignores any workspace the resolver returned: unscoped, owner workspace empty", async () => {
    const { defineRoute, database } = setup();
    const save = defineRoute({
      name: "me.update",
      path: "/api/v1/me",
      auth: "user",
      handler: async ({ ctx }) => ({ status: 200, body: { org: ctx.organizationId ?? null } }),
    });
    const response = await save(write({ origin: "https://aft.example" }, "PATCH"), noParams);
    expect(await response.json()).toEqual({ org: null });
    expect(database.runs).toEqual([{ organizationId: undefined, committed: true }]);
    expect([...database.rows.keys()]).toEqual(["user:u1::PATCH /api/v1/me:k1"]);
  });
});

describe("Next.js control flow in routes (AC-9, X26)", () => {
  it("redirect() in a GET commits and rethrows; the access line says ok, no error line", async () => {
    const { defineRoute, database, lines } = setup();
    const open = defineRoute({
      name: "projects.open",
      path: "/api/v1/projects",
      auth: "org",
      handler: async () => redirect("/projects"),
    });
    await expect(open(new Request(url), noParams)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: true }]);
    expect(lines.filter((line) => line.level === "error")).toEqual([]);
    expect(lines.at(-1)).toMatchObject({ result: "ok", status: 307 });
  });

  it("notFound() in a public route is rethrown and logged as not_found", async () => {
    const { defineRoute, lines } = setup();
    const missing = defineRoute({
      name: "things.get",
      path: "/api/v1/things",
      auth: "public",
      handler: async () => notFound(),
    });
    await expect(missing(new Request(url), noParams)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(lines.at(-1)).toMatchObject({ result: "not_found", status: 404 });
  });

  it("in an idempotent write it rolls back and throws outside production", async () => {
    const { defineRoute, database } = setup();
    const go = defineRoute({
      name: "projects.go",
      path: "/api/v1/projects",
      auth: "org",
      handler: async () => redirect("/x"),
    });
    await expect(go(write({ origin: "https://aft.example" }), noParams)).rejects.toThrow(
      "projects.go: an idempotent handler must return data",
    );
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: false }]);
    expect(database.rows.size).toBe(0);
  });

  it("in production it is a 500 problem and an error line", async () => {
    vi.stubEnv("AFT_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    const { defineRoute, database, lines } = setup();
    const go = defineRoute({
      name: "projects.go",
      path: "/api/v1/projects",
      auth: "org",
      handler: async () => redirect("/x"),
    });
    const response = await go(write({ origin: "https://aft.example" }), noParams);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: "internal",
      detail: "Something went wrong",
    });
    expect(database.rows.size).toBe(0);
    expect(lines.filter((line) => line.level === "error")).toHaveLength(1);
  });
});
