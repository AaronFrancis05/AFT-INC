import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// Every auth component that runs in the browser. The auth client itself is checked the same way
// in packages/auth/src/client/index.test.ts; each workspace checks its own files, so a cached
// test result is never stale.
function clientSourceFiles() {
  return readdirSync(DIR)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => path.join(DIR, name));
}

describe("components/auth", () => {
  it("no client auth file reads process.env (AC-1)", () => {
    const offenders = clientSourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("process.env"),
    );

    expect(offenders.map((file) => path.relative(DIR, file))).toEqual([]);
  });

  it("client files import @aft/auth providers, server, or env for types only, never their values", () => {
    // resolveSocialProviders and its types now come from @aft/auth/providers (A11). Only a whole
    // `import type` statement passes: Turbopack can keep `import { type X }` as a real import.
    const valueImports = clientSourceFiles().filter((file) =>
      /^import\s+(?!type\b)(?:[^'"]*?from\s+)?["']@aft\/auth\/(?:env|providers|server)["']/m.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(valueImports.map((file) => path.relative(DIR, file))).toEqual([]);
  });
});
