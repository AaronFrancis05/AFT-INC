import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Shared flat config for every workspace: today's rules, the package boundary rule, and the ignores.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Packages are reached only through their exports map (spec 0008, AC-11).
      "no-restricted-imports": [
        "error",
        {
          // shadcn's registry writes `from "cn"`; @aft/ui keeps one class merger (spec 0008, I29).
          paths: [
            {
              name: "cn",
              message: "Import cn from @aft/ui/lib/utils, not the cn package.",
            },
          ],
          patterns: [
            {
              group: ["@aft/*/src", "@aft/*/src/*"],
              message:
                "Import from the package's exports (for example @aft/auth/server), never its src folder.",
            },
            {
              group: ["@aft/app-web", "@aft/app-web/*"],
              message: "Nothing imports the app; move shared code into a package.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated code and tool output are not linted.
    "**/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  // Type aware promise rules (spec 0009, AC-12). Every workspace runs ESLint from its own folder,
  // so process.cwd() is the workspace whose tsconfig.json includes the file (I41).
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  // Last, so Prettier owns layout and ESLint style rules never fight it (spec 0009, I39).
  prettier,
]);
