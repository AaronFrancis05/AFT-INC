import { Writable } from "node:stream";
import { createLogger } from "@aft/core/log";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prismaErrorMapper } from "./errors";
import { createTenantDb, type OrgDb } from "./tenant";
import {
  actAs,
  createThrowawaySchema,
  dropSchema,
  ensureRoles,
  tenantPolicyStatements,
  testClient,
} from "./test-db";

const prisma = testClient();
const tenant = createTenantDb(prisma);
let schema: string;

const ORG_A = "org_a";
const ORG_B = "org_b";

beforeAll(async () => {
  await ensureRoles(prisma);
  schema = await createThrowawaySchema(prisma);
  const probe = `${schema}.probe`;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE ${probe} ("id" text PRIMARY KEY, "organizationId" text NOT NULL, "name" text NOT NULL)`,
  );
  for (const statement of tenantPolicyStatements(probe)) await prisma.$executeRawUnsafe(statement);
  await prisma.$executeRawUnsafe(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${probe} TO aft_app, aft_system`,
  );
  // The login is a superuser, so seeding skips the policies.
  await prisma.$executeRawUnsafe(
    `INSERT INTO ${probe} VALUES ('a1', '${ORG_A}', 'first'), ('a2', '${ORG_A}', 'second'), ('b1', '${ORG_B}', 'other')`,
  );
});

afterAll(async () => {
  await dropSchema(prisma, schema);
  await prisma.$disconnect();
});

async function ids(tx: OrgDb): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM probe ORDER BY id`);
  return rows.map((row) => row.id);
}

// The row as stored, read by the superuser login outside any scope.
async function stored(id: string) {
  const rows = await prisma.$queryRawUnsafe<{ organizationId: string; name: string }[]>(
    `SELECT "organizationId", name FROM ${schema}.probe WHERE id = $1`,
    id,
  );
  return rows[0];
}

describe("@aft/db/tenant against Postgres (AC-1)", () => {
  it("X15: with no scope set, the app role sees zero rows and gets no error", async () => {
    const seen = await prisma.$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    expect(seen).toEqual([]);
  });

  it("X15: forOrg reads only its own workspace's rows", async () => {
    const seen = await tenant.forOrg(ORG_A).$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    expect(seen).toEqual(["a1", "a2"]);
  });

  it("X15: an update or delete of another workspace's row touches nothing", async () => {
    const counts = await tenant.forOrg(ORG_A).$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      return [
        await tx.$executeRawUnsafe(`UPDATE probe SET name = 'taken' WHERE id = 'b1'`),
        await tx.$executeRawUnsafe(`DELETE FROM probe WHERE id = 'b1'`),
      ];
    });
    expect(counts).toEqual([0, 0]);
    expect(await stored("b1")).toEqual({ organizationId: ORG_B, name: "other" });
  });

  it("X15, AC-2: an insert into another workspace is refused and maps to not_found", async () => {
    const insert = tenant.forOrg(ORG_A).$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      await tx.$executeRawUnsafe(`INSERT INTO probe VALUES ('b2', '${ORG_B}', 'planted')`);
    });
    const error: unknown = await insert.catch((caught: unknown) => caught);
    expect(prismaErrorMapper(error)?.code).toBe("not_found");
    expect(await stored("b2")).toBeUndefined();
  });

  it("keeps the scope across several statements in one transaction", async () => {
    const result = await tenant.forOrg(ORG_A).$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      const before = await ids(tx);
      await tx.$executeRawUnsafe(`INSERT INTO probe VALUES ('a3', '${ORG_A}', 'third')`);
      const after = await ids(tx);
      await tx.$executeRawUnsafe(`DELETE FROM probe WHERE id = 'a3'`);
      return { before, after };
    });
    expect(result).toEqual({ before: ["a1", "a2"], after: ["a1", "a2", "a3"] });
  });

  it("withOrg scopes an open transaction, and accepts the same workspace again", async () => {
    const seen = await prisma.$transaction(async (tx) => {
      await tenant.withOrg(tx, ORG_B);
      await tenant.withOrg(tx, ORG_B);
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    expect(seen).toEqual(["b1"]);
  });

  it("withOrg throws on a transaction already scoped to another workspace", async () => {
    const rescope = tenant.forOrg(ORG_A).$transaction((tx) => tenant.withOrg(tx, ORG_B));
    await expect(rescope).rejects.toThrow("already scoped to another workspace");
  });

  it("a setting left by an earlier transaction does not leak into the next one", async () => {
    await tenant.forOrg(ORG_A).$transaction(async () => undefined);
    const seen = await prisma.$transaction(async (tx) => {
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    expect(seen).toEqual([]);
  });

  it("refuses an empty workspace id before opening a transaction", () => {
    expect(() => tenant.forOrg("")).toThrow(TypeError);
  });

  it("only aft_system inside withSystem sees every workspace", async () => {
    const seen = await prisma.$transaction(async (tx) => {
      await tenant.withSystem(tx, "probe test");
      await actAs(tx, "aft_system", schema);
      return ids(tx);
    });
    expect(seen).toEqual(["a1", "a2", "b1"]);
  });

  it("aft_system without withSystem sees only its scope", async () => {
    const seen = await tenant.forOrg(ORG_B).$transaction(async (tx) => {
      await actAs(tx, "aft_system", schema);
      return ids(tx);
    });
    expect(seen).toEqual(["b1"]);
  });

  it("aft_app with app.system on sees nothing extra", async () => {
    const unscoped = await prisma.$transaction(async (tx) => {
      await tenant.withSystem(tx, "probe test");
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    const scoped = await tenant.forOrg(ORG_A).$transaction(async (tx) => {
      await tenant.withSystem(tx, "probe test");
      await actAs(tx, "aft_app", schema);
      return ids(tx);
    });
    expect({ unscoped, scoped }).toEqual({ unscoped: [], scoped: ["a1", "a2"] });
  });
});

// Log lines written by a logger, parsed back.
function captureLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  return { lines, logger: createLogger({ service: "db", destination, level: "info" }) };
}

describe("@aft/db/tenant login check (AC-22, X32)", () => {
  beforeAll(async () => {
    const [role] = await prisma.$queryRaw<{ rolsuper: boolean }[]>`
      SELECT rolsuper FROM pg_roles WHERE rolname = current_user`;
    if (!role?.rolsuper) throw new Error("TEST_DATABASE_URL must log in as a superuser");
  });

  it("production refuses every scoped call from a login that can bypass, and logs one error", async () => {
    const { lines, logger } = captureLogger();
    const production = createTenantDb(prisma, { tier: "production", logger });
    const fn = vi.fn(async () => "ran");
    for (let call = 0; call < 2; call++) {
      const error: unknown = await production
        .forOrg(ORG_A)
        .$transaction(fn)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ name: "AppError", code: "internal" });
    }
    const refused = prisma.$transaction((tx) => production.withSystem(tx, "probe test"));
    await expect(refused).rejects.toMatchObject({ code: "internal" });
    expect(fn).not.toHaveBeenCalled();
    expect(lines.map((line) => [line.level, line.msg])).toEqual([
      ["error", "database login can bypass row level security"],
    ]);
  });

  it("development warns once and carries on", async () => {
    const { lines, logger } = captureLogger();
    const development = createTenantDb(prisma, { tier: "development", logger });
    for (let call = 0; call < 2; call++)
      expect(await development.forOrg(ORG_A).$transaction(async () => "ran")).toBe("ran");
    expect(lines.map((line) => [line.level, line.msg])).toEqual([
      ["warn", "database login can bypass row level security"],
    ]);
  });

  it("withSystem logs its reason at info", async () => {
    const { lines, logger } = captureLogger();
    const development = createTenantDb(prisma, { tier: "development", logger });
    await prisma.$transaction((tx) => development.withSystem(tx, "nightly cleanup"));
    expect(lines.at(-1)).toMatchObject({
      level: "info",
      msg: "system access",
      reason: "nightly cleanup",
    });
  });
});
