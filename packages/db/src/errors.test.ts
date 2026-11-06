import { describe, expect, it } from "vitest";
import { prismaErrorMapper } from "./errors";

// The shape Prisma 7 throws; built by hand so the mapper is checked without a database.
function prismaError(code: string, message = "query failed", originalCode?: string) {
  return Object.assign(new Error(message), {
    name: "PrismaClientKnownRequestError",
    code,
    meta: originalCode ? { driverAdapterError: { cause: { originalCode } } } : {},
  });
}

describe("prismaErrorMapper (AC-2, AC-8)", () => {
  it("maps P2025 (record not found) to not_found", () => {
    expect(prismaErrorMapper(prismaError("P2025"))?.code).toBe("not_found");
  });

  it("maps P2002 (unique) and P2003 (foreign key) to conflict", () => {
    expect(prismaErrorMapper(prismaError("P2002"))?.code).toBe("conflict");
    expect(prismaErrorMapper(prismaError("P2003"))?.code).toBe("conflict");
  });

  it("X15: maps a row level security refusal (42501) to not_found from raw and model queries", () => {
    for (const code of ["P2010", "P2039"]) {
      const mapped = prismaErrorMapper(prismaError(code, "Database error", "42501"));
      expect(mapped?.code, code).toBe("not_found");
      expect(mapped?.message).toBe("Not found");
    }
  });

  it("maps a transaction that could not start within maxWait to unavailable, retry after 1", () => {
    const busy = prismaError(
      "P2028",
      "Transaction API error: Unable to start a transaction in the given time.",
    );
    expect(prismaErrorMapper(busy)).toMatchObject({ code: "unavailable", retryAfterSeconds: 1 });
  });

  it("leaves other transaction errors, other codes, and other errors to the default", () => {
    expect(
      prismaErrorMapper(prismaError("P2028", "Transaction API error: Transaction not found.")),
    ).toBeNull();
    expect(prismaErrorMapper(prismaError("P2010", "Raw query failed", "23514"))).toBeNull();
    expect(prismaErrorMapper(new Error("boom"))).toBeNull();
    expect(prismaErrorMapper({ code: "P2025" })).toBeNull();
  });

  it("keeps the Prisma error as the cause for the log", () => {
    const original = prismaError("P2002");
    expect(prismaErrorMapper(original)?.cause).toBe(original);
  });
});
