import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// The database suites (spec 0011, AC-20): *.db.test.ts only, against TEST_DATABASE_URL, never
// DATABASE_URL. Without it they are skipped, so a local run still passes.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
if (!testDatabaseUrl)
  console.log("@aft/app-web: TEST_DATABASE_URL is not set, so the database tests were skipped.");

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // server-only throws outside Next.js; tests load the empty stub instead (spec 0008, AC-12).
    alias: { "server-only": "@aft/config/stubs/empty" },
  },
  test: {
    // Every run is the test tier (spec 0010).
    setupFiles: ["@aft/config/vitest/env"],
    // Vitest 5.0.5 gives each worker 60 seconds to start; two per workspace stays well inside it (spec 0008, AC-20, I32).
    maxWorkers: 2,
    environment: "node",
    include: testDatabaseUrl ? ["**/*.db.test.ts"] : [],
    exclude: ["e2e/**", "node_modules/**", "**/generated/**", ".next/**"],
    passWithNoTests: true,
    provide: { testDatabaseUrl },
  },
});
