# 0001. Repair CI and add a test harness

**Date**: 2026-10-19
**Status**: In Progress

## Summary

Today every pull request fails, because CI calls a test command that does not exist. This spec replaces the broken workflow with a real CI pipeline: lint, typecheck, unit and component tests (Vitest), Prisma checks, a dependency audit, a production build, and a browser smoke test (Playwright). It also fixes what would make those gates fail on day one (existing lint errors and known critical vulnerabilities), and protects `main` so nothing merges without passing. After this, every later feature lands on a green, trustworthy pipeline.

## Context

AFT is a single Next.js 16.2 app (npm, Node 24 locally) that will move to a pnpm and Turborepo monorepo in scope feature 4. The only CI is `.github/workflows/webpack.yml`: it runs on pull requests to `main`, on Node 20, and calls `npm test -- --coverage`. No `test` script exists, so every pull request check fails, and nothing protects `main`, so a red check blocks nobody. The project has zero tests.

A baseline measured on 2026-10-19 shows what the gates would hit:
- **Typecheck**: `next typegen` then `tsc --noEmit` passes cleanly.
- **Lint**: 4 errors and 16 warnings (listed in the Build plan). Lint is also very slow, partly because it walks the committed generated Prisma client in `lib/generated/prisma`.
- **Runtime dependency audit**: 3 critical and 29 high advisories. The critical ones include `next` (fixed in 16.4.2, a minor upgrade) and `better-auth`. About ten of the high ones come from the `shadcn` CLI, which is wrongly listed in runtime `dependencies`.
- **Install**: npm 11.19 blocks package install scripts unless approved. Six packages have them (`@prisma/engines`, `prisma`, `esbuild`, `sharp`, `unrs-resolver`, `msw`). CI must behave the same way, or builds will differ between your machine and CI.

The engineer chose (staged conversation): Vitest with Testing Library as the platform test runner; blocking gates for lint, typecheck, tests, build, Prisma checks, dependency audit, and a browser smoke test; coverage reported with no threshold yet; `main` protected with linear history (squash merges), applied through the GitHub CLI; a smoke test that needs no seeded data (refined after the cross check to an empty Postgres service, so the signed out redirect check is deterministic); Node 24 only; tests placed next to the code; an audit that fails on high or critical advisories in runtime dependencies; vulnerabilities and existing lint errors fixed in this feature, not suppressed; and CI that runs on pull requests, on pushes to `main`, and on demand. The project is GA tier for CI/CD, and it owns edge case **I6** (pull requests from forks get no secrets).

## Requirements

**User stories**:
- As the engineer, I want every pull request checked automatically, so I only merge code that lints, typechecks, passes tests, builds, and loads in a browser.
- As the engineer, I want `main` protected, so a broken change cannot land by accident, even from me.
- As a future teammate or AI agent, I want one obvious way to write and run tests, so each feature ships with tests that run in CI.

**Acceptance criteria**:
- **AC-1**: `npm test` runs the Vitest suite once and exits (non zero on any failure); `npm run test:watch` runs it in watch mode for local work.
- **AC-2**: Starter tests prove both kinds of test work: unit tests for `lib/auth-schemas.ts` (sign up password rules, password mismatch, OTP must be 6 digits) and a component test for `components/auth/sign-in.tsx` that submits an empty form and sees the validation messages, with no network call.
- **AC-3**: `npm run typecheck` runs `next typegen` then `tsc --noEmit` and passes.
- **AC-4**: `npm run lint` passes with zero errors and zero warnings (`--max-warnings=0`), ignoring generated code and test output, and the existing 4 errors and 16 warnings are fixed in code, not disabled.
- **AC-5**: A Prisma check validates the schema, regenerates the client, and fails if the committed client in `lib/generated/prisma` differs in any way from what the schema produces, including new untracked files (checked with `git status --porcelain`). Text files are stored with LF line endings, so a client generated on Windows and one generated on Linux are identical.
- **AC-6**: `npm run build` succeeds in CI using only placeholder, non secret environment values.
- **AC-7**: A Playwright smoke test against the production build (`next start`) passes: `/` loads and shows the main heading; `/auth/sign-in` and `/auth/sign-up` show their forms; a signed out visit to `/dashboard` ends on `/auth/sign-in`; none of these pages logs a console error or throws an uncaught page error from the app's own origin (failed loads from external hosts such as `images.unsplash.com` are ignored). It needs no seeded data: the job provides an empty Postgres service (no migrations, no rows) only so any session lookup can connect.
- **AC-8**: The dependency audit (runtime dependencies, high or critical) passes: `next` is at 16.4.2 or later, `better-auth` is at its patched release, `shadcn` moves to `devDependencies`, safe transitive fixes are applied, and any advisory with no fix is listed in a reviewed allowlist with its ID, reason, and review date.
- **AC-9**: Each test run produces a coverage report (text summary in the log plus an lcov file uploaded as a CI artifact). Coverage never fails the build.
- **AC-10**: CI runs on every pull request to `main`, every push to `main`, and on manual dispatch; a newer push to the same pull request cancels the older run; the workflow token is read only; the workflow uses the `pull_request` trigger and no secrets, so a pull request from a fork never sees a secret (I6).
- **AC-11**: Node is pinned to 24 in `.nvmrc` and in `package.json` `engines`, and CI reads the version from `.nvmrc`. npm is pinned to 11.19.1 in `package.json` `packageManager`; every CI job installs that version before `npm ci` and fails if `npm -v` differs. CI honors the same approved install scripts as local, and fails if `npm install-scripts ls` reports any package not yet approved or denied.
- **AC-12**: `main` is protected on GitHub: changes arrive only through a pull request (zero approvals required), all six CI jobs are required checks and must be up to date with `main`, history is linear (squash merges), direct pushes, force pushes, and branch deletion are blocked, and the rules apply to admins too. The protection is applied by a repeatable `gh api` command recorded in the spec.
- **AC-14** (added 2026-10-19, see Update 1): The `account` table has a nullable `idToken` text column, added by an additive migration, so `better-auth` 1.7 passes its startup schema check and Google sign in can store its ID token. No existing row or column changes.
- **AC-13**: The old `webpack.yml` workflow is gone. Each new job's ID equals its display name, so the check names GitHub shows are stable and exactly the six names branch protection requires, and the workflow has no path filters (a skipped required check would leave a pull request stuck).

## Options considered

### Option 1: Fix in place (minimal patch)

Add a `test` script and one dummy test, keep `webpack.yml` as is, and stop there.

**Pros**:
- Smallest change; CI goes green in minutes.

**Cons**:
- Leaves lint, typecheck, Prisma, audit, and smoke ungated, so CI stays green while real problems ship.
- Keeps Node 20 in CI while you run Node 24, so CI and local can disagree.
- Nothing protects `main`, so a green check is advisory only.

### Option 2: Replace with a full gated pipeline, Vitest plus Playwright (chosen)

Replace the workflow with parallel gate jobs (lint, typecheck, test, Prisma, audit, build and smoke), fix what fails today, pin the toolchain, and protect `main`.

**Pros**:
- Every class of break the project can hit today is caught before merge.
- Vitest runs per package, so it carries straight into the monorepo (feature 4) without a rewrite.
- Parallel jobs give fast feedback and clear names for required checks.

**Cons**:
- More work up front: dependency upgrades and lint fixes land in the same pull request.
- Playwright adds roughly a minute and a browser download to each run.
- The upgrade to `next` 16.4 and the patched `better-auth` can change behavior, so the smoke test and the auth tests must catch regressions.

### Option 3: Jest via next/jest instead of Vitest

The same pipeline, with Next's built-in Jest preset as the runner.

**Pros**:
- Zero config inside a single Next app; very mature.

**Cons**:
- Slower, with ESM and transform friction around modern packages (`better-auth`, `zod` 4).
- Harder to share one config across monorepo packages that are not Next apps (worker, MCP server).

## Decision

**Chosen option**: Option 2: Replace with a full gated pipeline, Vitest plus Playwright.

Replace `webpack.yml` with `ci.yml`, made of six required jobs. Each job installs with `npm ci` on Node 24 and npm 11.19.1:

| Job (required check name) | Runs |
|---|---|
| `lint` | `npm run lint` |
| `typecheck` | `npm run typecheck` |
| `test` | `npm run test:coverage`, then uploads `coverage/` |
| `prisma` | `npx prisma validate`, `npx prisma generate`, then fails if `git status --porcelain lib/generated/prisma` prints anything |
| `audit` | `npx audit-ci --config audit-ci.jsonc` |
| `build-smoke` | starts an empty `postgres:17` service, runs `npm run build`, installs Playwright Chromium (cached), runs `npm run test:e2e` against `next start`, and uploads the Playwright report on failure |

These are the six required checks in branch protection.

**Workflow settings** (apply to every job unless noted):
- Triggers: `pull_request` (branches `main`), `push` (branches `main`), `workflow_dispatch`. No `paths` or `paths-ignore` filters.
- `permissions: contents: read` at workflow level.
- `concurrency`: group `ci-${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress` only when the event is `pull_request` (pushes to `main` always finish).
- Each job: `runs-on: ubuntu-latest`, `timeout-minutes: 15`, job ID equal to `name`.
- Setup steps, in order: `actions/checkout@v4`; `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm`; `npm install -g npm@11.19.1`; assert `npm -v` prints `11.19.1`; `npm ci`; fail if `npm install-scripts ls` lists any package not yet approved or denied.
- Actions are pinned to major version tags for now (pinning to commit SHAs comes in feature 16).
- `build`: also restores `actions/cache@v4` for `.next/cache`, keyed on the lockfile and source hashes.
- Artifacts (`actions/upload-artifact@v4`): `coverage/` from `test` with `if: always()`; `playwright-report/` from `build-smoke` with `if: failure()`.
- Placeholder environment values are set at job level (see Value sourcing), so `next build`, `next start`, and Playwright's server all see the same values.

## Rationale

The pipeline exists to make every later feature safe to merge, and AFT is a GA tier platform where auth, billing, and infrastructure land soon. Option 1 makes CI green without making it meaningful: a lint error, a stale generated client, or a known critical advisory in `next` would all still merge. The baseline already shows three of those today. Gating them now, while the codebase is small, costs far less than retrofitting gates after 130 features.

Vitest is chosen over Jest because the codebase is moving to a monorepo with non Next packages (worker, MCP server, shared libraries). Vitest runs the same config in every package, handles ESM natively, and is documented by Next itself. Jest would work in this app today, but would be a second migration in feature 4. Playwright is chosen for the smoke test because the same tool runs the full end to end suite on preview environments in feature 20, so this test is the first of that suite, not a throwaway.

Fixing vulnerabilities and lint errors inside this feature, rather than suppressing them, follows from your choice and from the GA bar: a gate that starts with exceptions trains everyone to ignore it. The one place exceptions are allowed is the audit allowlist, and only for advisories with no available fix, each with a reason and a review date. Protecting `main` with admins included matches the `AGENTS.md` rule never to push to `main`, and costs a solo engineer nothing, because every change already goes through a pull request.

Recommendations made without a separate question (each the engineer can override):
- **`audit-ci` for the audit gate** (runner up: plain `npm audit --audit-level=high`). Plain `npm audit` has no allowlist, so one unfixable transitive advisory would block every merge, or force the gate off. `audit-ci` supports an allowlist by advisory ID.
- **Lint warnings fixed too, with `--max-warnings=0`** (runner up: fix errors only). The 16 warnings are unused imports and variables, a few minutes of work, and a warning budget of zero keeps the gate binary.
- **Lint ignores `lib/generated/**`** (runner up: lint everything). Generated code is not ours to fix, and walking it is the main reason lint is slow.
- **Build and smoke in one job** (runner up: separate jobs passing `.next` as an artifact). The smoke test needs the exact build, and uploading `.next` costs more time than it saves.
- **Placeholder env values in the workflow file, not secrets** (runner up: GitHub secrets). Nothing here needs a real secret. Placeholders keep fork pull requests fully functional (I6) and make the workflow readable.
- **Chromium only, two retries in CI, trace kept on the first retry** (runner up: all three browsers). Cross browser runs belong to the full end to end suite in feature 20.
- **No required approving reviews** (runner up: one approval). You are the only human reviewer. GA review happens through `/check review`, not GitHub approvals.
- **LF line endings for every text file through `.gitattributes`** (runner up: compare the generated client ignoring whitespace). The committed client was generated on Windows with CRLF, so a Linux CI run would see every file as changed. Normalizing once fixes the gate for good and makes diffs clean across machines.
- **Dependency upgrades before lint fixes, in their own commit** (runner up: lint first). The newer `eslint-config-next` may add rules, so fixing lint on the old version would be done twice, and a separate commit makes any regression traceable to the upgrade.
- **An empty Postgres service in the smoke job** (engineer's choice over "no database at all"). Whether a cookieless session lookup queries the database no longer matters: it connects to an empty database and finds nothing, so the redirect check is deterministic.
- **Vitest without globals** (runner up: `globals: true`). Each test imports `describe`, `it`, `expect` from `vitest`, so `tsc` typechecks test files with no extra global types.

## Update 1 (2026-10-19): one additive schema change

Found during build task 8: `better-auth` 1.7 checks the Prisma schema at startup and refuses to run when a column it needs is missing (`SCHEMA_MISMATCH`, `account.idToken`). The column was always missing (a latent Google sign in bug), but 1.7 makes it fatal for every auth request. Every `better-auth` advisory is also fixed by 1.6.22, so pinning 1.6.33 was the alternative; the engineer chose to keep 1.7.11 and add the column here, because it also fixes Google sign in and avoids a second auth upgrade later. Scope feature 2 no longer owns this column.

## Feature design

**Data model sketch**: one additive change (Update 1). `Account.idToken String?` (nullable text), created by the migration `prisma/migrations/20261019200000_add_account_id_token/migration.sql` containing `ALTER TABLE "account" ADD COLUMN "idToken" TEXT;`. Nothing else in the schema changes.

**API surface**: no application endpoints. The interface is the npm scripts and CI jobs:

| Script | Command | Used by |
|---|---|---|
| `test` | `vitest run` | `test` job, local |
| `test:watch` | `vitest` | local |
| `test:coverage` | `vitest run --coverage` | `test` job |
| `test:e2e` | `playwright test` | `build-smoke` job, local |
| `typecheck` | `next typegen && tsc --noEmit` | `typecheck` job, local |
| `lint` | `eslint . --max-warnings=0` | `lint` job, local |

**Files this feature creates or changes**:
- `vitest.config.mts`, following the Next 16 Vitest guide in `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`: `@vitejs/plugin-react`, `vite-tsconfig-paths`, `environment: 'jsdom'`, `globals: false`, `setupFiles: ['./vitest.setup.ts']`, include `**/*.test.{ts,tsx}`, exclude `e2e/**`, `node_modules/**`, `lib/generated/**`, an `env` block setting `BETTER_AUTH_URL=http://localhost:3000` (the auth client reads it at import), and coverage provider `v8` with reporters `text-summary` and `lcov`, measuring `app/**`, `components/**`, `lib/**` but excluding `lib/generated/**` and `components/ui/**` (vendored shadcn code).
- `vitest.setup.ts`: imports `@testing-library/jest-dom/vitest` and runs `cleanup` after each test.
- `playwright.config.ts`, following `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`: `testDir: 'e2e'`, `use.baseURL: 'http://localhost:3000'`, Chromium only, `webServer` with `command: 'npm run start'`, `url: 'http://localhost:3000'`, `timeout: 120_000`, `reuseExistingServer: !process.env.CI`, `retries: process.env.CI ? 2 : 0`, `trace: 'on-first-retry'`, reporter `html` with `open: 'never'`.
- `e2e/smoke.spec.ts`: the smoke test for AC-7. Before each `goto`, it attaches listeners for `page.on('console')` messages of type `error` and `page.on('pageerror')`, and collects them; it ignores messages about failed loads whose URL is not `http://localhost:3000`, and asserts the collected list is empty after each page. Selectors: the homepage uses `getByRole('heading', { level: 1 })`; sign in and sign up check their email and password fields and submit button by role and label; the dashboard check asserts the final URL ends with `/auth/sign-in`. The routes exist at `app/(auth)/auth/sign-in` and `app/(auth)/auth/sign-up`.
- `.gitattributes` with `* text=auto eol=lf`, followed by `git add --renormalize .` and a fresh `npx prisma generate`, so the committed generated client is LF.
- `tsconfig.json`: make sure `include` covers `**/*.test.ts(x)`, `e2e/**`, `vitest.config.mts`, and `playwright.config.ts` (the current `**/*.ts`, `**/*.tsx`, `**/*.mts` globs already do; confirm nothing excludes them). `@types/node` moves from `^20` to `^24`.
- `lib/auth-schemas.test.ts` and `components/auth/sign-in.test.tsx`: the starter tests for AC-2.
- `audit-ci.jsonc`: `{ "high": true, "skip-dev": true, "retry-count": 3, "allowlist": [] }`. Allowlist entries are GHSA IDs, each preceded by a comment giving the reason and a review date.
- `.nvmrc` containing `24`; `package.json` gains `engines.node: ">=24 <25"`, `packageManager: "npm@11.19.1"`, the scripts above, the approved install scripts, and the new dev dependencies.
- Dependency targets: `next` and `eslint-config-next` to `^16.4.2`, `better-auth` to `^1.7.11` (the release `npm audit` reports as fixed), recorded exactly in `package-lock.json`. If a newer patch is out when this is built, take the newest patch in those ranges.
- `.github/workflows/ci.yml` created; `.github/workflows/webpack.yml` deleted.
- `eslint.config.mjs`: add `lib/generated/**`, `coverage/**`, `playwright-report/**`, `test-results/**` to the ignores.
- `.gitignore`: add `/playwright-report`, `/test-results`, `/blob-report`.

**New dev dependencies**: `vitest`, `@vitest/coverage-v8`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `audit-ci`. Plus `shadcn`, moved from `dependencies`.

**Value sourcing**:
| Action | Value produced / used | Source |
|---|---|---|
| Every CI job | Node version | `.nvmrc` (`24`), through `actions/setup-node` `node-version-file` |
| Every CI job | npm version | `package.json` `packageManager` (`npm@11.19.1`), installed by `npm install -g npm@11.19.1` and asserted with `npm -v` |
| Every CI job | which install scripts run | the approvals written by `npm install-scripts approve` for `@prisma/engines`, `prisma`, `esbuild`, `sharp`, `unrs-resolver`, and `npm install-scripts deny msw` (not needed at runtime or in tests); approvals are not pinned to versions. Build task 1 records which file and key npm writes them to (in `package.json` or `.npmrc`), and that file is committed |
| `build-smoke` | `DATABASE_URL` | the empty `postgres:17` service: `postgresql://postgres:postgres@localhost:5432/aft_ci` (service env `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=aft_ci`, health checked with `pg_isready`) |
| `prisma` | `DATABASE_URL` | placeholder `postgresql://ci:ci@localhost:5432/ci`, set because `prisma.config.ts` reads it; `validate` and `generate` never connect |
| Vitest | `BETTER_AUTH_URL` | the `env` block in `vitest.config.mts`: `http://localhost:3000` |
| `build-smoke` | `BETTER_AUTH_SECRET` | placeholder in the workflow: a fixed 32+ character string marked `ci-only-not-a-secret` |
| `build-smoke` | `BETTER_AUTH_URL` | `http://localhost:3000` |
| `build-smoke` | `RESEND_API_KEY` | placeholder `re_ci_placeholder` (the Resend client is constructed at import and needs a value; no email is sent in the smoke) |
| `build-smoke` | `RESEND_FROM_EMAIL`, Google and GitHub client keys | not set; the code falls back safely and the smoke sends no email and uses no social sign in |
| `audit` | advisories allowed despite high severity | `audit-ci.jsonc` allowlist, empty unless an advisory has no fix |
| Branch protection | required check names | the six job IDs in `ci.yml`, each equal to its `name` |
| Branch protection | repository | `AaronFrancis05/AFT-INC` (public, so protection is available on the free plan) |
| `/dashboard` smoke | signed out redirect target | existing behavior in `app/dashboard/layout.tsx` (`redirect("/auth/sign-in")`) |

**Key invariants**:
- No job uses a repository secret. The workflow `permissions` is `contents: read` only.
- The workflow never uses `pull_request_target`.
- The committed generated Prisma client always matches `prisma/schema.prisma`.
- A coverage number never fails a build (until a later spec adds a ratchet).
- Nothing is suppressed to make a gate pass, except audit advisories with no fix, each listed with reason and review date.

**Security model**: CI runs untrusted code from fork pull requests, so it gets a read only token and no secrets (I6). Branch protection applies to admins, so the repository owner's account cannot bypass it by accident. Applying branch protection needs a repository admin, which is you, through `gh`.

**Configuration required**: no new runtime environment variables. CI placeholders live in `ci.yml` (see Value sourcing).

**Failure modes and edge cases**:
- **Flaky smoke from slow startup**: Playwright `webServer` waits for the port with a 120 second timeout, and CI retries twice, keeping a trace on the first retry.
- **The `/dashboard` redirect touches the database with no session cookie**: covered by the empty Postgres service. A lookup connects, finds nothing, and the layout redirects.
- **Line endings make the generated client look stale**: prevented by `.gitattributes` and the one time renormalization in build task 1.
- **The npm registry is briefly down during the audit**: `audit-ci` retries three times. A persistent outage fails the job, and a manual rerun once the registry recovers is the fix.
- **A required check never runs** (for example, after a path filter is added): the pull request waits forever. That's why the workflow has no path filters, and any later spec that adds one must keep the six jobs unfiltered.
- **The upgrade to `next` 16.4 or patched `better-auth` changes behavior**: the auth unit and component tests, the smoke test, and a manual sign in on `npm run dev` must pass before merge. A regression blocks the pull request.
- **A new advisory appears after merge**: the next run fails the `audit` job. Fix it by upgrading, or allowlist it with reason and review date if no fix exists.
- **The generated client drifts** (someone edits the schema and forgets `prisma generate`): the `prisma` job fails and prints the diff.
- **A pull request from a fork**: runs every job with placeholder values and no secrets, and passes or fails on its merits (I6).

**Critical test scenarios**:
- Happy path: open a pull request with this change; all six jobs pass and show as checks; verifies **AC-1** to **AC-11**, **AC-13**.
- Failing test blocks: a throwaway commit with a failing assertion turns `test` red and blocks merge; verifies **AC-1**, **AC-12**.
- Lint gate: a throwaway unused import turns `lint` red; verifies **AC-4**.
- Stale client: a throwaway schema comment without regenerating turns `prisma` red; verifies **AC-5**.
- Smoke: the four page checks pass against `next start`, and a deliberately thrown client error is caught as a console error; verifies **AC-7**.
- Fork safety: confirm the workflow has no `secrets.` references and no `pull_request_target`, and that the `GITHUB_TOKEN` is read only; verifies **AC-10** (I6).
- Protection: a direct `git push` to `main` is rejected; verifies **AC-12**.

## Build plan

Tracer Bullet: first stand up one real job end to end (install, test, green check on a pull request), then thicken it gate by gate. Every task stays on the feature branch `feat/ci-repair-test-harness`.

1. Pin the toolchain and line endings: add `.nvmrc` (`24`), `engines`, and `packageManager`; approve the five needed install scripts and deny `msw` with `npm install-scripts`, then record which file and key npm wrote them to; add `.gitattributes`, renormalize, and regenerate the Prisma client; confirm `npm ci` is clean on npm 11.19.1 and `npm install-scripts ls` shows nothing unreviewed. Satisfies **AC-5**, **AC-11**.
2. Add Vitest: install the test dev dependencies, add `vitest.config.mts`, `vitest.setup.ts`, the `test`, `test:watch`, `test:coverage` scripts, and the starter tests for `lib/auth-schemas.ts` and `components/auth/sign-in.tsx`. Satisfies **AC-1**, **AC-2**, **AC-9**.
3. Thin thread: create `ci.yml` with the workflow settings above and only the `test` job; delete `webpack.yml`; open the pull request and see one green check. Satisfies **AC-10**, **AC-13**.
4. Typecheck gate: add the `typecheck` script and job, and move `@types/node` to `^24`. Satisfies **AC-3**.
5. Patch dependencies (its own commit): upgrade `next` and `eslint-config-next` to `^16.4.2` and `better-auth` to `^1.7.11`, move `shadcn` to `devDependencies`, apply safe transitive fixes, add `audit-ci.jsonc` and the `audit` job; then run `test` and `typecheck` again, plus a manual sign up, sign in, and sign out on `npm run dev`. Satisfies **AC-8**.
6. Lint gate (after the upgrade, so new rules are included): add the ignores, set `--max-warnings=0`, add the `lint` job, and fix every finding in code. The baseline on 2026-10-19 was 4 errors and 16 warnings; take the current list from a fresh lint run after task 5. Satisfies **AC-4**.
   - The 4 errors: `react-hooks/set-state-in-effect` in `components/auth/verify-email.tsx` (lines 39 and 47) and in `components/auth/reset-password.tsx` (line 51), and `react/no-unescaped-entities` in `components/emails/reset-password-template.tsx` (line 14).
   - The 16 warnings, all `@typescript-eslint/no-unused-vars`: `app/dashboard/page.tsx` (lines 7, 8, 9), `app/page.tsx` (10, 11, 13), `components/auth/sign-in.tsx` (18), `components/auth/sign-up.tsx` (18, 60), `components/auth/verify-email.tsx` (16), `components/dashboard/app-sidebar.tsx` (16), `components/icons.tsx` (2, twice), `components/ui/form.tsx` (7), and `lib/auth.ts` (14, 34).
   - Fix the `set-state-in-effect` errors by deriving the state rather than setting it inside the effect (for example, compute "can resend" from the countdown value). The visible behavior of the resend timer must not change.
7. Prisma gate: add the `prisma` job (validate, generate, `git status --porcelain` check). Satisfies **AC-5**.
7b. Schema fix (Update 1): add `idToken String?` to `Account` in `prisma/schema.prisma`, add the hand written migration above (no local database exists yet, so it is applied when the first database is created, features 8 and 12), and regenerate the committed client. Satisfies **AC-14**, **AC-5**.
8. Build and smoke: add `playwright.config.ts`, `e2e/smoke.spec.ts`, and the `test:e2e` script; add the `build-smoke` job with the empty Postgres service, job level placeholder env, the cached Chromium install (`npx playwright install --with-deps chromium`, cache keyed on the installed Playwright version), and the report upload on failure. Satisfies **AC-6**, **AC-7**.
9. Protect `main`: install the GitHub CLI (`winget install GitHub.cli`), then you run `gh auth login` once. After all six jobs have run green at least once (GitHub only offers checks it has seen), apply protection with the command below. Squash merge the pull request, set the repository to allow squash merges only, and confirm a direct push to `main` is rejected. Satisfies **AC-12**.

   ```bash
   gh api -X PUT repos/AaronFrancis05/AFT-INC/branches/main/protection --input - <<'JSON'
   {
     "required_status_checks": { "strict": true, "contexts": ["lint", "typecheck", "test", "prisma", "audit", "build-smoke"] },
     "enforce_admins": true,
     "required_pull_request_reviews": { "required_approving_review_count": 0 },
     "restrictions": null,
     "required_linear_history": true,
     "allow_force_pushes": false,
     "allow_deletions": false
   }
   JSON
   gh api -X PATCH repos/AaronFrancis05/AFT-INC -f allow_merge_commit=false -f allow_rebase_merge=false -f allow_squash_merge=true
   ```

## Consequences

**Positive**:
- Every pull request is checked for lint, types, tests, schema drift, known vulnerabilities, a working build, and pages that load.
- The known critical advisories in `next` and `better-auth` are gone before any new feature builds on them.
- One test runner and one end to end tool, both reused by every later feature and by the monorepo.

**Negative / tradeoffs**:
- CI time grows to several minutes per run. The Playwright browser download and the production build dominate.
- Dependency upgrades ride in the same pull request as the CI change, so this pull request is larger and riskier than a pure CI change. Mitigation: the tests and smoke test from tasks 2 and 8 guard them.
- Branch protection applies to admins, so even an urgent fix must go through a pull request with green checks.
- The audit gate can block an unrelated merge when a new advisory is published. That is intended, but it can interrupt work.

**Neutral**:
- `ci.yml` is rewritten again in feature 4 (pnpm and Turborepo task running) and extended in features 16 to 20 (image build, migrations, deploys, previews). The job names should stay stable, so branch protection does not need redoing each time.
- The committed generated Prisma client stays committed. Whether to keep committing it is decided in feature 4.

## Follow-up

- [ ] Feature 4 (monorepo migration): move the jobs to Turborepo tasks, keep the six check names, and decide whether the generated Prisma client stays committed.
- [ ] Feature 5 (workspace tooling): add pre-commit hooks that run lint and tests on changed files, so CI failures are caught locally first.
- [ ] Feature 16 (supply chain): add allowlist expiry enforcement and automated dependency update pull requests.
- [ ] Feature 20 (pull request previews): grow `e2e/` from this smoke test into the full end to end suite, including a real sign up against a database.
- [ ] Add a coverage ratchet once at least a few features ship with tests (owner: the spec that next touches CI).
