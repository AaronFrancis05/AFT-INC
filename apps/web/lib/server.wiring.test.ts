// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// What lib/server.ts hands the factories (spec 0011). The session, the origins, and the transaction
// are stand ins, so these run with no Better Auth and no database. Separate from server.test.ts,
// which needs the real modules to prove importing them reads no env.
const { allowedOrigins, resolve, tx } = vi.hoisted(() => ({
  allowedOrigins: vi.fn(async () => ["https://aft.example"]),
  resolve: vi.fn(async () => ({ caller: { kind: "user", userId: "u1" } })),
  tx: {},
}));

vi.mock("@aft/auth/context", () => ({ allowedOrigins, sessionContextResolver: { resolve } }));
vi.mock("@aft/db/tenant", () => ({
  transactionRunner: { run: (_org: unknown, fn: (db: unknown) => unknown) => fn(tx) },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "s=1" }) }));

import { defineAction, defineRoute } from "./server";

const url = "https://aft.example/api/v1/things";
const noParams = { params: Promise.resolve({}) };

afterEach(() => {
  vi.clearAllMocks();
});

describe("lib/server.ts wiring", () => {
  const write = defineRoute({
    name: "things.write",
    path: "/api/v1/things",
    auth: "user",
    handler: async () => ({ status: 204 }),
  });
  const post = (origin: string) => new Request(url, { method: "POST", headers: { origin } });

  it("AC-10: routes check writes against @aft/auth's allowed origins", async () => {
    expect((await write(post("https://evil.example"), noParams)).status).toBe(403);
    // Past the Origin check, the missing Idempotency-Key is the next failure.
    expect((await write(post("https://aft.example"), noParams)).status).toBe(400);
  });

  it("AC-11: routes and actions resolve the caller through the session resolver", async () => {
    const whoami = defineAction({
      name: "things.whoami",
      auth: "user",
      input: (await import("@aft/core/validate")).input({}),
      handler: async ({ ctx }) => ctx.userId,
    });
    expect(await whoami({})).toEqual({ ok: true, data: "u1" });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ mode: "user" }));
  });

  it("AC-8: a Prisma error thrown in a handler goes through the database error mapper", async () => {
    const read = defineRoute({
      name: "things.read",
      path: "/api/v1/things",
      auth: "user",
      handler: async () => {
        throw Object.assign(new Error("gone"), {
          name: "PrismaClientKnownRequestError",
          code: "P2025",
        });
      },
    });
    const response = await read(new Request(url), noParams);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found" });
  });

  it("AC-11: the transaction reaches the handler as ctx.db", async () => {
    const read = defineRoute({
      name: "things.db",
      path: "/api/v1/things",
      auth: "user",
      handler: async ({ ctx }) => ({ status: 200, body: { same: ctx.db === tx } }),
    });
    expect(await (await read(new Request(url), noParams)).json()).toEqual({ same: true });
  });
});
