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

import "./auth-client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every browser file this feature touches: the auth client and the auth components.
function clientSourceFiles() {
  const componentDir = path.join(ROOT, "components", "auth");
  const components = readdirSync(componentDir)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => path.join(componentDir, name));
  return [path.join(ROOT, "lib", "auth-client.ts"), ...components];
}

describe("lib/auth-client.ts", () => {
  it("passes no baseURL, so the browser calls /api/auth on the page's own origin (AC-1)", () => {
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("baseURL");
    expect(created[0].plugins).toEqual([{ id: "email-otp" }]);
  });

  it("no client auth file reads process.env (AC-1)", () => {
    const offenders = clientSourceFiles().filter((file) => readFileSync(file, "utf8").includes("process.env"));

    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("client files import lib/auth-providers for types only, never its values", () => {
    const valueImports = clientSourceFiles().filter((file) =>
      /^import\s+(?!type\b).*from\s+["']@\/lib\/auth-providers["']/m.test(readFileSync(file, "utf8")),
    );

    expect(valueImports.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
