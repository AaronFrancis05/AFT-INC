import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Packages are reached only through their exports map (spec 0008, AC-11).
const boundary = {
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
};

// Variables are read only through a package env accessor (spec 0010, AC-13, I53). Next.js sets
// NODE_ENV, NEXT_RUNTIME, and NEXT_PHASE itself, so those stay readable everywhere.
const ENV_MESSAGE =
  "Read variables through your package's env accessor (@aft/<pkg>/env), not process.env (spec 0010).";
const ENV_ALLOWED = "/^(NODE_ENV|NEXT_RUNTIME|NEXT_PHASE)$/";
const PROCESS_ENV =
  "[object.type='MemberExpression'][object.object.name='process'][object.property.name='env']";
const envSyntax = [
  // process.env.X
  {
    selector: `MemberExpression${PROCESS_ENV}[computed=false]:not([property.name=${ENV_ALLOWED}])`,
    message: ENV_MESSAGE,
  },
  // process.env["X"] and process.env[name]
  {
    selector: `MemberExpression${PROCESS_ENV}[computed=true]:not([property.value=${ENV_ALLOWED}])`,
    message: ENV_MESSAGE,
  },
  // process.env passed or stored as a whole (a default parameter, a spread, an argument)
  {
    selector:
      ":not(MemberExpression) > MemberExpression[object.name='process'][property.name='env']",
    message: ENV_MESSAGE,
  },
  // const { env } = process
  {
    selector: "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
    message: ENV_MESSAGE,
  },
];
const envImports = ["node:process", "process"].map((name) => ({
  name,
  importNames: ["env"],
  message: ENV_MESSAGE,
}));

// Files that may read any variable: env modules, config files, scripts, and tests. Paths are
// relative to the workspace, because every workspace runs ESLint from its own folder.
const ENV_READERS = [
  "env.ts",
  "src/env.ts",
  "env/**",
  "scripts/**",
  "vitest/**",
  "**/*.config.{ts,mts,mjs}",
  "**/*.test.{ts,tsx}",
  "e2e/**",
];

// Shared flat config for every workspace: today's rules, the package boundary rule, the env rule,
// and the ignores.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        { ...boundary, paths: [...boundary.paths, ...envImports] },
      ],
      "no-restricted-syntax": ["error", ...envSyntax],
    },
  },
  {
    files: ENV_READERS,
    rules: {
      // Flat config keeps the last setting per rule, so the boundary entries are repeated here.
      "no-restricted-imports": ["error", boundary],
      "no-restricted-syntax": "off",
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
