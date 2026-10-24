# 0008. Move the app into a pnpm and Turborepo monorepo

**Date**: 2026-10-24
**Status**: In Progress

> **Amended 2026-10-25** (during the build, at step 6): `@aft/auth` gains a light `./providers` subpath for `resolveSocialProviders` and its types, so the sign in and sign up pages no longer load Better Auth, Prisma, and Resend just to list providers. It is guarded with `server-only`. Client components import the `SocialProvider` type from it. The client boundary tests are split so each workspace scans its own files. Changed: AC-12, *Import rules*, *Package contents*, *Key invariants*, build plan step 6. Also corrected to match the build: `loadEnvConfig` passes `forceReload` (`true`), because Next.js has already loaded and cached env files from `apps/web` when `next.config.ts` runs (AC-13), and `server-only` is in the catalog (AC-15). Why: [rationale.md](rationale.md#amendment-2026-10-25-a-light-providers-entry).

## Summary

This spec moves today's single Next.js app into `apps/web` and pulls the shared code into five packages (`config`, `db`, `auth`, `ui`, `email`), with no change in what users see. It is step 1 of the path to live in spec 0007, and every later app (`apps/auth`, `apps/worker`) needs it first. The layout and tools were already chosen in spec 0005 child 0001 (pnpm workspaces plus Turborepo, packages shipped as TypeScript source); this spec settles how the move is done, what goes where, and how you prove nothing broke.

Scope feature 4 · GA · build approach Tracer Bullet · one PR with milestone commits.

## Requirements

**User stories**:
- As the engineer, I want the app and its shared code split into workspaces, so that `apps/auth` and `apps/worker` can reuse the database, auth, email, and UI code without copying it.
- As a user of the site, I want every page and sign in flow to work exactly as before, so that the move is invisible to me.
- As the engineer, I want one command to lint, typecheck, test, and build everything, with a cache, so that CI stays fast as apps are added.

**Acceptance criteria**:
- **AC-1**: The repo installs with pnpm 12.15.0 (pinned in the root `packageManager` field) using `pnpm install --frozen-lockfile`. `package-lock.json` is deleted and `pnpm-lock.yaml` is created with `pnpm import` from it. Every direct dependency resolves to the same version it had under npm (compare `npm ls --depth=0` taken before the move with `pnpm -r list --depth=0` after), and after each later step the resolved versions of `next`, `react`, `react-dom`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, and `better-auth` in `pnpm-lock.yaml` still equal the step 0 baseline. Node stays 24 (`.nvmrc`, `engines`).
- **AC-2**: The layout is exactly: `apps/web` (package `@aft/app-web`), `packages/config` (`@aft/config`), `packages/db` (`@aft/db`), `packages/auth` (`@aft/auth`), `packages/ui` (`@aft/ui`), `packages/email` (`@aft/email`), plus the existing `infra/`, `docs/`, `.github/`, `.claude/`, `.idea/`. Every root file lands where the *File moves* table says. No app source stays at the root.
- **AC-3**: `turbo.json` (Turborepo 2.11.10, pinned in root `devDependencies`) defines the tasks in the *Turborepo tasks* table. From a fresh clone with no `.env` at all, `pnpm install` then `pnpm turbo run lint typecheck test build` passes with only the CI placeholder variables exported (*CI placeholders*), and with no other step. `db:generate` runs before `typecheck`, `test`, `test:coverage`, `build`, and `dev` of `@aft/db` and of every workspace that depends on it.
- **AC-4**: `prisma/migrations/**` and `migration_lock.toml` move to `packages/db/prisma/` byte for byte (`git diff -M100% --stat main` lists each as a rename). `schema.prisma` moves as a rename whose only change is the generator line `output = "../src/generated/prisma"`. `pnpm --filter @aft/db exec prisma migrate status` against the dev database reports the two existing migrations as applied and nothing pending. The generated client is written to `packages/db/src/generated/prisma`, is gitignored, and `lib/generated/prisma` is removed from git with `git rm` (I18, I23).
- **AC-5**: Behavior is unchanged. Every test that passes on `main` before the move (100 today) passes after it under the same `it(...)` name, except the `ci.test.ts` tests listed under *Renamed CI contract tests*, and the total count is not lower. The Playwright smoke (`apps/web/e2e/smoke.spec.ts`) passes. A manual run on `next dev` against the dev database passes: sign up, OTP verify, sign in, dashboard, sign out, forgot password and reset (the old password then fails), and the start of the Google redirect. The OTP line prints only under `next dev` (A3), and social buttons appear only for fully configured providers (A11).
- **AC-6**: Every route keeps its URL and rendering mode: the route table printed by `next build` lists the same routes as on `main`, and `/auth/sign-in` and `/auth/sign-up` stay dynamic (`ƒ`).
- **AC-7**: CI keeps exactly the six jobs `test`, `typecheck`, `lint`, `prisma`, `build-smoke`, `audit`, each job ID equal to its name, so branch protection needs no change. The jobs run the commands in *CI changes*. The setup action follows *Setup action*. No job reads a secret, and every checkout sets `persist-credentials: false` (I6).
- **AC-8**: Dependency build scripts are approved in `pnpm-workspace.yaml` `allowBuilds` with the same decisions npm had: `@prisma/engines`, `prisma`, `esbuild`, `sharp`, `unrs-resolver` set to `true`, `msw` set to `false`. `strictDepBuilds` stays on (the default), so a new unreviewed build script fails `pnpm install` locally and in CI (I21). `package.json` `allowScripts` and the setup action's "Check install scripts are reviewed" step are removed.
- **AC-9**: The `audit` job runs `pnpm audit --prod --audit-level high` and fails on any high or critical advisory in runtime dependencies. Advisories with no available fix are allowlisted only in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`, each preceded by a comment with the reason and a review date (empty today). `audit-ci`, `audit-ci.jsonc`, and the `audit-ci` dev dependency are removed.
- **AC-10**: `ci.test.ts` stays at the repo root and runs through the root scripts `test:root` and `test:root:coverage`, which Turborepo runs as the root tasks `//#test:root` and `//#test:root:coverage`, with a root `vitest.config.mts` that includes only `ci.test.ts`. Its checks are updated in the same PR (see *Renamed CI contract tests*). It still fails if a required job, `persist-credentials: false`, the I6 rules, `allowBuilds`, or the pinned `packageManager` is removed.
- **AC-11**: Packages expose code only through their `package.json` `exports` map (*Package contents*). Importing a path that is not exported, or anything matching `@aft/*/src/*`, fails `pnpm turbo run lint` through a `no-restricted-imports` pattern in `@aft/config/eslint`. No package imports `@aft/app-web`, and no file under `packages/` imports `@/` (the gate `git grep -n '"@/' -- packages` returns nothing, checked by a test in `ci.test.ts`). `@aft/auth/client` and `@aft/auth/schemas` import nothing from `packages/auth/src/server/`.
- **AC-12**: `@aft/db` (its main entry), `@aft/auth/server`, and `@aft/auth/providers` begin with `import "server-only"`, and both packages declare `server-only` as a dependency. A `'use client'` file that imports either one fails `next build` (I20). Every Vitest config that can load them (web, auth, db) aliases `server-only` to `@aft/config/stubs/empty`, so tests still run. Any later Node runtime that is not Next.js (tsup bundles, `tsx` scripts) uses the same alias; `apps/worker` inherits this rule.
- **AC-13**: There is one `.env`, at the repo root (still gitignored), and `.env.example` stays at the root. `apps/web/next.config.ts` calls `loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true)` from `@next/env`; `packages/db/prisma.config.ts` loads it with `dotenv` `config({ path })`. Both compute the root from `fileURLToPath(import.meta.url)`, and a missing `.env` is not an error. Running `pnpm dev` from the root or from `apps/web` both see the values.
- **AC-14**: `turbo.json` runs in strict env mode with `globalEnv` listing the nine variables from `.env.example` (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`) plus `NODE_ENV`, `globalPassThroughEnv` listing `CI`, `PORT`, `HOME`, `PLAYWRIGHT_BROWSERS_PATH`, and `NEXT_TELEMETRY_DISABLED`, and `.env` in `globalDependencies`. Changing any listed variable in the shell, or any byte of `.env`, misses the cache for `build` (I22).
- **AC-15**: Every dependency used by more than one workspace is pinned once through `catalog:` in `pnpm-workspace.yaml` (*Workspace file*), and every workspace references it as `catalog:`. `pnpm why react` shows a single version (I25).
- **AC-16**: `packages/ui` follows shadcn's monorepo layout with the `components.json` aliases in *shadcn setup* (style `radix-lyra`, icon library `phosphor`, base color `neutral`, unchanged). Running `pnpm dlx shadcn@4.22.1 add <component>` in `apps/web` writes the primitive into `packages/ui/src/components/`, with imports that pass AC-11 without hand edits.
- **AC-17**: `apps/web/next.config.ts` sets `transpilePackages` to `["@aft/auth", "@aft/db", "@aft/email", "@aft/ui"]` and sets `turbopack.root` and `outputFileTracingRoot` to the same absolute repo root, so `next build` prints no workspace root or multiple lockfile warning, and feature 9's standalone output can trace package files.
- **AC-18**: Before the first move commit, no branch other than `main` and this feature's branch has unmerged work and no other pull request is open (each was merged, rebased and merged, or closed by the engineer), and `ListAgents` plus `git reflog -5` show no other session working in the checkout (I24).
- **AC-19**: Tailwind still produces every class used inside `packages/ui`: the built CSS from `next build` contains a rule for `size-9` (used only in `packages/ui/src/components/button.tsx`), and the dashboard sidebar renders with the same styles as on `main`.

## Decision

**Chosen option**: Option 1: Move in place in one PR, in green milestone commits.

Convert the existing repo to pnpm 12.15.0 plus Turborepo 2.11.10, move the app into `apps/web` with `git mv`, then extract `config`, `db`, `email`, `auth`, and `ui` one commit at a time, each commit passing lint, typecheck, and tests. Generate the Prisma client instead of committing it, guard server code with `server-only`, keep one root `.env`, swap `audit-ci` for `pnpm audit`, and keep the six CI check names.

**Implementation skills**: `pnpm` (`.claude/skills/pnpm/`) · `turborepo` (`.claude/skills/turborepo/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

## Feature design

### File moves

Every move uses `git mv`. "Rewrite imports" means the import rules below.

| From (root) | To |
|---|---|
| `app/**` (incl. `app/api/auth/[...all]/route.ts`), `public/**`, `e2e/**` | `apps/web/` same subpath |
| `components/auth/**`, `components/dashboard/**`, `components/nav/**`, `components/icons.tsx` | `apps/web/components/` same subpath |
| `hooks/use-session-storage-value.ts` (+ test) | `apps/web/hooks/` |
| `lib/constant.ts` | `apps/web/lib/constant.ts` |
| `next.config.ts`, `postcss.config.mjs`, `playwright.config.ts`, `vitest.setup.ts`, `components.json` | `apps/web/` (edited per this spec) |
| `vitest.config.mts`, `eslint.config.mjs`, `tsconfig.json` | `apps/web/` (edited); a new root `vitest.config.mts` and `tsconfig.json` are created |
| `components/ui/**` | `packages/ui/src/components/` |
| `lib/utils.ts` | `packages/ui/src/lib/utils.ts` |
| `hooks/use-mobile.ts` (+ test) | `packages/ui/src/hooks/use-mobile.ts` |
| theme part of `app/globals.css` (Tailwind and plugin imports, `@theme`, `:root` and `.dark` tokens, base layer) | `packages/ui/src/styles/globals.css`; the rest stays in `apps/web/app/globals.css` |
| `components/emails/otp-template.tsx`, `reset-password-template.tsx` | `packages/email/src/templates/` |
| `lib/email.tsx` | `packages/email/src/send.tsx` |
| `lib/auth.ts`, `lib/auth-providers.ts`, `lib/auth-otp.ts` (+ tests) | `packages/auth/src/server/` |
| `lib/auth-client.ts` (+ test) | `packages/auth/src/client/index.ts` (+ test beside it) |
| `lib/auth-schemas.ts` (+ test) | `packages/auth/src/schemas.ts` |
| `lib/prisma.ts` | `packages/db/src/index.ts` |
| `prisma/**`, `prisma.config.ts` | `packages/db/prisma/**`, `packages/db/prisma.config.ts` |
| `lib/generated/prisma/**` | deleted with `git rm` |
| `package-lock.json`, `audit-ci.jsonc` | deleted |
| `ci.test.ts`, `.env.example`, `.nvmrc`, `.gitattributes`, `.gitignore`, `.mcp.json`, `skills-lock.json`, `test-preferences.json`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `PLAN.md`, `infra/**`, `docs/**`, `.github/**`, `.claude/**`, `.idea/**` | stay at the root |
| `next-env.d.ts`, `tsconfig.tsbuildinfo` (both untracked, generated) | regenerate in `apps/web/`; delete the root copies |

### Import rules

| Was | Becomes (in `apps/web`) |
|---|---|
| `@/lib/auth` | `@aft/auth/server` |
| `@/lib/auth-client` | `@aft/auth/client` |
| `@/lib/auth-schemas` | `@aft/auth/schemas` |
| `@/lib/auth-providers` (values, in the server pages) | `@aft/auth/providers` |
| `@/lib/auth-providers` (types, in client components) | `import type … from "@aft/auth/providers"` (erased, so A11 holds) |
| `@/lib/prisma` | `@aft/db` |
| `@/components/ui/<x>` | `@aft/ui/components/<x>` |
| `@/lib/utils` | `@aft/ui/lib/utils` |
| `@/hooks/use-mobile` | `@aft/ui/hooks/use-mobile` |
| `@/components/emails/*`, `@/lib/email` | `@aft/email` |
| any other `@/…` | unchanged, `@/*` now maps to `apps/web/*` |

Inside packages, every `@/` import becomes relative: in `packages/ui`, `@/lib/utils` → `../lib/utils` and `@/components/ui/button` → `./button`; in `packages/email`, the templates → `./templates/<name>`; in `packages/auth/src/server`, `./prisma` → `@aft/db` and `./email` → `@aft/email`. Every `vi.mock(...)` specifier is rewritten to the exact specifier the code under test now imports (for example `vi.mock("@/lib/auth-client")` → `vi.mock("@aft/auth/client")`, and `vi.mock("./prisma")` in `auth.test.ts` → `vi.mock("@aft/db")`). `it(...)` names do not change.

### Package contents

| Package | `exports` | `dependencies` | `peerDependencies` | `devDependencies` |
|---|---|---|---|---|
| `@aft/config` | `./tsconfig/base.json`, `./tsconfig/nextjs.json`, `./tsconfig/library.json`, `./eslint` (→ `eslint/index.mjs`), `./vitest/setup` (→ `vitest/setup.ts`, jest-dom plus cleanup), `./stubs/empty` (→ `stubs/empty.ts`) | `eslint-config-next` | `eslint`, `vitest`, `@testing-library/jest-dom`, `@testing-library/react` | none |
| `@aft/db` | `.` → `src/index.ts` (default export `prisma`; Prisma model types re-exported with `export type` only) | `@prisma/client`, `@prisma/adapter-pg`, `pg`, `server-only` | none | `prisma`, `dotenv`, `@types/pg`, `@aft/config`, `typescript`, `vitest` |
| `@aft/email` | `.` → `src/index.ts` (`sendVerificationEmail`, `sendResetPasswordEmail`, `OTPTemplate`, `ResetPasswordTemplate`) | `@react-email/components`, `resend` | `react` | `@aft/config`, `typescript`, `vitest`, `@types/react` |
| `@aft/auth` | `./server` → `src/server/index.ts` (`auth`, `resolveSocialProviders`, `warnMissingSocialProviders`, their types), `./providers` → `src/server/auth-providers.ts` (`resolveSocialProviders`, `warnMissingSocialProviders`, `SocialProvider`, `ResolvedSocialProviders`; imports nothing but `server-only`; `./server` re-exports these names from this same file, never a copy, so the types cannot drift), `./client` → `src/client/index.ts` (`authClient`), `./schemas` → `src/schemas.ts` | `@aft/db`, `@aft/email` (both `workspace:*`), `better-auth`, `zod`, `server-only` | `react` | `@aft/config`, `typescript`, `vitest`, `jsdom`, `@vitejs/plugin-react`, `@testing-library/*` |
| `@aft/ui` | `./components/*` → `src/components/*.tsx`, `./lib/utils` → `src/lib/utils.ts`, `./hooks/*` → `src/hooks/*.ts`, `./globals.css` → `src/styles/globals.css` | `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `shadcn` (its `tailwind.css`), `input-otp`, `sonner`, `@phosphor-icons/react`, `lucide-react` | `react`, `react-dom` | `@aft/config`, `typescript`, `vitest`, `jsdom`, `@vitejs/plugin-react`, `@testing-library/*`, `tailwindcss` |
| `@aft/app-web` | none (never imported) | `next`, `@next/env`, `react`, `react-dom`, `better-auth` (for `better-auth/next-js` in the route handler), `react-hook-form`, `@hookform/resolvers`, `zod`, `sonner`, `@phosphor-icons/react`, `lucide-react`, the five `@aft/*` as `workspace:*` | none | `@aft/config`, `@tailwindcss/postcss`, `tailwindcss`, `@playwright/test`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `@testing-library/*`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `typescript` |
| root | none | none | none | `turbo`, `vitest`, `@vitest/coverage-v8`, `typescript`, `@types/node`, `shadcn` (kept for the CI contract test, AC-10) |

Each workspace declares only what its files import (I19); `@aft/*` packages that other packages import are listed as `workspace:*`. Dependency direction: `config` imports nothing; `db` and `email` import nothing internal; `auth` imports `db` and `email`; `ui` imports nothing internal; `app-web` may import all five. Peer `react` and `react-dom` keep one React instance.

### shadcn setup

| Key | `apps/web/components.json` | `packages/ui/components.json` |
|---|---|---|
| `tailwind.css` | `app/globals.css` | `src/styles/globals.css` |
| `aliases.components` | `@/components` | `@aft/ui/components` |
| `aliases.ui` | `@aft/ui/components` | `@aft/ui/components` |
| `aliases.utils` | `@aft/ui/lib/utils` | `@aft/ui/lib/utils` |
| `aliases.hooks` | `@/hooks` | `@aft/ui/hooks` |
| `aliases.lib` | `@/lib` | `@aft/ui/lib` |

Inside `packages/ui`, the `@aft/ui/*` self imports that shadcn writes resolve through a `paths` entry in `packages/ui/tsconfig.json` (`"@aft/ui/*": ["./src/*"]`) and the same alias in `packages/ui/vitest.config.mts`. After `add`, the builder runs the relative rewrite from *Import rules* only if the generated file breaks AC-11; the `git grep` gate catches a miss.

### Tailwind

`packages/ui/src/styles/globals.css` holds `@import "tailwindcss";`, `@import "tw-animate-css";`, `@import "shadcn/tailwind.css";`, `@source "../../src";` (the ui sources, relative to this CSS file), the `@custom-variant`, `@theme inline`, `:root` and `.dark` token blocks, and the base layer, all moved unchanged from today's `app/globals.css`. `apps/web/app/globals.css` begins with `@import "@aft/ui/globals.css";` followed by whatever app specific CSS remains. `apps/web/postcss.config.mjs` stays as is. AC-19 checks the result.

### Workspace file

`pnpm-workspace.yaml` holds, in full:
- `packages`: `apps/*`, `packages/*`
- `catalog`: every dependency used by more than one workspace, at the exact version `package-lock.json` resolves on `main` at step 0: `react`, `react-dom`, `next`, `better-auth`, `zod`, `sonner`, `@phosphor-icons/react`, `lucide-react`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint`, `eslint-config-next`, `vitest`, `@vitest/coverage-v8`, `jsdom`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `tailwindcss`, `@tailwindcss/postcss`, `shadcn`, `server-only`
- `allowBuilds`: as in AC-8
- `auditConfig.ignoreGhsas`: empty list (AC-9)
- nothing else: `nodeLinker` stays default (isolated), `strictDepBuilds` stays default (on), no hoisting settings

### Workspace scripts

| Workspace | Scripts |
|---|---|
| root | `build`: `turbo run build` · `dev`: `turbo run dev` · `lint`: `turbo run lint` · `typecheck`: `turbo run typecheck` · `test`: `turbo run test` · `test:coverage`: `turbo run test:coverage` · `test:root`: `vitest run` · `test:root:coverage`: `vitest run --coverage` |
| `apps/web` | `dev`: `next dev` · `build`: `next build` · `start`: `next start` · `lint`: `eslint . --max-warnings=0` · `typecheck`: `next typegen && tsc --noEmit` · `test`: `vitest run` · `test:watch`: `vitest` · `test:coverage`: `vitest run --coverage` · `test:e2e`: `playwright test` |
| `packages/db` | `db:generate`: `prisma generate` · `db:migrate`: `prisma migrate dev` · `db:deploy`: `prisma migrate deploy` · `db:studio`: `prisma studio` · `lint`, `typecheck` (`tsc --noEmit`), `test` and `test:coverage` (both with `--passWithNoTests`) |
| `packages/auth`, `packages/ui`, `packages/email` | `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run --passWithNoTests`), `test:coverage` (`vitest run --coverage --passWithNoTests`) |
| `packages/config` | `lint` only |

The root never defines a `test` script that calls `vitest`, so `turbo run test` can never recurse into itself.

### TypeScript

| File | Settings |
|---|---|
| `@aft/config/tsconfig/base.json` | today's `compilerOptions` minus Next specifics: `target` `ES2017`, `lib` `["dom", "dom.iterable", "esnext"]`, `strict`, `noEmit`, `skipLibCheck`, `esModuleInterop`, `module` `esnext`, `moduleResolution` `bundler`, `resolveJsonModule`, `isolatedModules`, `jsx` `react-jsx` |
| `@aft/config/tsconfig/nextjs.json` | extends base; adds `allowJs`, `incremental`, `plugins: [{ "name": "next" }]` |
| `@aft/config/tsconfig/library.json` | extends base |
| `apps/web/tsconfig.json` | extends `@aft/config/tsconfig/nextjs.json`; `paths` `{"@/*": ["./*"]}`; `include` today's list (`next-env.d.ts`, `**/*.ts`, `**/*.tsx`, `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, `**/*.mts`); `exclude` `node_modules` |
| `packages/*/tsconfig.json` | extends `@aft/config/tsconfig/library.json`; `include` `["src", "*.ts", "*.mts"]`; `packages/db` also includes `src/generated` (typechecked on purpose); `packages/ui` adds its self alias `paths` |
| root `tsconfig.json` | extends base; `include` `["ci.test.ts", "vitest.config.mts"]` only |

### Vitest

| Workspace | Environment | Plugins | Setup | Coverage `include` / `exclude` |
|---|---|---|---|---|
| `apps/web` | jsdom | `vite-tsconfig-paths`, `@vitejs/plugin-react` | `./vitest.setup.ts` (imports `@aft/config/vitest/setup`) | `app/**`, `components/**`, `lib/**`, `hooks/**` / tests |
| `packages/ui` | jsdom | `@vitejs/plugin-react` | `@aft/config/vitest/setup` | `src/**` / `src/components/**` (primitives, excluded as today), tests |
| `packages/auth` | jsdom (as today, so counts hold) | `@vitejs/plugin-react` | `@aft/config/vitest/setup` | `src/**` / tests |
| `packages/db`, `packages/email` | node | none | none | `src/**` / `src/generated/**`, tests |
| root | node | none | none | coverage off for `test:root:coverage` beyond the default reporter |

Every config sets `reporter: ["text-summary", "lcov"]` for coverage, writes to its own `coverage/`, and aliases `server-only` to `@aft/config/stubs/empty` (web, auth, db). Excludes stay as today: `e2e/**`, `node_modules/**`, `.next/**`, `**/generated/**`.

### Turborepo tasks

| Task | `dependsOn` | `inputs` | `outputs` | `cache` |
|---|---|---|---|---|
| `db:generate` | none | `prisma/**`, `prisma.config.ts` | `src/generated/**` | on |
| `typecheck` | `db:generate`, `^db:generate` | default | none | on |
| `lint` | none | default | none | on |
| `test`, `test:coverage` | `db:generate`, `^db:generate` | default | `coverage/**` | on |
| `build` | `db:generate`, `^db:generate`, `^build` | `$TURBO_DEFAULT$` | `.next/**`, `!.next/cache/**` | on |
| `test:e2e` | `build` | default | `playwright-report/**`, `test-results/**` | **off** |
| `dev` | `db:generate`, `^db:generate` | none | none | off, `persistent: true` |
| `//#test:root`, `//#test:root:coverage` | none | `ci.test.ts`, `.github/**`, `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `packages/**` | none | on |

The two `db:generate` entries do different jobs: `db:generate` runs `@aft/db`'s own generate before its own tasks (in other workspaces it does not exist and is skipped), and `^db:generate` runs it in every dependency, which reaches `@aft/db` only when a workspace lists it in `dependencies`. `@aft/auth` and `@aft/app-web` list it, so their tasks wait for it. Packages have no `build` script, so `^build` only orders apps. Env settings are in AC-14. Every edit to `.env` misses every cache, which is accepted. Remote cache stays off (spec 0005 child 0001).

### CI placeholders

The workflow sets these at the top level `env:` for every job (none is a secret, I6): `DATABASE_URL: postgresql://postgres:postgres@localhost:5432/aft_ci`, `BETTER_AUTH_SECRET: ci-only-not-a-secret-0123456789abcdef`, `BETTER_AUTH_URL: http://localhost:3000`, `RESEND_API_KEY: re_ci_placeholder`, `NEXT_TELEMETRY_DISABLED: "1"`. One value per variable across all jobs keeps turbo hashes stable. The `build-smoke` Postgres service keeps its current settings, which match this URL.

### Setup action

In order: `pnpm/action-setup@v5` with no `version` input (it reads `packageManager`); `actions/setup-node@v5` with `node-version-file: .nvmrc` and `cache: pnpm`; `pnpm install --frozen-lockfile` (fails on an unreviewed build script, AC-8); `actions/cache@v4` for `.turbo` with key `turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-${{ github.sha }}` and restore key `turbo-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}-`. The npm pin step and the install scripts check are deleted.

### CI changes

| Job | Commands after the move |
|---|---|
| `test` | `pnpm turbo run test:coverage //#test:root:coverage`; upload `apps/*/coverage/` and `packages/*/coverage/` as the `coverage` artifact |
| `typecheck` | `pnpm turbo run typecheck` |
| `lint` | `pnpm turbo run lint` |
| `prisma` | `pnpm --filter @aft/db exec prisma validate`, then `pnpm turbo run db:generate`; the "committed client is stale" step is removed |
| `build-smoke` | Next cache path `apps/web/.next/cache`, key on `pnpm-lock.yaml` and `apps/web/**`, `packages/**`; read the version with `pnpm --filter @aft/app-web exec node -p "require('@playwright/test/package.json').version"`; cache browsers as today; `pnpm --filter @aft/app-web exec playwright install --with-deps chromium`; then `pnpm turbo run test:e2e --filter=@aft/app-web`; on failure upload `apps/web/playwright-report/` |
| `audit` | `pnpm audit --prod --audit-level high` (AC-9) |

`apps/web/playwright.config.ts`: `testDir: "e2e"`, `webServer.command: "pnpm start"` (run with `cwd` `apps/web`, which is the config's folder), the rest unchanged.

### Renamed CI contract tests

`ci.test.ts` is rewritten in step 1. These checks change or are replaced, each named after the AC it covers: the "npm version from packageManager" check becomes "pnpm version from packageManager, installed by `pnpm/action-setup`"; "npm test runs Vitest once" becomes "the test job runs `turbo run test:coverage` and the root contract test"; "npm install-scripts ls" becomes "`allowBuilds` lists the reviewed packages and `strictDepBuilds` is not turned off"; the `pkg.scripts.test === "vitest run"` and `test:watch` checks move to `apps/web/package.json`; the `shadcn` check still reads the root `devDependencies`; new checks cover the `@/` gate in packages (AC-11) and the absence of `package-lock.json` and `audit-ci.jsonc`. The PR description lists every old and new test name.

### `.gitignore`

Un-anchor the build and tool entries so they apply in every workspace: `node_modules`, `.next/`, `out/`, `build/`, `coverage`, `playwright-report`, `test-results`, `blob-report`. Add `.turbo/` and `packages/db/src/generated/`. Keep `.env`, `*.tsbuildinfo`, `next-env.d.ts`.

### Config files in detail

- `apps/web/next.config.ts`: `const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")`; `loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", console, true)`; `transpilePackages` (AC-17); `turbopack: { root: repoRoot }`; `outputFileTracingRoot: repoRoot`; `images` unchanged.
- `packages/db/prisma.config.ts`: `config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env") })`, then today's `defineConfig` with `schema: "prisma/schema.prisma"` and `migrations.path: "prisma/migrations"` (relative to the config, run with `cwd` `packages/db`, which `pnpm --filter … exec` and turbo both set). It reads `process.env["DATABASE_URL"]` as today, not Prisma's strict `env()`, so `generate` works with the CI placeholder.
- `apps/web/eslint.config.mjs` and each package's `eslint.config.mjs` spread `@aft/config/eslint`, which holds today's rules plus the `no-restricted-imports` patterns for `@aft/*/src/*` and its ignore list (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`, `**/generated/**`, `coverage/**`, `playwright-report/**`, `test-results/**`).

### Value sourcing

| Action | Value | Source |
|---|---|---|
| pin pnpm | `12.15.0` | npm registry `latest` on 2026-10-24 |
| pin Turborepo | `2.11.10` | npm registry `latest` on 2026-10-24 |
| catalog and dependency versions | exact versions | `package-lock.json` on `main` at step 0 (AC-1) |
| `allowBuilds` | approvals | `package.json` `allowScripts` on `main` (AC-8) |
| `globalEnv` | nine names plus `NODE_ENV` | `.env.example` on `main` (AC-14) |
| CI placeholder values | five values | today's `build-smoke` job `env:` |
| required check names | six names | spec 0001 AC-12 and AC-13 |
| test parity baseline | count and names | `npm test` on `main` before step 1, saved in the PR description (AC-5) |
| route parity baseline | route table | `npm run build` on `main` before step 1, saved in the PR description (AC-6) |
| lockfile version baseline | seven versions | `package-lock.json` at step 0 (AC-1) |
| shadcn CLI version | `4.22.1` | root `devDependencies` on `main` |
| audit threshold | `high` | `audit-ci.jsonc` (`"high": true`, `"skip-dev": true`) |
| repo root path | absolute path | `fileURLToPath(import.meta.url)` in each config |
| Tailwind check class | `size-9` | `components/ui/button.tsx` on `main` |

### Key invariants

- No runtime behavior, route, migration, or model changes. The only schema edit is the generator `output` line.
- Every commit in the PR passes `lint`, `typecheck`, and `test`.
- Packages are TypeScript source with no build step; only `@aft/db` has a generate step.
- Only `apps/web` uses `@/`; packages use relative imports, plus `@aft/ui/*` self imports inside `packages/ui`.
- Client entry points (`@aft/auth/client`, `@aft/auth/schemas`, `@aft/ui/*`, `@aft/email`) never import `@aft/db`, `@aft/auth/server`, or the values of `@aft/auth/providers` (app client components may import its types with `import type`).
- `@aft/auth/providers` stays light: it never imports `./auth`, `@aft/db`, or `@aft/email`, so a page that only lists providers does not load the auth server.

### Security model

No change to who can do what. `server-only` stops the database client and auth secrets from reaching a browser bundle (AC-12); the I6 CI rules carry over (AC-7); `strictDepBuilds` replaces npm `allowScripts` as the install script gate (AC-8); `pnpm audit` keeps the high severity gate (AC-9). CI placeholders are not secrets.

### Configuration required

No new variables. `.env` stays at the root with the same nine names.

### Edge cases (new IDs owed to the PLAN.md catalog)

- **I18** A migration file changes bytes during the move (line endings, an editor touch) → Prisma reports a modified migration. `git mv` only, LF through `.gitattributes`, and AC-4 checks exact renames plus `migrate status`.
- **I19** A workspace imports a package it does not declare (a phantom dependency that npm's flat `node_modules` hid, like `@next/env` today) → the isolated linker fails; declare it in that workspace, never hoist.
- **I20** A client component imports `@aft/db` or `@aft/auth/server` → `server-only` fails `next build` (AC-12).
- **I21** A new dependency ships an install script → `pnpm install` fails until `allowBuilds` decides it (AC-8).
- **I22** Turborepo replays a cache made under different env values → strict env mode, the declared list, and `.env` as a global dependency (AC-14).
- **I23** The generated Prisma client is missing on a fresh clone or stale after a schema edit → `db:generate` runs before every dependent task (AC-3, AC-4). An editor opened before any task ran shows missing Prisma types until `pnpm turbo run db:generate`.
- **I24** A branch made before the move is still open, or another session is working in the checkout → resolved before the move starts (AC-18).
- **I25** Two versions of React or Next.js load in one app → `catalog:` plus peer dependencies keep one (AC-15).
- **I26** Tailwind skips classes that live in a package → `@source` in the ui CSS (AC-19).
- **I27** A non Next.js Node runtime loads `server-only` and crashes → it aliases `server-only` to the empty stub (AC-12).
- **I28** On Windows, pnpm's symlinked `node_modules` or long paths break an install → pnpm uses junctions on Windows, which need no admin rights; if a path is too long, enable Git `core.longpaths` and Windows long paths, then reinstall.

### Critical test scenarios

- Fresh clone with no `.env`, CI placeholders exported, `pnpm install`, `pnpm turbo run lint typecheck test build` passes, verifies **AC-1**, **AC-3**, **AC-13**
- `git diff -M100% --stat main` lists the migrations as renames; `prisma migrate status` on the dev database is clean, verifies **AC-4**
- The full manual auth run on `next dev` plus the e2e smoke, verifies **AC-5**, **AC-6**
- A throwaway `'use client'` file importing `@aft/db` fails `next build` (not committed), verifies **AC-12**
- A throwaway `'use client'` value import of `resolveSocialProviders` from `@aft/auth/providers` fails `next build` (not committed), verifies **AC-12**
- A throwaway `'use client'` file with `import type { SocialProvider } from "@aft/auth/providers"` passes `next build` (not committed), verifies **AC-12** does not block type imports
- Edit a file in `packages/auth`, rerun `pnpm turbo run test`: `@aft/app-web#test` misses the cache. If it replays from cache instead, add a `transit` task (`"transit": { "dependsOn": ["^transit"] }`) and put `"transit"` in the `dependsOn` of `test`, `test:coverage`, `typecheck`, and `lint`, so a package change reruns every app that uses it, verifies **AC-3**
- A throwaway import of `@aft/db/src/index` fails lint (not committed), verifies **AC-11**
- `pnpm dlx shadcn@4.22.1 add accordion` from `apps/web` writes into `packages/ui` and passes lint (then discarded), verifies **AC-16**
- The built CSS contains `size-9`; the sidebar looks the same, verifies **AC-19**
- Edit `RESEND_FROM_EMAIL` in `.env` and rerun `pnpm turbo run build`: cache miss, verifies **AC-14**
- `pnpm why react` shows one version; the seven lockfile versions match step 0, verifies **AC-1**, **AC-15**
- The six checks appear on the PR with their old names and pass, verifies **AC-7**, **AC-8**, **AC-9**, **AC-10**

## Build plan

Tracer Bullet here means: get the whole toolchain (pnpm, Turborepo, CI) green around the untouched app first, then move it, then thicken one package at a time. Each numbered step is one commit that passes `lint`, `typecheck`, and `test`.

0. Preflight: check `ListAgents` and `git reflog -5`; list open branches and PRs and have the engineer merge, rebase, or close each; record the `npm test` count and names, the `npm run build` route table, `npm ls --depth=0`, and the seven lockfile versions in the PR description. Satisfies **AC-18**, sets the baselines for **AC-1**, **AC-5**, **AC-6**
1. Toolchain switch with the app still at the root: `pnpm import`, delete `package-lock.json`, `packageManager: pnpm@12.15.0`, `pnpm-workspace.yaml` (no workspace globs yet, so the root is the only project), Turborepo with a minimal `turbo.json`, CI placeholders, setup action, all six jobs on pnpm, `pnpm audit` replacing `audit-ci`, `.gitignore` un-anchored, `ci.test.ts` rewritten. Fix any phantom dependency the isolated linker exposes (I19). Satisfies **AC-1**, **AC-7**, **AC-8**, **AC-9**, **AC-10**
2. Move the app: `git mv` per *File moves* into `apps/web`, `@aft/app-web` with its scripts, workspace globs `apps/*` and `packages/*`, `@/*` mapped to `apps/web/*`, root `.env` loading, `turbopack.root` and `outputFileTracingRoot`, root `vitest.config.mts` and `tsconfig.json` for `ci.test.ts`, Playwright, coverage, and CI build paths. Prisma and the committed client stay inside `apps/web` for this one commit. Satisfies **AC-2** (partly), **AC-6**, **AC-13**, **AC-17**
3. `packages/config`: tsconfig bases, the shared ESLint flat config with the deep import rule, the Vitest setup and the `server-only` stub; `apps/web` extends them. Move shared versions into `catalog:`. Satisfies **AC-11**, **AC-15**
4. `packages/db`: `git mv` schema, migrations, and config; generator `output` changed; `git rm` the old client; `db:generate` wiring; `server-only`; `prisma` CI job reworked; `globalEnv`, `globalPassThroughEnv`, `globalDependencies`. Check `migrate status` on the dev database. Satisfies **AC-3**, **AC-4**, **AC-12** (db), **AC-14**
5. `packages/email`: templates and send functions with their tests; rewrite imports and mocks. Satisfies **AC-2**, **AC-11**
6. `packages/auth`: server, providers, client, and schemas subpaths with their tests; `server-only` on `./server` and `./providers`; the sign in and sign up pages import `@aft/auth/providers`; rewrite imports and mocks. `lib/auth-client.test.ts` moves beside the client and keeps its describe and `it` names, but scans only the package's client entries (client plus schemas); its two scan tests are repeated under the same `it` names in `apps/web/components/auth/client-boundary.test.ts` over the app's auth components, so each workspace checks its own files and a cached Turborepo result is never stale. In detail:
   - `packages/auth/src/client/index.test.ts` keeps all three original tests under `describe("lib/auth-client.ts")` (the "passes no baseURL" test plus the two scans) and scans `src/client/*.ts` and `src/schemas.ts`, never test files. Its types only scan fails on any import from `./server`, `../server`, or `@aft/auth/server` that is not `import type`. It adds one test, "covers 0008 AC-11: the client and schemas entries import nothing from src/server", which also fails on any import of `@aft/db`.
   - `apps/web/components/auth/client-boundary.test.ts` holds the two scans under `describe("components/auth")` and scans `components/auth/*.tsx`, never test files. No `vi.mock` header is needed. Its types only scan fails on any import of `@aft/auth/providers` or `@aft/auth/server` that is not a whole `import type` statement, so a mixed `import { type X }` fails too (Turbopack can keep that form as a real import).
   - The `it` titles that mention `lib/auth-providers` stay word for word, because AC-5 keeps every `it` name; they now refer to `@aft/auth/providers`. Satisfies **AC-2**, **AC-11**, **AC-12**
7. `packages/ui`: primitives, `cn()`, `use-mobile`, theme CSS with `@source`, both `components.json` files, the self alias; rewrite app imports. Satisfies **AC-2**, **AC-16**, **AC-19**
8. Final parity pass: compare tests, routes, lockfile versions, and `pnpm -r list` with step 0; check that a package edit misses the app's test cache (add the `transit` task if not); run the manual auth flow on the dev database; run the throwaway guard, shadcn, Tailwind, and cache checks. Satisfies **AC-5**, **AC-6**, and confirms **AC-1** to **AC-19**
9. Ship it: open the PR, all six checks green, squash merge.

## Migration plan

**Strategy**: big bang inside one PR, staged as green commits (no live users and no deployed environment exist yet, so there is nothing to run side by side).
**Phases**: as in the Build plan, steps 1 to 7.
**Rollback**: before merge, `git reset` to the last green commit. After merge, revert the squash commit; the database is untouched because no migration changes, so a revert needs no data step.
**Risks**: a phantom dependency or a Next.js workspace root quirk stalls step 1 or 2 (caught by CI on that commit); a "modified migration" on the dev database if a file changed bytes (I18, checked in step 4); missing Tailwind classes (I26, checked in step 7); open branches or another session in the checkout (removed by step 0).

## Consequences

**Positive**:
- `apps/auth` (spec 0004) and `apps/worker` (spec 0007) can import `@aft/auth`, `@aft/db`, and `@aft/email` instead of copying code.
- One command runs every check across every workspace, with a local and CI cache.
- The server only guard turns the most dangerous rule in `AGENTS.md` into a build failure.
- Schema changes no longer carry a large generated diff, and the audit gate no longer needs a separate tool.

**Negative / tradeoffs**:
- Every import of moved code changes, so the PR diff is large and `git blame` needs `-M`/`--follow` across the move.
- An editor shows missing Prisma types on a fresh checkout until a task has run `db:generate`.
- pnpm's strict linking will surface missing dependency declarations that npm hid, which costs time in step 1.
- `turbo.json` must list every new env variable, or the task cannot see it; every edit to `.env` clears every cache.
- Every non Next.js Node runtime must remember the `server-only` alias.
- Commands in `AGENTS.md`, `README.md`, and the memory notes become wrong until `/sync` runs.

**Neutral**:
- Spec 0005 child 0001 says `onlyBuiltDependencies` and Corepack; pnpm 12 replaced the first with `allowBuilds`, and this spec uses `pnpm/action-setup` instead of Corepack. Spec 0001's `audit-ci` gate becomes `pnpm audit` with the same threshold.
- Specs stay in `docs/specs/` (repo wide); no `docs/specs/_root/` move.

## Rationale

Reasoning, options, and the cross check record: see [rationale.md](rationale.md).

## Follow-up

- [ ] Engineer: before step 0, install pnpm locally with `npm i -g pnpm@12.15.0`.
- [ ] `/sync` after merge: rewrite the `AGENTS.md` Commands, Stack (package manager), Rules (`@/` scope, generated client no longer committed, `@aft/*` imports, the `server-only` alias rule), and Gotchas (`allowBuilds`, CI placeholders, `.env` at the root); add nested `apps/web/AGENTS.md` (where `next dev` writes its agent rules block) and list it under Context files; add the `pnpm` and `turborepo` skill bullets, which are installed but not yet listed in `## Agent skills`.
- [x] Dated amendment notes added to spec 0005 child 0001 and spec 0001 (2026-10-24).
- [x] I18 to I28 added to the PLAN.md edge case catalog (2026-10-24).
- [ ] Feature 5 (workspace tooling) builds on `@aft/config` for Prettier and commit hooks, and may replace the deep import rule with `turbo boundaries`; feature 6 adds zod env helpers to `@aft/config` and checks `turbo.json` `globalEnv` against each app's schema.
- [ ] Feature 9 (container images) relies on `outputFileTracingRoot` from AC-17 for the standalone build.
- [ ] Spec 0004 child 0002 says "copy the existing auth pages into `apps/auth`"; after this feature, `apps/auth` imports `@aft/auth` and copies only `components/auth` pages.
