import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

// Recorded at import time, so it survives any per test mock reset.
const created = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("better-auth/react", () => ({
  createAuthClient: (options: Record<string, unknown>) => {
    created.push(options);
    return {};
  },
}));
vi.mock("better-auth/client/plugins", () => ({ emailOTPClient: () => ({ id: "email-otp" }) }));

import "./index";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every browser entry of this package: the auth client and the form schemas. The app's auth
// components get the same checks in apps/web/components/auth/client-boundary.test.ts.
function clientSourceFiles() {
  const clientDir = path.join(SRC, "client");
  const client = readdirSync(clientDir)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => path.join(clientDir, name));
  return [...client, path.join(SRC, "schemas.ts")];
}

// The names below are kept from before the move (spec 0008, AC-5), so the describe still says lib/auth-client.ts.
describe("lib/auth-client.ts", () => {
  it("passes no baseURL, so the browser calls /api/auth on the page's own origin (AC-1)", () => {
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("baseURL");
    expect(created[0].plugins).toEqual([{ id: "email-otp" }]);
  });

  it("no client auth file reads process.env (AC-1)", () => {
    const offenders = clientSourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("process.env"),
    );

    expect(offenders.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("client files import lib/auth-providers for types only, never its values", () => {
    const valueImports = clientSourceFiles().filter((file) =>
      /^import\s+(?!type\b)(?:[^'"]*?from\s+)?["'](?:\.\.\/server|\.\/server|@aft\/auth\/server)[^"']*["']/m.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(valueImports.map((file) => path.relative(SRC, file))).toEqual([]);
  });

  it("covers 0008 AC-11: the client and schemas entries import nothing from src/server", () => {
    // Type imports count too, and so does the database client.
    const serverImports = clientSourceFiles().filter((file) =>
      /(?:from\s+|import\s+)["'](?:(?:\.\.?\/)+server[^"']*|@aft\/auth\/(?:server|providers)|@aft\/db)["']/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(serverImports.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
