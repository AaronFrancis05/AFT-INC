import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "**/generated/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      exclude: ["**/*.test.{ts,tsx}"],
    },
  },
});
