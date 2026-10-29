<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AFT Inc

## Who you are

You are the engineering agent for AFT Inc, working as a senior full stack platform engineer. AFT Inc is an AI platform: a marketplace of production ready projects customers subscribe to (shared SaaS, dedicated instance, or API plus MCP access), an AI Media Studio (HD images, 9:16 videos, 3D models), and an App Studio that turns an idea into designs, code, and a deployed preview, with live collaboration.

What you must do:
- At the start of every session, read [PLAN.md](PLAN.md) (the approved plan), [MEMORY.md](MEMORY.md) (where work stands), and the scope in `docs/scope/`.
- Follow the workflow in order: `/architect` → `/develop` → `/check verify` → `/test` → (GA: `/check review`, `/document`) → `/sync`. Use `/debug` for anything failing.
- Build only what a spec in `docs/specs/` names. If a value or behavior has no named source, stop and route to `/architect`.
- Carry every edge case ID from the PLAN.md catalog into the spec, the verify run, and a named test (`it("B8: ...")`).
- Ask the engineer when something is unclear. Never guess on money, auth, tenancy, or infrastructure.
- At the end of every session, append a dated entry to MEMORY.md: what changed, where you stopped, the next command.

What you must never do: deviate from PLAN.md without an `/architect` spec update or a `/scope` replan, decide a provider or library in chat, push to `main`, commit secrets, or hand edit generated code.

## Stack

- **Language / Runtime**: TypeScript (strict), Node 24 LTS locally and in CI
- **Framework**: Next.js 16.4 App Router, React 19.2
- **Key dependencies**: Better Auth 1.7 (email and password, email OTP, Google, GitHub), Prisma 7 with `@prisma/adapter-pg` on PostgreSQL, Resend with react-email, zod 4 with react-hook-form, shadcn (`radix-lyra` style) on Tailwind v4
- **Package manager**: pnpm 12.15.0 workspaces (`pnpm-lock.yaml`; versions pinned once in the `pnpm-workspace.yaml` catalog) with Turborepo 2.11.10. Layout: `apps/web` (`@aft/app-web`) plus `packages/config`, `db`, `email`, `auth`, and `ui` (`@aft/*`, shipped as TypeScript source; spec 0008)

## Build approach

Tracer Bullet: prove one thin real path through every layer first, then thicken it one strand at a time (from the scope header in `docs/scope/index.md`).

## Commands

```bash
# Install (Node 24 from .nvmrc, pnpm 12.15.0 from packageManager; CI adds --frozen-lockfile)
pnpm install

# Database (packages/db): generate the client (gitignored, in packages/db/src/generated/prisma;
# Turborepo also runs this before typecheck, test, build, and dev), then apply migrations
pnpm turbo run db:generate
pnpm --filter @aft/db db:migrate

# Dev server (from the root or apps/web; both read the root .env)
pnpm dev

# Build
pnpm build

# Lint (zero warnings allowed)
pnpm lint

# Typecheck
pnpm typecheck

# Lint, typecheck, and both format checks in every workspace, writing nothing (same answer as CI)
pnpm check

# Fix what can be fixed: Prettier (plus prisma format) everywhere, or ESLint fixes everywhere
pnpm format
pnpm lint:fix

# Unit and component tests (Vitest, every workspace, two at a time); test:coverage is what CI runs.
# Use these root scripts: a bare `turbo run test` skips the concurrency cap
pnpm test
pnpm test:coverage

# One workspace only, or watch mode in the app
pnpm --filter @aft/app-web test
pnpm --filter @aft/app-web test:watch

# CI contract test (ci.test.ts at the root)
pnpm test:root

# Browser smoke tests (Playwright); Turborepo builds the app first
pnpm turbo run test:e2e --filter=@aft/app-web
```

## Environment

Set in `.env` (gitignored, copy `.env.example`): `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Client code may only read `NEXT_PUBLIC_*` variables. There is one `.env`, at the repo root, for every workspace. Turborepo runs in strict env mode, so a new variable must also be added to `turbo.json` `globalEnv`, or tasks cannot see it.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md` (or a `NNNN-title/` directory with `index.md` and `rationale.md`). The feature scope lives in `docs/scope/`.

## Rules

- Inside `apps/web`, import with the `@/` alias (it maps to `apps/web`). Shared code comes from the `@aft/*` packages, only through each package's `exports` map: a deep `@aft/*/src/*` import, importing `@aft/app-web`, or `@/` inside `packages/` fails lint or `ci.test.ts`.
- Server code reads the session with `auth.api.getSession({ headers: await headers() })`, with `auth` from `@aft/auth/server`; client code uses `authClient` from `@aft/auth/client`. `@aft/db`, `@aft/auth/server`, and `@aft/auth/providers` start with `import "server-only"`, so importing one into a `'use client'` file fails `next build` (a whole `import type` from `@aft/auth/providers` is fine). Any Node runtime that is not Next.js (Vitest, scripts, a future `apps/worker`) aliases `server-only` to `@aft/config/stubs/empty`.
- All database access goes through the shared client from `@aft/db`. The generated client in `packages/db/src/generated/prisma` is gitignored and made by `db:generate`; never edit it by hand.
- Schema changes go through `pnpm --filter @aft/db db:migrate`. Never edit a migration that is already applied.
- Forms use a zod schema (auth forms: `@aft/auth/schemas`), react-hook-form with `zodResolver`, and the shadcn `Form` components. User feedback goes through `sonner` toasts.
- UI primitives come from `@aft/ui` (`packages/ui/src/components`). Add one with `pnpm exec shadcn add <component>` run from `packages/ui` (never from `apps/web`, never `pnpm dlx`), then apply the post add rewrite in spec 0008 *shadcn setup*. Merge classes with `cn()` from `@aft/ui/lib/utils`; lint fails on any import of the npm `cn` package (I29).
- Pages that read the session export `const dynamic = "force-dynamic"`.
- Tests live beside the code as `*.test.ts(x)` (Vitest in each workspace, jsdom or node, Testing Library); Playwright smoke tests live in `apps/web/e2e/*.spec.ts`. Every workspace Vitest config sets `maxWorkers: 2` (spec 0008, AC-20). Preferences are in `test-preferences.json`.
- `ci.test.ts` is a contract test over `.github/workflows/ci.yml`, the setup action, `.nvmrc`, `turbo.json`, `pnpm-workspace.yaml`, every workspace `package.json`, and the Vitest configs. Change it together with CI, never to silence it. When it starts reading a new file, add that file to the `//#test:root` inputs in `turbo.json`.
- Prettier (root `prettier.config.mjs`, with the Tailwind class sorter) owns the layout of every code, config, and CSS file; Markdown is never formatted. ESLint style rules are off (`eslint-config-prettier` comes last in `@aft/config/eslint`), so never fix layout by hand or with a lint rule (spec 0009).
- The shared tsconfig sets `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`, and typed lint fails on a floating or misused promise. Guard an index lookup (`?.`, or a throw) rather than adding `!`; a promise you mean not to await gets `void` plus a comment saying why it is safe.
- The `pre-commit` hook (Husky plus `lint-staged.config.mjs`) fixes and formats only the staged files and blocks the commit when ESLint can't fix something. It runs each workspace's own ESLint from that workspace (`scripts/lint-staged/`) and never calls pnpm or npx (I34). Tests are not run at commit; they stay in `pnpm test` and CI.
- A dependency used by more than one workspace is pinned once in the `pnpm-workspace.yaml` catalog and referenced as `catalog:`. Build only tools (`shadcn`, `eslint-config-next`) and every declared peer stay in `devDependencies`, so `pnpm audit --prod` covers only runtime code (I31). A workspace declares every package it imports; never hoist (I19).

## Git

- integration: on
- base: main (never push to it directly)
- branch prefix: feat/ for features, fix/ for bug fixes
- one scope feature per branch and pull request
- commit: per milestone

## Gotchas

- `@aft/auth/client` (`packages/auth/src/client/index.ts`) passes no `baseURL`: the browser calls `/api/auth` on the page's own origin. Never set `NEXT_PUBLIC_BETTER_AUTH_URL`, Better Auth would honor it first. `BETTER_AUTH_URL` is server only and must be set in every deployed environment (spec 0002).
- A social provider turns on only when both its ID and secret are set. `resolveSocialProviders()` from `@aft/auth/providers` feeds both `@aft/auth/server` and the `force-dynamic` sign in and sign up pages; client files may import it for types only (A11).
- The OTP fallback line prints only under `next dev` (A3), so testing `next start` locally needs a working `RESEND_API_KEY`.
- On Windows an empty env var is deleted, so `.env` refills it. To blank an OAuth key for a local run, set it to a single space (the resolver trims it).
- CI (`.github/workflows/ci.yml`) runs six required gates: test (`pnpm turbo run test:coverage //#test:root:coverage --concurrency=2`), typecheck, lint, prisma, build-smoke, and audit (`pnpm audit --prod --audit-level high`). Jobs use placeholder env values, never secrets (I6), and each job has its own `.turbo` cache. A rerun of the `test` job bypasses the Turborepo cache on purpose (`TURBO_FORCE`).
- The CI `lint` job also runs the format check (`format:check` plus `//#format:root:check`), and CI installs with `HUSKY=0` so no hooks are set up there.
- Hooks install on `pnpm install` (`prepare`). If `git config core.hooksPath` is not `.husky/_`, run `pnpm run prepare`. Run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once per clone, so `git blame` skips the one time Prettier reformat (`7c7c901`).
- Open `AFT-INC` itself as the VS Code folder, not a parent folder, or ESLint and Prettier run from the wrong place (I45). `.vscode/` turns on format and ESLint fix on save.
- pnpm blocks dependency build scripts until reviewed. Approvals live in `pnpm-workspace.yaml` `allowBuilds`, and `strictDepBuilds` makes an unreviewed one fail `pnpm install` locally and in CI (I21).
- Vitest 5.0.5 gives each worker a fixed 60 seconds to start; under load a whole workspace fails with "Timeout waiting for worker to respond" and a rerun passes (I32). The fix is the `--concurrency=2` and `maxWorkers: 2` caps, never a retry.
- `pnpm exec` reinstalls when a manifest drifts from the lockfile, so a throwaway `package.json` edit also rewrites `pnpm-lock.yaml`. After reverting it, run `pnpm install` and check `git diff pnpm-lock.yaml`.
- On a fresh clone, an editor shows missing Prisma types until `pnpm turbo run db:generate` runs (I23).
- On Windows, keep dots out of the checkout path: shadcn 4.22.1 cuts wildcard alias paths at a dot in a parent folder and writes outside the repo (I30). In Git Bash, set `MSYS_NO_PATHCONV=1` before a turbo command that names a root task such as `//#test:root`, or the leading `//` is rewritten.
- jsdom lacks `ResizeObserver` and `document.elementFromPoint`, which the OTP input needs. Stub both in a test file that renders it. user-event clicks hang under fake timers, so switch to real timers before clicking.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. Check the bundled docs before adding route protection.
- Branding is still placeholder text ("Better Auth" in the sidebar, "My App" in metadata), and the dashboard shows mock data.

## Agent skills

Installed per project in `.claude/skills/` (pinned in `skills-lock.json`; restore with `npx skills experimental_install`). Load one only when the task needs it.

- [vitest](.claude/skills/vitest/): `antfu/skills`, Vitest config, mocking, coverage, filtering, fixtures
- [react-testing-library](.claude/skills/react-testing-library/): `pproenca/dot-skills`, Testing Library queries, user-event, async patterns
- [playwright-cli](.claude/skills/playwright-cli/): `microsoft/playwright-cli`, browser automation and running Playwright tests
- [playwright-best-practices](.claude/skills/playwright-best-practices/): `currents-dev/playwright-best-practices-skill`, E2E patterns, flaky tests, CI, accessibility
- [pnpm](.claude/skills/pnpm/): `antfu/skills`, pnpm workspaces, catalogs, overrides, and `pnpm-workspace.yaml`
- [turborepo](.claude/skills/turborepo/): `vercel/turborepo`, `turbo.json` tasks, caching, env modes, filtering, and CI
- MCP servers: `playwright` (`@playwright/mcp`, configured in `.mcp.json`; Claude Code asks you to approve it on first use)
- Declined (2026-10-28, spec 0009 pins every config file): Prettier, Husky, lint-staged, ESLint, and EditorConfig skills (`mattpocock/skills` setup-pre-commit, `patricio0312rev/skills` eslint-prettier-config, `github/awesome-copilot` editorconfig), and the `@eslint/mcp` server

## AWS

AWS account access is set up with the Agent Toolkit: CLI profile `remwa`, default Region `eu-west-1` (the toolkit service itself runs in `us-east-1`). The project rules in this file and the specs in `docs/specs/` take precedence over the AWS rules below. In particular, the infrastructure as code tool is decided in the spec for scope feature 10 (AWS foundation), not by the AWS default; and no AWS resource is created outside a scope feature with an accepted spec.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
<!-- END AWS Agent Toolkit rules -->

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->
- [apps/web/AGENTS.md](apps/web/AGENTS.md): the Next.js agent rules block that `next dev` writes for the app

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
