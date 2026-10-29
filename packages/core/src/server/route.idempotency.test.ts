import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors";
import { createLogger } from "../log";
import { input, text } from "../validate";
import { fakeDatabase, fakeResolver, type FakeTx } from "./fakes.test-support";
import { createRouteWrapper } from "./route";
import type { ResolvedContext } from "./types";

// Signed in routes and idempotency (spec 0011 build step 3), with the in memory store and runner.
const member: ResolvedContext = {
  caller: { kind: "user", userId: "u1" },
  organizationId: "org_a",
};

function setup(context: ResolvedContext | null = member) {
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
    errorMappers: [(error) => (error === "unique" ? new AppError("conflict") : null)],
    allowedOrigins: ["http://localhost"],
  });
  let created = 0;
  const handler = vi.fn(async ({ body, ctx }: { body: { title: string }; ctx: { db: FakeTx } }) => {
    created += 1;
    return {
      status: 201,
      body: { id: `p${created}`, title: body.title, db: ctx.db.organizationId },
    };
  });
  const route = defineRoute({
    name: "projects.create",
    path: "/api/v1/projects",
    auth: "org",
    body: input({ title: text({ max: 50 }) }),
    handler,
  });
  return { lines, route, handler, defineRoute, database, resolver };
}

const url = "http://localhost/api/v1/projects";
const noParams = { params: Promise.resolve({}) };
const post = (body: unknown, key: string | null = "key-1", method = "POST") =>
  new Request(url, {
    method,
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      ...(key === null ? {} : { "idempotency-key": key }),
    },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defineRoute signed in modes (AC-11)", () => {
  it("no caller gets 401 before the body is read, so an oversized body still gets 401", async () => {
    const { route, handler } = setup(null);
    const response = await route(post({ title: "x".repeat(200_000) }), noParams);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("X15: org mode without a workspace gets 404", async () => {
    const { route } = setup({ caller: { kind: "user", userId: "u1" } });
    expect((await route(post({ title: "a" }), noParams)).status).toBe(404);
  });

  it("runs a signed in GET in one transaction scoped to the workspace, with no key needed", async () => {
    const { defineRoute, database, lines } = setup();
    const route = defineRoute({
      name: "projects.list",
      path: "/api/v1/projects",
      auth: "org",
      handler: async ({ ctx }) => ({
        status: 200,
        body: { org: ctx.organizationId, user: ctx.userId, db: ctx.db.organizationId },
      }),
    });
    const response = await route(
      new Request(url, { headers: { "idempotency-key": "" } }),
      noParams,
    );
    expect(await response.json()).toEqual({ org: "org_a", user: "u1", db: "org_a" });
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: true }]);
    expect(lines.at(-1)).toMatchObject({ userId: "u1", organizationId: "org_a", replayed: false });
  });

  it("user mode runs unscoped", async () => {
    const { defineRoute, database } = setup({ caller: { kind: "user", userId: "u1" } });
    const route = defineRoute({
      name: "me.get",
      path: "/api/v1/me",
      auth: "user",
      handler: async () => ({ status: 204 }),
    });
    const response = await route(new Request(url), noParams);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(database.runs).toEqual([{ organizationId: undefined, committed: true }]);
  });
});

describe("Idempotency-Key header (AC-5)", () => {
  it("X1: a signed in POST, PATCH, or DELETE without a valid key gets 400", async () => {
    const { route, handler } = setup();
    for (const [key, method] of [
      [null, "POST"],
      ["", "POST"],
      ["has space", "PATCH"],
      ["x".repeat(256), "DELETE"],
    ] as const) {
      const response = await route(post({ title: "a" }, key, method), noParams);
      expect(response.status, `${method} ${key}`).toBe(400);
      expect(await response.json()).toMatchObject({ code: "bad_request" });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("a public POST needs no key and opens no transaction", async () => {
    const { defineRoute, database } = setup();
    const route = defineRoute({
      name: "hooks.receive",
      path: "/api/v1/hooks",
      auth: "public",
      handler: async () => ({ status: 202 }),
    });
    expect((await route(new Request(url, { method: "POST" }), noParams)).status).toBe(202);
    expect(database.runs).toEqual([]);
  });
});

describe("idempotent writes (AC-4)", () => {
  it("X1: runs once, then replays the saved reply with Idempotent-Replayed and a new request id", async () => {
    const { route, handler, lines } = setup();
    const first = await route(post({ title: "Alpha" }), noParams);
    const second = await route(post({ title: "Alpha" }), noParams);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(second.headers.get("x-request-id")).not.toBe(first.headers.get("x-request-id"));
    expect(second.headers.get("content-type")).toBe("application/json");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(lines.map((line) => [line.status, line.result, line.replayed])).toEqual([
      [201, "ok", false],
      [201, "ok", true],
    ]);
  });

  it("X18: the same key with other input gets 422 and the handler does not run", async () => {
    const { route, handler } = setup();
    await route(post({ title: "Alpha" }), noParams);
    const response = await route(post({ title: "Beta" }), noParams);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "idempotency_mismatch" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("X17: while the same key is running, a second call gets 409 with Retry-After 1", async () => {
    const { defineRoute, database } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const route = defineRoute({
      name: "projects.slow",
      path: "/api/v1/projects",
      auth: "org",
      body: input({ title: text({ max: 50 }) }),
      handler: async () => {
        await gate;
        return { status: 201, body: { id: "p1" } };
      },
    });
    const first = route(post({ title: "Alpha" }), noParams);
    // The first call holds the lock before the second one starts.
    await vi.waitFor(() => expect(database.held.size).toBe(1));
    const second = await route(post({ title: "Other input" }), noParams);
    expect(second.status).toBe(409);
    expect(second.headers.get("retry-after")).toBe("1");
    expect(await second.json()).toMatchObject({ code: "idempotency_in_progress" });
    release();
    expect((await first).status).toBe(201);
  });

  it("X19: a crash rolls back and saves nothing, so a retry runs again at once", async () => {
    const { defineRoute, database } = setup();
    let calls = 0;
    const route = defineRoute({
      name: "projects.flaky",
      path: "/api/v1/projects",
      auth: "org",
      body: input({ title: text({ max: 50 }) }),
      handler: async () => {
        calls += 1;
        if (calls === 1) throw new Error("connection reset");
        return { status: 201, body: { id: "p1" } };
      },
    });
    expect((await route(post({ title: "Alpha" }), noParams)).status).toBe(500);
    expect(database.rows.size).toBe(0);
    expect(database.held.size).toBe(0);
    expect((await route(post({ title: "Alpha" }), noParams)).status).toBe(201);
    expect(calls).toBe(2);
  });

  it("a saved code failure is stored by a second transaction and replayed as a problem", async () => {
    const { defineRoute, database } = setup();
    const handler = vi.fn(async () => Promise.reject("unique"));
    const route = defineRoute({
      name: "projects.taken",
      path: "/api/v1/projects",
      auth: "org",
      body: input({ title: text({ max: 50 }) }),
      handler,
    });
    const first = await route(post({ title: "Alpha" }), noParams);
    const second = await route(post({ title: "Alpha" }), noParams);
    expect([first.status, second.status]).toEqual([409, 409]);
    expect(second.headers.get("content-type")).toBe("application/problem+json");
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    const [firstBody, secondBody] = [await first.json(), await second.json()];
    // The saved body keeps the original requestId.
    expect(secondBody).toEqual(firstBody);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(database.runs.map((run) => run.committed)).toEqual([false, true, true]);
  });

  it("the failure save inserts only if no row exists, so a success saved meanwhile is kept", async () => {
    const { defineRoute, database } = setup();
    const route = defineRoute({
      name: "projects.taken",
      path: "/api/v1/projects",
      auth: "org",
      body: input({ title: text({ max: 50 }) }),
      handler: () => Promise.reject(new AppError("conflict")),
    });
    const success = {
      reply: { fingerprint: "f", status: 201, body: { id: "p9" } },
      expiresAt: Infinity,
    };
    database.hooks.beforeRun = (index) => {
      // Run 0 is the failed call; before its failure save, another call with the key succeeded.
      if (index === 1)
        database.rows.set(
          database.nameOf({
            ownerKind: "user",
            ownerId: "u1",
            organizationId: "org_a",
            scope: "POST /api/v1/projects",
            key: "key-1",
          }),
          success,
        );
    };
    expect((await route(post({ title: "Alpha" }), noParams)).status).toBe(409);
    expect([...database.rows.values()]).toEqual([success]);
  });

  it("never saves busy, rate limited, or 5xx failures", async () => {
    for (const error of [
      new AppError("rate_limited"),
      new AppError("unavailable"),
      new AppError("internal"),
    ]) {
      const { defineRoute, database } = setup();
      const route = defineRoute({
        name: "projects.fails",
        path: "/api/v1/projects",
        auth: "org",
        body: input({ title: text({ max: 50 }) }),
        handler: () => Promise.reject(error),
      });
      await route(post({ title: "Alpha" }), noParams);
      expect(database.rows.size, error.code).toBe(0);
    }
  });

  it("a key belongs to the caller and the workspace: another member's same key runs again", async () => {
    const { route, handler, resolver } = setup();
    await route(post({ title: "Alpha" }), noParams);
    resolver.context = { caller: { kind: "user", userId: "u2" }, organizationId: "org_a" };
    const other = await route(post({ title: "Alpha" }), noParams);
    expect(other.headers.get("idempotent-replayed")).toBeNull();
    resolver.context = { caller: { kind: "user", userId: "u1" }, organizationId: "org_b" };
    await route(post({ title: "Alpha" }), noParams);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it("a row past expiresAt counts as absent and is replaced", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { route, handler, database } = setup();
      vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
      await route(post({ title: "Alpha" }), noParams);
      vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
      const later = await route(post({ title: "Beta" }), noParams);
      expect(later.status).toBe(201);
      expect(await later.json()).toMatchObject({ title: "Beta" });
      expect(handler).toHaveBeenCalledTimes(2);
      expect(database.rows.size).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a reply over 64 KB throws in test, and in production is sent unsaved with an error line", async () => {
    const big = { status: 201, body: { blob: "x".repeat(70_000) } };
    const { defineRoute, database, lines } = setup();
    const route = defineRoute({
      name: "projects.big",
      path: "/api/v1/projects",
      auth: "org",
      body: input({ title: text({ max: 50 }) }),
      handler: async () => big,
    });
    expect((await route(post({ title: "Alpha" }), noParams)).status).toBe(500);
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: false }]);

    vi.stubEnv("AFT_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    const sent = await route(post({ title: "Alpha" }), noParams);
    expect(sent.status).toBe(201);
    expect(database.rows.size).toBe(0);
    expect(database.runs.at(-1)).toEqual({ organizationId: "org_a", committed: true });
    expect(lines.find((line) => line.msg === "idempotent reply too large to save")).toMatchObject({
      level: "error",
      scope: "POST /api/v1/projects",
    });
  });
});
