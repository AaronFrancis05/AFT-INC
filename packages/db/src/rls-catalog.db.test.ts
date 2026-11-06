import type { PrismaClient } from "./generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RLS_ALLOWLIST } from "./rls-allowlist";
import {
  createThrowawaySchema,
  dropSchema,
  ensureRoles,
  tenantPolicyStatements,
  testClient,
} from "./test-db";

// The catalog check (spec 0011, AC-3, X30): every table with an organizationId column has row level
// security enabled and forced, and exactly the standard policies, unless the allow list names it.

type Policy = {
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
};

const prisma = testClient();
let schema: string;
// The standard policies as Postgres stores them, read from a reference table built from the same
// statements a migration uses; comparing stored text avoids matching on whitespace.
let standard: Policy[];

async function policies(db: PrismaClient, onSchema: string, table: string): Promise<Policy[]> {
  return db.$queryRaw<Policy[]>`
    SELECT policyname, permissive, roles::text AS roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = ${onSchema} AND tablename = ${table}
    ORDER BY policyname`;
}

// One line per problem, empty when every tenant table in the schema is protected.
async function problems(db: PrismaClient, onSchema: string): Promise<string[]> {
  const tables = await db.$queryRaw<{ name: string; enabled: boolean; forced: boolean }[]>`
    SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${onSchema} AND c.relkind IN ('r', 'p')
      AND EXISTS (SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organizationId' AND NOT a.attisdropped)
    ORDER BY c.relname`;
  const found: string[] = [];
  for (const table of tables) {
    if (Object.hasOwn(RLS_ALLOWLIST, table.name)) continue;
    if (!table.enabled) found.push(`${table.name}: row level security is not enabled`);
    if (!table.forced) found.push(`${table.name}: row level security is not forced`);
    if (JSON.stringify(await policies(db, onSchema, table.name)) !== JSON.stringify(standard))
      found.push(`${table.name}: policies differ from the standard`);
  }
  return found;
}

beforeAll(async () => {
  await ensureRoles(prisma);
  schema = await createThrowawaySchema(prisma);
  await prisma.$executeRawUnsafe(`CREATE TABLE ${schema}.reference ("organizationId" text)`);
  for (const statement of tenantPolicyStatements(`${schema}.reference`))
    await prisma.$executeRawUnsafe(statement);
  standard = await policies(prisma, schema, "reference");
});

afterAll(async () => {
  await dropSchema(prisma, schema);
  await prisma.$disconnect();
});

describe("row level security catalog (AC-3)", () => {
  it("X30: every tenant table in the migrated public schema is protected", async () => {
    // A database that was never migrated would pass with nothing checked.
    const migrated = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'`;
    expect(migrated, "run prisma migrate deploy on TEST_DATABASE_URL first").toHaveLength(1);
    expect(await problems(prisma, "public")).toEqual([]);
  });

  it("X30: the check itself flags a table without row level security and spares the allow list", async () => {
    const table = (name: string) => `${schema}.${name}`;
    for (const name of ["bare", "enabled_only", "loose_policy", "guarded", "idempotency_record"])
      await prisma.$executeRawUnsafe(`CREATE TABLE ${table(name)} ("organizationId" text)`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${table("enabled_only")} ENABLE ROW LEVEL SECURITY`,
    );
    const [enable, force] = tenantPolicyStatements(table("loose_policy"));
    for (const statement of [enable!, force!]) await prisma.$executeRawUnsafe(statement);
    await prisma.$executeRawUnsafe(
      `CREATE POLICY tenant_isolation ON ${table("loose_policy")} TO aft_app USING (true)`,
    );
    for (const statement of tenantPolicyStatements(table("guarded")))
      await prisma.$executeRawUnsafe(statement);

    expect(await problems(prisma, schema)).toEqual([
      "bare: row level security is not enabled",
      "bare: row level security is not forced",
      "bare: policies differ from the standard",
      "enabled_only: row level security is not forced",
      "enabled_only: policies differ from the standard",
      "loose_policy: policies differ from the standard",
    ]);
  });

  it("every allow list entry gives a reason", () => {
    for (const [name, reason] of Object.entries(RLS_ALLOWLIST))
      expect(reason.trim().length, name).toBeGreaterThan(0);
  });
});
