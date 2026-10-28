import { defineConfig } from "vitest/config";

// Root config: only the CI contract test, which reads the workflow files as text (spec 0008, AC-10).
export default defineConfig({
  test: {
    // Every run is the test tier (spec 0010); the root workspace has no @aft/config dependency.
    setupFiles: ["./packages/config/vitest/env.ts"],
    environment: "node",
    include: ["ci.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["ci.test.ts", "scripts/**/*.test.ts"],
    },
  },
});
