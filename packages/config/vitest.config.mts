import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vitest 5.0.5 gives each worker 60 seconds to start; two per workspace stays well inside it (spec 0008, AC-20, I32).
    maxWorkers: 2,
    environment: "node",
    // Every run is the test tier (spec 0010).
    setupFiles: ["./vitest/env.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["env/**"],
      exclude: ["**/*.test.{ts,tsx}"],
    },
  },
});
