import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Both constructors are boundaries (a real client opens database connections), so they are stand ins
// that record how they were built.
const adapterArgs = vi.fn();
const clientArgs = vi.fn();
const connect = vi.fn();

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      adapterArgs(options);
    }
  },
}));

vi.mock("./generated/prisma/client", () => ({
  PrismaClient: class {
    $connect = connect;
    constructor(options: unknown) {
      clientArgs(options);
    }
  },
}));

const globalForPrisma = global as unknown as { prisma?: unknown };

async function loadClient() {
  vi.resetModules();
  return (await import("./index")).default;
}

beforeEach(() => {
  delete globalForPrisma.prisma;
  vi.clearAllMocks();
});

afterEach(() => {
  delete globalForPrisma.prisma;
  vi.unstubAllEnvs();
});

describe("@aft/db client", () => {
  it("builds the Postgres adapter from DATABASE_URL and hands it to the client", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/aft_test");
    await loadClient();
    expect(adapterArgs).toHaveBeenCalledWith({
      connectionString: "postgresql://user:pass@localhost:5432/aft_test",
    });
    expect(clientArgs).toHaveBeenCalledTimes(1);
    expect(clientArgs.mock.calls[0]?.[0]).toHaveProperty("adapter");
  });

  it("does not open a connection just by being imported", async () => {
    await loadClient();
    expect(connect).not.toHaveBeenCalled();
  });

  it("outside production, reuses one client across module reloads (hot reload)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const first = await loadClient();
    const second = await loadClient();
    expect(second).toBe(first);
    expect(clientArgs).toHaveBeenCalledTimes(1);
    expect(globalForPrisma.prisma).toBe(first);
  });

  it("reuses a client already stored on the global object instead of building another", async () => {
    const existing = { existing: true };
    globalForPrisma.prisma = existing;
    expect(await loadClient()).toBe(existing);
    expect(clientArgs).not.toHaveBeenCalled();
  });

  it("in production, never stores the client on the global object", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = await loadClient();
    const second = await loadClient();
    expect(globalForPrisma.prisma).toBeUndefined();
    expect(second).not.toBe(first);
    expect(clientArgs).toHaveBeenCalledTimes(2);
  });
});
