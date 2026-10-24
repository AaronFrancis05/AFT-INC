import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // server-only throws outside Next.js; tests load the empty stub instead (spec 0008, AC-12).
    alias: { "server-only": "@aft/config/stubs/empty" },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "**/generated/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      exclude: ["src/generated/**", "**/*.test.{ts,tsx}"],
    },
  },
});
