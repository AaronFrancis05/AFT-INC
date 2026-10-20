import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "lib/generated/**", ".next/**"],
    env: {
      // The auth client reads this at import time.
      BETTER_AUTH_URL: "http://localhost:3000",
    },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["app/**", "components/**", "lib/**"],
      exclude: ["lib/generated/**", "components/ui/**", "**/*.test.{ts,tsx}"],
    },
  },
});
