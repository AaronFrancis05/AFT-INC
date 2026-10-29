import { notFound, redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError } from "../errors";
import { createLogger } from "../log";
import { input, text } from "../validate";
import { createActionWrapper } from "./action";
import { fakeDatabase, fakeResolver, type FakeTx } from "./fakes.test-support";
import type { ResolvedContext } from "./types";

// Server actions (spec 0011 build step 4), with the in memory store and runner. headers() needs a
// Next.js request, so the test supplies one.
const requestHeaders = vi.hoisted(() => ({ value: new Headers({ cookie: "session=s1" }) }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

const member: ResolvedContext = {
  caller: { kind: "user", userId: "u1" },
  organizationId: "org_a",
  role: "owner",
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
  const resolve = vi.spyOn(resolver, "resolve");
  const defineAction = createActionWrapper<FakeTx>({
    logger,
    resolver,
    store: database.store,
    transactions: database.transactions,
    errorMappers: [(error) => (error === "unique" ? new AppError("conflict") : null)],
  });
  let created = 0;
  const handler = vi.fn(
    async ({ input, ctx }: { input: { title: string }; ctx: { db: FakeTx } }) => {
      created += 1;
      return { id: `p${created}`, title: input.title, db: ctx.db.organizationId };
    },
  );
  const create = defineAction({
    name: "projects.create",
    auth: "org",
    idempotent: true,
    input: input({ title: text({ max: 50 }) }),
    handler,
  });
  return { lines, create, handler, defineAction, database, resolver, resolve };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defineAction (public)", () => {
  it("covers AC-13: runs the handler without a transaction and writes one access line", async () => {
    const { defineAction, database, lines, resolve } = setup();
    const echo = defineAction({
      name: "echo.say",
      auth: "public",
      input: input({ word: text({ max: 10 }) }),
      handler: async ({ input, ctx }) => ({ said: input.word, hasDb: "db" in ctx }),
    });
    expect(await echo({ word: " hi " })).toEqual({ ok: true, data: { said: "hi", hasDb: false } });
    expect(database.runs).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: "info",
      msg: "request",
      kind: "action",
      action: "echo.say",
      status: 200,
      result: "ok",
      replayed: false,
    });
    expect(lines[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof lines[0]!.durationMs).toBe("number");
    expect(lines[0]).not.toHaveProperty("method");
  });

  it("takes no argument as {} and refuses anything but one plain object", async () => {
    const { defineAction, lines } = setup();
    const ping = defineAction({
      name: "ping",
      auth: "public",
      input: input({}),
      handler: async () => "pong",
    });
    expect(await (ping as () => Promise<unknown>)()).toEqual({ ok: true, data: "pong" });
    const form = new FormData();
    for (const bad of [form, "text", [1], null, new Date()]) {
      const result = await (ping as (args: unknown) => Promise<unknown>)(bad);
      expect(result).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
    expect(lines.at(-1)).toMatchObject({ status: 400, result: "bad_request" });
  });

  it("AC-6: an unknown key is validation_failed with field errors, never a throw", async () => {
    const { defineAction } = setup();
    const echo = defineAction({
      name: "echo.say",
      auth: "public",
      input: input({ word: text({ max: 3 }) }),
      handler: async () => "never",
    });
    const result = await echo({ word: "toolong", extra: 1 } as never);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "validation_failed",
        message: "Some fields are invalid",
        fieldErrors: { word: [expect.any(String)], extra: [expect.any(String)] },
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
  });

  it("a public action can't be declared idempotent (AC-5)", () => {
    const { defineAction } = setup();
    expect(() =>
      defineAction({
        name: "bad.public",
        auth: "public",
        idempotent: true as false,
        input: input({}),
        handler: async () => null,
      }),
    ).toThrow(TypeError);
  });
});

describe("defineAction signed in modes (AC-11)", () => {
  it("passes the request headers to the resolver and runs in one scoped transaction", async () => {
    const { defineAction, database, resolve, lines } = setup();
    const whoami = defineAction({
      name: "me.get",
      auth: "org",
      input: input({}),
      handler: async ({ ctx }) => ({
        user: ctx.userId,
        org: ctx.organizationId,
        role: ctx.role,
        db: ctx.db.organizationId,
        now: ctx.now instanceof Date,
      }),
    });
    expect(await whoami({})).toEqual({
      ok: true,
      data: { user: "u1", org: "org_a", role: "owner", db: "org_a", now: true },
    });
    expect(resolve).toHaveBeenCalledWith({ headers: requestHeaders.value, mode: "org" });
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: true }]);
    expect(lines.at(-1)).toMatchObject({ userId: "u1", organizationId: "org_a", replayed: false });
  });

  it("no session returns unauthenticated, never a redirect, and the input is not read", async () => {
    const { create, handler, lines } = setup(null);
    const result = await create({ title: "x".repeat(500) });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(handler).not.toHaveBeenCalled();
    expect(lines.at(-1)).toMatchObject({ status: 401, result: "unauthenticated" });
  });

  it("org mode without an active workspace (or not a member) is not_found", async () => {
    const { create, handler } = setup({ caller: { kind: "user", userId: "u1" } });
    expect(await create({ title: "a", idempotencyKey: "k" })).toMatchObject({
      ok: false,
      error: { code: "not_found", message: "Not found" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("authorize false is forbidden, before any transaction; it sees the caller but no db", async () => {
    const { defineAction, database } = setup();
    const seen: unknown[] = [];
    const remove = defineAction({
      name: "projects.delete",
      auth: "org",
      input: input({}),
      authorize: (ctx) => {
        seen.push({ role: ctx.role, hasDb: "db" in ctx });
        return ctx.role !== "owner";
      },
      handler: async () => "deleted",
    });
    expect(await remove({})).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(seen).toEqual([{ role: "owner", hasDb: false }]);
    expect(database.runs).toEqual([]);
  });

  it("a mapped library error and a crash come back as values; only the crash logs an error", async () => {
    const { defineAction, lines } = setup();
    const failing = (thrown: unknown) =>
      defineAction({
        name: "projects.fail",
        auth: "user",
        input: input({}),
        handler: async () => {
          throw thrown;
        },
      });
    expect(await failing("unique")({})).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(lines.filter((line) => line.level === "error")).toHaveLength(0);

    const crash = await failing(new Error("db password is hunter2"))({});
    expect(crash).toMatchObject({
      ok: false,
      error: { code: "internal", message: "Something went wrong" },
    });
    expect(JSON.stringify(crash)).not.toContain("hunter2");
    expect(lines.filter((line) => line.level === "error")).toHaveLength(1);

    vi.stubEnv("AFT_ENV", "development");
    expect(await failing(new Error("visible in development"))({})).toMatchObject({
      error: { code: "internal", message: "visible in development" },
    });
  });
});

describe("idempotent actions (AC-4, AC-5)", () => {
  it("X1: an idempotent action without a valid idempotencyKey is bad_request", async () => {
    const { create, handler } = setup();
    for (const key of [undefined, "", "has space", "x".repeat(256), 42]) {
      const result = await create({ title: "a", idempotencyKey: key as string });
      expect(result, String(key)).toMatchObject({ ok: false, error: { code: "bad_request" } });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("X17: a repeat replays the saved result with replayed: true and does not run again", async () => {
    const { create, handler, lines } = setup();
    const first = await create({ title: "Hello", idempotencyKey: "k1" });
    expect(first).toEqual({ ok: true, data: { id: "p1", title: "Hello", db: "org_a" } });
    const second = await create({ title: "Hello", idempotencyKey: "k1" });
    expect(second).toEqual({ ...first, replayed: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(lines.at(-1)).toMatchObject({ replayed: true, result: "ok", status: 200 });
  });

  it("the key is removed before the strict schema, and the fingerprint ignores it", async () => {
    const { create } = setup();
    expect(await create({ title: "a", idempotencyKey: "k1" })).toMatchObject({ ok: true });
    expect(await create({ title: "b", idempotencyKey: "k1" })).toMatchObject({
      ok: false,
      error: { code: "idempotency_mismatch" },
    });
  });

  it("X18: the same key while the first call still runs is idempotency_in_progress", async () => {
    const { create, database } = setup();
    database.hooks.beforeRun = () => {
      database.held.add(
        database.nameOf({
          ownerKind: "user",
          ownerId: "u1",
          organizationId: "org_a",
          scope: "action:projects.create",
          key: "k1",
        }),
      );
    };
    expect(await create({ title: "a", idempotencyKey: "k1" })).toMatchObject({
      ok: false,
      error: { code: "idempotency_in_progress" },
    });
  });

  it("a saved failure replays as the same failure; a crash is never saved", async () => {
    const { defineAction, database } = setup();
    let calls = 0;
    const take = defineAction({
      name: "names.take",
      auth: "user",
      idempotent: true,
      input: input({}),
      handler: async () => {
        calls += 1;
        throw calls === 1 ? new AppError("conflict", "That name is taken") : new Error("boom");
      },
    });
    const first = await take({ idempotencyKey: "k1" });
    expect(first).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await take({ idempotencyKey: "k1" })).toEqual({ ...first, replayed: true });
    expect(calls).toBe(1);

    expect(await take({ idempotencyKey: "k2" })).toMatchObject({ error: { code: "internal" } });
    expect([...database.rows.keys()].filter((name) => name.endsWith(":k2"))).toEqual([]);
  });

  it("the first reply goes through JSON, so it matches what a replay returns", async () => {
    const { defineAction } = setup();
    const stamp = defineAction({
      name: "stamp",
      auth: "user",
      idempotent: true,
      input: input({ at: z.string() }),
      handler: async ({ ctx }) => ({ at: ctx.now, gone: undefined }),
    });
    const first = await stamp({ at: "x", idempotencyKey: "k1" });
    expect(first.ok && typeof first.data.at).toBe("string");
    expect(await stamp({ at: "x", idempotencyKey: "k1" })).toEqual({ ...first, replayed: true });
  });
});

describe("Next.js control flow (AC-9, X26)", () => {
  it("redirect() in a call that is not idempotent commits, then rethrows, logged as ok", async () => {
    const { defineAction, database, lines } = setup();
    const go = defineAction({
      name: "projects.open",
      auth: "org",
      input: input({}),
      handler: async ({ ctx }) => {
        ctx.db.pending.set("write", {
          reply: { fingerprint: "", status: 200, body: null },
          expiresAt: Infinity,
        });
        redirect("/projects/p1");
      },
    });
    await expect(go({})).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(database.runs).toEqual([{ organizationId: "org_a", committed: true }]);
    expect(database.rows.has("write")).toBe(true);
    expect(lines.filter((line) => line.level === "error")).toEqual([]);
    expect(lines.at(-1)).toMatchObject({ status: 307, result: "ok" });
  });

  it("notFound() is rethrown and logged as not_found, also for a public action", async () => {
    const { defineAction, lines } = setup();
    const missing = defineAction({
      name: "page.missing",
      auth: "public",
      input: input({}),
      handler: async () => notFound(),
    });
    await expect(missing({})).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(lines.at(-1)).toMatchObject({ status: 404, result: "not_found" });
  });

  it("control flow wrapped as a cause is still found and rethrown", async () => {
    const { defineAction } = setup();
    const wrapped = defineAction({
      name: "page.wrapped",
      auth: "public",
      input: input({}),
      handler: async () => {
        try {
          notFound();
        } catch (error) {
          throw new Error("wrapped", { cause: error });
        }
      },
    });
    await expect(wrapped({})).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("in an idempotent call it rolls back and throws outside production", async () => {
    const { defineAction, database, lines } = setup();
    const go = defineAction({
      name: "projects.go",
      auth: "user",
      idempotent: true,
      input: input({}),
      handler: async () => redirect("/x"),
    });
    await expect(go({ idempotencyKey: "k1" })).rejects.toThrow(
      "projects.go: an idempotent handler must return data",
    );
    expect(database.runs).toEqual([{ organizationId: undefined, committed: false }]);
    expect(database.rows.size).toBe(0);
    expect(lines.at(-1)).toMatchObject({ status: 500, result: "internal" });
  });

  it("in production it becomes internal, logged as an error, and nothing is saved", async () => {
    vi.stubEnv("AFT_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    const { defineAction, database, lines } = setup();
    const go = defineAction({
      name: "projects.go",
      auth: "user",
      idempotent: true,
      input: input({}),
      handler: async () => redirect("/x"),
    });
    expect(await go({ idempotencyKey: "k1" })).toMatchObject({
      ok: false,
      error: { code: "internal", message: "Something went wrong" },
    });
    expect(database.rows.size).toBe(0);
    expect(lines.filter((line) => line.level === "error")).toHaveLength(1);
  });
});
