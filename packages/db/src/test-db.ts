// Shared setup for the *.db.test.ts suites (spec 0011, AC-1, AC-20): a client on
// TEST_DATABASE_URL, the two NOLOGIN roles, and one throwaway schema per test file, so the two
// Vitest workers never meet. The login must be a superuser (CI's postgres user is).
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { PrismaClient } from "./generated/prisma/client";
import type { OrgDb } from "./tenant";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export const ROLES = ["aft_app", "aft_system"] as const;
export type Role = (typeof ROLES)[number];

export function testClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("testDatabaseUrl") }),
  });
}

// Roles belong to the whole cluster, so both workers may try to make them at once; the advisory
// lock (any fixed number) lets one in at a time.
const ROLES_LOCK = 110_011;

export async function ensureRoles(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // It returns void, which $queryRaw can't read.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ROLES_LOCK})`;
    for (const role of ROLES) {
      const found = await tx.$queryRaw<unknown[]>`SELECT 1 FROM pg_roles WHERE rolname = ${role}`;
      if (found.length === 0) await tx.$executeRawUnsafe(`CREATE ROLE ${role} NOLOGIN`);
    }
  });
}

// The four statements every tenant table gets, written by hand into its migration (spec 0011).
export function tenantPolicyStatements(table: string): string[] {
  return [
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY tenant_isolation ON ${table} TO aft_app, aft_system
      USING ("organizationId" = NULLIF(current_setting('app.org_id', true), ''))
      WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), ''))`,
    `CREATE POLICY system_access ON ${table} TO aft_system
      USING (current_setting('app.system', true) = 'on')`,
  ];
}

// A fresh schema the two roles may use; drop it in afterAll.
export async function createThrowawaySchema(prisma: PrismaClient): Promise<string> {
  const schema = `t_${randomBytes(6).toString("hex")}`;
  await prisma.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA ${schema} TO ${ROLES.join(", ")}`);
  return schema;
}

export async function dropSchema(prisma: PrismaClient, schema: string): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

// Runs the rest of the transaction as the app or worker role, inside the throwaway schema.
export async function actAs(tx: OrgDb, role: Role, schema: string): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
  await tx.$executeRawUnsafe(`SET LOCAL search_path TO ${schema}`);
}
