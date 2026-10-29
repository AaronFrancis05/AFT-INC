import "server-only";
import { aftEnv, type Tier } from "@aft/config/env";
import { AppError } from "@aft/core/errors";
import { createLogger, type Logger } from "@aft/core/log";
import type { TransactionRunner } from "@aft/core/server";
import type { Prisma, PrismaClient } from "./generated/prisma/client";

// Tenant scoping (spec 0011, spec 0005 child 0003). Row level security does the filtering: a
// transaction sees a tenant row only when app.org_id names its workspace, or when app.system is on
// under the aft_system login.

// Prisma's transaction client has no $transaction, so a batch or a nested transaction can't be
// written against it.
export type OrgDb = Prisma.TransactionClient;

export type ScopedClient = {
  $transaction<T>(fn: (tx: OrgDb) => Promise<T>): Promise<T>;
};

export type TenantDb = {
  // The way in for code outside the wrappers (workers, scripts): one transaction scoped to orgId.
  forOrg(organizationId: string): ScopedClient;
  // Scopes an open transaction; throws when it is already scoped to another workspace.
  withOrg(tx: OrgDb, organizationId: string): Promise<void>;
  // Widens access only for the aft_system login (the worker), and logs why.
  withSystem(tx: OrgDb, reason: string): Promise<void>;
};

export type TenantDbOptions = {
  // Tests pass their own; otherwise a "db" logger made on first use.
  logger?: Logger;
  // Tests fix the tier; otherwise AFT_ENV, read at the first scoped call.
  tier?: Tier;
};

// One interactive transaction holds one pooled connection; 25 seconds in all stays under any proxy
// timeout, and longer work belongs in a workflow (X5).
export const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;

const BYPASS_MESSAGE = "database login can bypass row level security";

function assertOrganizationId(organizationId: string): void {
  if (typeof organizationId !== "string" || organizationId === "")
    throw new TypeError("organizationId must be a non empty string");
}

export function createTenantDb(prisma: PrismaClient, options: TenantDbOptions = {}): TenantDb {
  const logger = options.logger ?? createLogger({ service: "db" });
  // Whether the login is a superuser or has BYPASSRLS, checked once per client (AC-22, X32).
  let bypass: Promise<boolean> | undefined;

  async function loginCanBypass(tx: OrgDb): Promise<boolean> {
    const [role] = await tx.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    return Boolean(role && (role.rolsuper || role.rolbypassrls));
  }

  async function guardLogin(tx: OrgDb): Promise<void> {
    const tier = options.tier ?? aftEnv();
    bypass ??= loginCanBypass(tx).then(
      (canBypass) => {
        if (canBypass && tier === "production") logger.error(BYPASS_MESSAGE);
        else if (canBypass) logger.warn(BYPASS_MESSAGE);
        return canBypass;
      },
      (error: unknown) => {
        // A failed check is not an answer; the next scoped call asks again.
        bypass = undefined;
        throw error;
      },
    );
    if ((await bypass) && tier === "production") throw new AppError("internal");
  }

  async function withOrg(tx: OrgDb, organizationId: string): Promise<void> {
    assertOrganizationId(organizationId);
    await guardLogin(tx);
    const [current] = await tx.$queryRaw<{ orgId: string | null }[]>`
      SELECT current_setting('app.org_id', true) AS "orgId"`;
    // A setting left from an earlier transaction on this connection reads as "", which is unset.
    if (current?.orgId && current.orgId !== organizationId)
      throw new Error("This transaction is already scoped to another workspace");
    await tx.$queryRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
  }

  async function withSystem(tx: OrgDb, reason: string): Promise<void> {
    await guardLogin(tx);
    await tx.$queryRaw`SELECT set_config('app.system', 'on', true)`;
    logger.info({ reason }, "system access");
  }

  function forOrg(organizationId: string): ScopedClient {
    assertOrganizationId(organizationId);
    return {
      $transaction: (fn) =>
        prisma.$transaction(async (tx) => {
          await withOrg(tx, organizationId);
          return fn(tx);
        }, TRANSACTION_OPTIONS),
    };
  }

  return { forOrg, withOrg, withSystem };
}

// The wrappers' one transaction per call: scoped with withOrg when the call has a workspace.
export function createTransactionRunner(
  prisma: PrismaClient,
  tenant: TenantDb = createTenantDb(prisma),
): TransactionRunner<OrgDb> {
  return {
    run: (organizationId, fn) =>
      organizationId === undefined
        ? prisma.$transaction(fn, TRANSACTION_OPTIONS)
        : tenant.forOrg(organizationId).$transaction(fn),
  };
}

// The same three on the shared client. It is imported on first use, so importing this module reads
// no env and opens nothing.
let shared: Promise<TenantDb> | undefined;

function sharedTenantDb(): Promise<TenantDb> {
  shared ??= import("./index").then(({ default: prisma }) => createTenantDb(prisma));
  return shared;
}

export function forOrg(organizationId: string): ScopedClient {
  assertOrganizationId(organizationId);
  return {
    $transaction: async (fn) => (await sharedTenantDb()).forOrg(organizationId).$transaction(fn),
  };
}

export async function withOrg(tx: OrgDb, organizationId: string): Promise<void> {
  return (await sharedTenantDb()).withOrg(tx, organizationId);
}

export async function withSystem(tx: OrgDb, reason: string): Promise<void> {
  return (await sharedTenantDb()).withSystem(tx, reason);
}
