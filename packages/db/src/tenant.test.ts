import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared client is a boundary (it opens connections), so it is a stand in that records when it
// is loaded and runs each transaction callback with a fake transaction client.
const loaded = vi.fn();
const queries: string[] = [];
const fakeTx = {
  $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
    queries.push(strings.join("?").replace(/\s+/g, " ").trim());
    return strings.join("").includes("pg_roles") ? [{ rolsuper: false, rolbypassrls: false }] : [];
  }),
};

vi.mock("./index", () => {
  loaded();
  return {
    default: {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
    },
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  queries.length = 0;
  // Proves the module does not read it: the real client would fail on an empty value.
  vi.stubEnv("DATABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("@aft/db/tenant shared client (AC-1)", () => {
  it("importing the module loads no client and reads no env", async () => {
    const tenant = await import("./tenant");
    tenant.forOrg("org_a");
    expect(loaded).not.toHaveBeenCalled();
  });

  it("forOrg loads the shared client on first use, then checks the login and sets the scope", async () => {
    const { forOrg } = await import("./tenant");
    expect(await forOrg("org_a").$transaction(async () => "ran")).toBe("ran");
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(queries).toEqual([
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      `SELECT current_setting('app.org_id', true) AS "orgId"`,
      "SELECT set_config('app.org_id', ?, true)",
    ]);
  });

  it("checks the login once per client, not per call", async () => {
    const { forOrg } = await import("./tenant");
    await forOrg("org_a").$transaction(async () => undefined);
    await forOrg("org_b").$transaction(async () => undefined);
    expect(queries.filter((query) => query.includes("pg_roles"))).toHaveLength(1);
  });

  it("transactionRunner runs on the shared client, scoped only when given a workspace", async () => {
    const { transactionRunner } = await import("./tenant");
    expect(await transactionRunner.run(undefined, async (tx) => (tx as unknown) === fakeTx)).toBe(
      true,
    );
    expect(queries).toEqual([]);
    await transactionRunner.run("org_a", async () => undefined);
    expect(queries.at(-1)).toBe("SELECT set_config('app.org_id', ?, true)");
    const prisma = (await import("./index")).default;
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      timeout: 20_000,
      maxWait: 5_000,
    });
  });

  it("asks again after a failed login check", async () => {
    const { createTenantDb } = await import("./tenant");
    const prisma = (await import("./index")).default;
    const tenant = createTenantDb(prisma as never);
    fakeTx.$queryRaw.mockRejectedValueOnce(new Error("connection reset"));
    await expect(tenant.forOrg("org_a").$transaction(async () => undefined)).rejects.toThrow(
      "connection reset",
    );
    await tenant.forOrg("org_a").$transaction(async () => undefined);
    expect(queries.filter((query) => query.includes("pg_roles"))).toHaveLength(1);
  });
});
