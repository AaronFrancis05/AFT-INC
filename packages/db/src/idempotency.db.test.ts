import { randomUUID } from "node:crypto";
import { AppError } from "@aft/core/errors";
import { createLogger } from "@aft/core/log";
import { input, text } from "@aft/core/validate";
import { createRouteWrapper, type ResolvedContext } from "@aft/core/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaErrorMapper } from "./errors";
import { createIdempotencyStore } from "./idempotency";
import { createTenantDb, createTransactionRunner, type OrgDb } from "./tenant";
import { createThrowawaySchema, dropSchema, ensureRoles, testClient } from "./test-db";

// The idempotent write flow against Postgres (spec 0011, AC-4, AC-15, X1, X17 to X19): the real
// store, the real transaction runner, and the real route wrapper with a stub resolver.

const prisma = testClient();
const store = createIdempotencyStore();
const transactions = createTransactionRunner(prisma, createTenantDb(prisma));
let schema: string;

beforeAll(async () => {
  await ensureRoles(prisma);
  schema = await createThrowawaySchema(prisma);
  // The handler's own write, to prove it commits or rolls back with the saved reply.
  await prisma.$executeRawUnsafe(`CREATE TABLE ${schema}.project (title text NOT NULL)`);
});

afterAll(async () => {
  await dropSchema(prisma, schema);
  await prisma.$disconnect();
});

// Each test gets its own caller, so the two workers and the tests never share a key.
function caller(organizationId = `org_${randomUUID()}`): ResolvedContext {
  return { caller: { kind: "user", userId: `u_${randomUUID()}` }, organizationId };
}

function fixture(handler: (tx: OrgDb, title: string) => Promise<void> = insertProject) {
  let context: ResolvedContext | null = caller();
  let runs = 0;
  const defineRoute = createRouteWrapper<OrgDb>({
    logger: createLogger({ service: "web" }),
    resolver: { resolve: async () => context },
    store,
    transactions,
    errorMappers: [prismaErrorMapper],
    allowedOrigins: ["http://localhost"],
  });
  const route = defineRoute({
    name: "projects.create",
    path: "/api/v1/projects",
    auth: "org",
    body: input({ title: text({ max: 50 }) }),
    handler: async ({ body, ctx }) => {
      runs += 1;
      await handler(ctx.db, body.title);
      return { status: 201, body: { title: body.title, run: runs } };
    },
  });
  return {
    call: (title: string, key = "key-1") =>
      route(
        new Request("http://localhost/api/v1/projects", {
          method: "POST",
          body: JSON.stringify({ title }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": key,
            origin: "http://localhost",
          },
        }),
        { params: Promise.resolve({}) },
      ),
    runs: () => runs,
    setCaller: (next: ResolvedContext) => (context = next),
    caller: () => context!,
  };
}

async function insertProject(tx: OrgDb, title: string): Promise<void> {
  await tx.$executeRawUnsafe(`INSERT INTO ${schema}.project VALUES ($1)`, title);
}

async function projects(title: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM ${schema}.project WHERE title = $1`,
    title,
  );
  return rows.length;
}

async function savedRows(userId: string): Promise<number> {
  return prisma.idempotencyRecord.count({ where: { ownerId: userId } });
}

const userIdOf = (context: ResolvedContext) =>
  context.caller.kind === "user" ? context.caller.userId : "";

describe("idempotency_record (AC-15)", () => {
  it("is migrated with timestamptz(3) times, a uuid id, the owner key, and the expiry index", async () => {
    const columns = await prisma.$queryRaw<
      { name: string; type: string; precision: number | null }[]
    >`
      SELECT column_name AS name, data_type AS type, datetime_precision AS precision
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'idempotency_record'`;
    const byName = Object.fromEntries(columns.map((column) => [column.name, column]));
    expect(byName.id?.type).toBe("uuid");
    for (const name of ["createdAt", "expiresAt"])
      expect(byName[name], name).toMatchObject({ type: "timestamp with time zone", precision: 3 });
    const indexes = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'idempotency_record'`;
    const definitions = indexes.map((index) => index.indexdef).join("\n");
    expect(definitions).toMatch(
      /CREATE UNIQUE INDEX \S+ ON public\.idempotency_record USING btree \("ownerKind", "ownerId", "organizationId", scope, key\)/,
    );
    expect(definitions).toContain('USING btree ("expiresAt")');
  });
});

describe("idempotent writes on Postgres (AC-4)", () => {
  it("X1: the handler's write and the saved reply commit together; a repeat replays", async () => {
    const route = fixture();
    const title = `alpha ${randomUUID()}`;
    const first = await route.call(title);
    const second = await route.call(title);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(await second.json()).toEqual(await first.json());
    expect(second.headers.get("idempotent-replayed")).toBe("true");
    expect(route.runs()).toBe(1);
    expect(await projects(title)).toBe(1);
    expect(await savedRows(userIdOf(route.caller()))).toBe(1);
  });

  it("X17: two calls with one key at once: one runs, the other gets 409", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const route = fixture(async (tx, title) => {
      await insertProject(tx, title);
      entered();
      await gate;
    });
    const title = `race ${randomUUID()}`;
    const first = route.call(title);
    await inside;
    const second = await route.call(title);
    release();
    expect(second.status).toBe(409);
    expect(second.headers.get("retry-after")).toBe("1");
    expect((await first).status).toBe(201);
    expect(await projects(title)).toBe(1);
  });

  it("X19: a crash rolls back the write and leaves no row, so a retry runs at once", async () => {
    let crash = true;
    const route = fixture(async (tx, title) => {
      await insertProject(tx, title);
      if (crash) throw new Error("connection reset");
    });
    const title = `crash ${randomUUID()}`;
    expect((await route.call(title)).status).toBe(500);
    expect(await projects(title)).toBe(0);
    expect(await savedRows(userIdOf(route.caller()))).toBe(0);
    crash = false;
    expect((await route.call(title)).status).toBe(201);
    expect(await projects(title)).toBe(1);
  });

  it("X18: the same key with other input gets 422", async () => {
    const route = fixture();
    await route.call(`first ${randomUUID()}`);
    const response = await route.call(`second ${randomUUID()}`);
    expect(response.status).toBe(422);
    expect(route.runs()).toBe(1);
  });

  it("two members of one workspace using the same key both run", async () => {
    const route = fixture();
    const organizationId = `org_${randomUUID()}`;
    const title = `shared ${randomUUID()}`;
    route.setCaller(caller(organizationId));
    await route.call(title);
    route.setCaller(caller(organizationId));
    const other = await route.call(title);
    expect(other.headers.get("idempotent-replayed")).toBeNull();
    expect(route.runs()).toBe(2);
  });

  it("a saved code failure is stored in its own transaction and replayed", async () => {
    const route = fixture(async (tx, title) => {
      await insertProject(tx, title);
      throw new AppError("conflict");
    });
    const title = `taken ${randomUUID()}`;
    const first = await route.call(title);
    expect(first.status).toBe(409);
    const firstBody = await first.json();
    const second = await route.call(`taken again ${randomUUID()}`);
    // A different input under the saved key is a mismatch, not a second run.
    expect(second.status).toBe(422);
    expect(await savedRows(userIdOf(route.caller()))).toBe(1);
    expect(firstBody).toMatchObject({ code: "conflict" });
    // The failed run's own write rolled back.
    expect(await projects(title)).toBe(0);
  });

  it("a row past expiresAt counts as absent, and save replaces it", async () => {
    const id = {
      ownerKind: "user" as const,
      ownerId: `u_${randomUUID()}`,
      organizationId: "",
      scope: "POST /api/v1/projects",
      key: "key-1",
    };
    const then = new Date("2026-10-29T10:00:00.000Z");
    const later = new Date(then.getTime() + 24 * 60 * 60 * 1000);
    await transactions.run(undefined, (tx) =>
      store.save(tx, id, { fingerprint: "f1", status: 201, body: { n: 1 } }, then),
    );
    const before = await transactions.run(undefined, (tx) => store.find(tx, id, then));
    const after = await transactions.run(undefined, (tx) => store.find(tx, id, later));
    expect(before).toEqual({ fingerprint: "f1", status: 201, body: { n: 1 } });
    expect(after).toBeNull();
    await transactions.run(undefined, (tx) =>
      store.save(tx, id, { fingerprint: "f2", status: 204, body: null }, later),
    );
    expect(await transactions.run(undefined, (tx) => store.find(tx, id, later))).toEqual({
      fingerprint: "f2",
      status: 204,
      body: null,
    });
    expect(await savedRows(id.ownerId)).toBe(1);
  });
});
