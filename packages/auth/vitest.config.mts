import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // server-only throws outside Next.js; tests load the empty stub instead (spec 0008, AC-12).
    alias: { "server-only": "@aft/config/stubs/empty" },
  },
  test: {
    // jsdom as before the move, so the test counts hold.
    environment: "jsdom",
    globals: false,
    setupFiles: ["@aft/config/vitest/setup"],
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
