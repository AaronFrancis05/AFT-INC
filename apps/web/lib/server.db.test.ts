import { randomUUID } from "node:crypto";
import { AppError } from "@aft/core/errors";
import { createLogger } from "@aft/core/log";
import { createActionWrapper, createRouteWrapper, type ResolvedContext } from "@aft/core/server";
import { input, text } from "@aft/core/validate";
import { prismaErrorMapper } from "@aft/db/errors";
import { createIdempotencyStore } from "@aft/db/idempotency";
import { createTenantDb, createTransactionRunner, type OrgDb } from "@aft/db/tenant";
import {
  actAs,
  createThrowawaySchema,
  dropSchema,
  ensureRoles,
  tenantPolicyStatements,
  testClient,
} from "@aft/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The thread (spec 0011 build step 4): a fixture route and a fixture action made with the real
// factories, the real store and transaction runner, and a stub resolver, against Postgres. Every
// call runs as aft_app, so row level security on the probe table does the tenant filtering.
// Verifies AC-2, AC-4, AC-8, AC-11, AC-13.

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const prisma = testClient();
const tenant = createTenantDb(prisma);
const realRunner = createTransactionRunner(prisma, tenant);
let schema: string;

const orgA = randomUUID();
const orgB = randomUUID();
const userA = `u_${randomUUID()}`;
const thingA = randomUUID();
const thingB = randomUUID();

beforeAll(async () => {
  await ensureRoles(prisma);
  schema = await createThrowawaySchema(prisma);
  const thing = `${schema}.thing`;
  for (const statement of [
    `CREATE TABLE ${thing} (id text PRIMARY KEY, "organizationId" text NOT NULL, title text NOT NULL)`,
    ...tenantPolicyStatements(thing),
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${thing} TO aft_app, aft_system`,
    // The app login writes saved replies too (feature 12 grants this on the server).
    `GRANT SELECT, INSERT, UPDATE ON public.idempotency_record TO aft_app`,
    `INSERT INTO ${thing} VALUES ('${thingA}', '${orgA}', 'mine'), ('${thingB}', '${orgB}', 'theirs')`,
  ])
    await prisma.$executeRawUnsafe(statement);
});

afterAll(async () => {
  await prisma.idempotencyRecord.deleteMany({ where: { ownerId: userA } });
  await dropSchema(prisma, schema);
  await prisma.$disconnect();
});

// Repositories as a feature would write them: they take the call's OrgDb and never an org filter.
type Thing = { id: string; title: string };

async function getThing(db: OrgDb, id: string): Promise<Thing> {
  const [row] = await db.$queryRawUnsafe<Thing[]>(
    `SELECT id, title FROM ${schema}.thing WHERE id = $1`,
    id,
  );
  if (!row) throw new AppError("not_found");
  return row;
}

async function renameThing(db: OrgDb, id: string, title: string): Promise<Thing> {
  const [row] = await db.$queryRawUnsafe<Thing[]>(
    `UPDATE ${schema}.thing SET title = $2 WHERE id = $1 RETURNING id, title`,
    id,
    title,
  );
  if (!row) throw new AppError("not_found");
  return row;
}

async function deleteThing(db: OrgDb, id: string): Promise<void> {
  const rows = await db.$queryRawUnsafe<unknown[]>(
    `DELETE FROM ${schema}.thing WHERE id = $1 RETURNING id`,
    id,
  );
  if (rows.length === 0) throw new AppError("not_found");
}

async function createThing(db: OrgDb, organizationId: string, title: string): Promise<Thing> {
  const [row] = await db.$queryRawUnsafe<Thing[]>(
    `INSERT INTO ${schema}.thing VALUES ($1, $2, $3) RETURNING id, title`,
    randomUUID(),
    organizationId,
    title,
  );
  return row!;
}

async function titlesOf(organizationId: string): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ title: string }[]>(
    `SELECT title FROM ${schema}.thing WHERE "organizationId" = $1 ORDER BY title`,
    organizationId,
  );
  return rows.map((row) => row.title);
}

let context: ResolvedContext | null;
let lines: Record<string, unknown>[];

beforeEach(() => {
  context = { caller: { kind: "user", userId: userA }, organizationId: orgA };
  lines = [];
});

const shared = {
  logger: createLogger({
    service: "web",
    level: "info",
    destination: {
      write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>),
    },
  }),
  resolver: { resolve: async () => context },
  store: createIdempotencyStore(),
  // The app's runner, entering aft_app first so the policies apply (the CI login is a superuser).
  transactions: {
    run: <T>(organizationId: string | undefined, fn: (tx: OrgDb) => Promise<T>) =>
      realRunner.run(organizationId, async (tx) => {
        await actAs(tx, "aft_app", schema);
        return fn(tx);
      }),
  },
  errorMappers: [prismaErrorMapper],
};
const defineRoute = createRouteWrapper({ ...shared, allowedOrigins: ["http://localhost"] });
const defineAction = createActionWrapper(shared);

const params = input({ id: z.uuid() });
const getRoute = defineRoute({
  name: "things.get",
  path: "/api/v1/things/[id]",
  auth: "org",
  params,
  handler: async ({ params, ctx }) => ({ status: 200, body: await getThing(ctx.db, params.id) }),
});
const patchRoute = defineRoute({
  name: "things.rename",
  path: "/api/v1/things/[id]",
  auth: "org",
  params,
  body: input({ title: text({ max: 50 }) }),
  handler: async ({ params, body, ctx }) => ({
    status: 200,
    body: await renameThing(ctx.db, params.id, body.title),
  }),
});
const deleteRoute = defineRoute({
  name: "things.delete",
  path: "/api/v1/things/[id]",
  auth: "org",
  params,
  handler: async ({ params, ctx }) => {
    await deleteThing(ctx.db, params.id);
    return { status: 204 };
  },
});
// `into` lets a test try to write into another workspace, which the policy refuses.
const postRoute = defineRoute({
  name: "things.create",
  path: "/api/v1/things",
  auth: "org",
  body: input({ title: text({ max: 50 }), into: z.string().optional() }),
  handler: async ({ body, ctx }) => ({
    status: 201,
    body: await createThing(ctx.db, body.into ?? ctx.organizationId, body.title),
  }),
});
const createAction = defineAction({
  name: "things.create",
  auth: "org",
  idempotent: true,
  input: input({ title: text({ max: 50 }) }),
  handler: async ({ input, ctx }) => createThing(ctx.db, ctx.organizationId, input.title),
});
const renameAction = defineAction({
  name: "things.rename",
  auth: "org",
  input: input({ id: z.uuid(), title: text({ max: 50 }) }),
  handler: async ({ input, ctx }) => renameThing(ctx.db, input.id, input.title),
});

const base = "http://localhost/api/v1/things";
const at = (id: string) => ({ params: Promise.resolve({ id }) });
const send = (method: string, url: string, body?: unknown, key = randomUUID()) =>
  new Request(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "idempotency-key": key,
    },
  });

// A problem body without its per call requestId, to compare two replies.
async function problemOf(response: Response) {
  const { requestId, ...rest } = (await response.json()) as Record<string, unknown>;
  expect(requestId).toBe(response.headers.get("x-request-id"));
  return rest;
}

describe("tenant scope through the wrappers (AC-2, X15, X25)", () => {
  it("reads its own record, and another workspace's reads exactly like a missing one", async () => {
    const own = await getRoute(new Request(`${base}/${thingA}`), at(thingA));
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ id: thingA, title: "mine" });

    const theirs = await getRoute(new Request(`${base}/${thingB}`), at(thingB));
    const missingId = randomUUID();
    const missing = await getRoute(new Request(`${base}/${missingId}`), at(missingId));
    expect(theirs.status).toBe(404);
    expect(theirs.headers.get("content-type")).toBe("application/problem+json");
    expect(await problemOf(theirs)).toEqual(await problemOf(missing));
  });

  it("updating or deleting another workspace's record is 404 and changes nothing", async () => {
    const missingId = randomUUID();
    const rename = await patchRoute(
      send("PATCH", `${base}/${thingB}`, { title: "taken" }),
      at(thingB),
    );
    const renameMissing = await patchRoute(
      send("PATCH", `${base}/${missingId}`, { title: "taken" }),
      at(missingId),
    );
    expect(await problemOf(rename)).toEqual(await problemOf(renameMissing));

    const remove = await deleteRoute(send("DELETE", `${base}/${thingB}`), at(thingB));
    expect(remove.status).toBe(404);
    expect(await titlesOf(orgB)).toEqual(["theirs"]);
  });

  it("an insert into another workspace is refused by the policy (42501) and reads as 404", async () => {
    const response = await postRoute(send("POST", base, { title: "sneaky", into: orgB }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "not_found", detail: "Not found" });
    expect(await titlesOf(orgB)).toEqual(["theirs"]);
    // Mapped, so not a crash.
    expect(lines.filter((line) => line.level === "error")).toEqual([]);
  });

  it("the action shape says the same: not_found for another workspace's record", async () => {
    const theirs = await renameAction({ id: thingB, title: "taken" });
    const missing = await renameAction({ id: randomUUID(), title: "taken" });
    expect(theirs).toMatchObject({ ok: false, error: { code: "not_found", message: "Not found" } });
    if (theirs.ok || missing.ok) throw new Error("expected failures");
    expect({ ...theirs.error, requestId: "" }).toEqual({ ...missing.error, requestId: "" });
    expect(await titlesOf(orgB)).toEqual(["theirs"]);
  });
});

describe("idempotent create, replay, and the access line (AC-4, AC-8, AC-13)", () => {
  it("a route create commits once; the repeat replays it with Idempotent-Replayed", async () => {
    const key = randomUUID();
    const first = await postRoute(send("POST", base, { title: "route one" }, key), {
      params: Promise.resolve({}),
    });
    expect(first.status).toBe(201);
    const created = (await first.json()) as Thing;
    const again = await postRoute(send("POST", base, { title: "route one" }, key), {
      params: Promise.resolve({}),
    });
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(await again.json()).toEqual(created);
    expect(await titlesOf(orgA)).toContain("route one");
    expect((await titlesOf(orgA)).filter((title) => title === "route one")).toHaveLength(1);

    expect(lines.slice(-2)).toEqual([
      expect.objectContaining({
        kind: "route",
        route: "/api/v1/things",
        method: "POST",
        status: 201,
        result: "ok",
        replayed: false,
        userId: userA,
        organizationId: orgA,
      }),
      expect.objectContaining({ status: 201, result: "ok", replayed: true }),
    ]);

    const other = await postRoute(send("POST", base, { title: "route two" }, key), {
      params: Promise.resolve({}),
    });
    expect(other.status).toBe(422);
    expect(await other.json()).toMatchObject({ code: "idempotency_mismatch" });
  });

  it("an action create commits once; the repeat returns replayed: true", async () => {
    const idempotencyKey = randomUUID();
    const first = await createAction({ title: "action one", idempotencyKey });
    expect(first).toMatchObject({ ok: true, data: { title: "action one" } });
    expect(await createAction({ title: "action one", idempotencyKey })).toEqual({
      ...first,
      replayed: true,
    });
    expect((await titlesOf(orgA)).filter((title) => title === "action one")).toHaveLength(1);
    expect(lines.at(-1)).toMatchObject({
      kind: "action",
      action: "things.create",
      status: 200,
      result: "ok",
      replayed: true,
    });
  });

  it("validation fails before any write, with field errors in both shapes", async () => {
    const response = await postRoute(send("POST", base, { title: "", extra: 1 }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "validation_failed",
      errors: expect.arrayContaining([expect.objectContaining({ path: "extra" })]),
    });
    expect(
      await createAction({ title: "x".repeat(51), idempotencyKey: randomUUID() }),
    ).toMatchObject({
      ok: false,
      error: { code: "validation_failed", fieldErrors: { title: [expect.any(String)] } },
    });
  });
});

describe("auth modes (AC-11)", () => {
  it("no caller is 401 for routes and unauthenticated for actions; nothing is written", async () => {
    context = null;
    const response = await postRoute(send("POST", base, { title: "anon" }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(401);
    expect(await createAction({ title: "anon", idempotencyKey: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
    expect(await titlesOf(orgA)).not.toContain("anon");
  });

  it("org mode without a workspace is 404", async () => {
    context = { caller: { kind: "user", userId: userA } };
    const response = await getRoute(new Request(`${base}/${thingA}`), at(thingA));
    expect(response.status).toBe(404);
    expect(await renameAction({ id: thingA, title: "x" })).toMatchObject({
      error: { code: "not_found" },
    });
    expect(await createAction({ title: "homeless", idempotencyKey: randomUUID() })).toMatchObject({
      error: { code: "not_found" },
    });
    expect(lines.filter((line) => line.level === "error")).toEqual([]);
  });
});
