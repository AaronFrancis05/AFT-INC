import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The same self alias as tsconfig.json, for files shadcn writes with @aft/ui imports.
    alias: [{ find: /^@aft\/ui\/(.*)$/, replacement: `${src}/$1` }],
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["@aft/config/vitest/setup"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "**/generated/**"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      // Primitives are excluded from coverage, as before the move.
      exclude: ["src/components/**", "**/*.test.{ts,tsx}"],
    },
  },
});
