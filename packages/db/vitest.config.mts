import { defineConfig } from "vitest/config";

export default defineConfig({
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
    include: ["**/*.test.{ts,tsx}"],
    // The database suites run only under test:db (vitest.db.config.mts).
    exclude: ["node_modules/**", "**/generated/**", "**/*.db.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      exclude: ["src/generated/**", "src/test-db.ts", "**/*.test.{ts,tsx}"],
    },
  },
});
