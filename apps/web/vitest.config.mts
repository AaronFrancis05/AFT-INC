import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    // server-only throws outside Next.js; tests load the empty stub instead (spec 0008, AC-12).
    alias: { "server-only": "@aft/config/stubs/empty" },
  },
  test: {
    // Vitest 5.0.5 gives each worker 60 seconds to start; two per workspace stays well inside it (spec 0008, AC-20, I32).
    maxWorkers: 2,
    environment: "jsdom",
    globals: false,
    setupFiles: ["@aft/config/vitest/env", "./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "**/generated/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["app/**", "components/**", "lib/**", "hooks/**"],
      exclude: ["**/*.test.{ts,tsx}"],
    },
  },
});
