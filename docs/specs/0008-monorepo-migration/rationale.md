# 0008. Move the app into a pnpm and Turborepo monorepo: rationale

## Context

AFT is one Next.js 16.4 app at the repo root, installed with npm 11.19.1 on Node 24. Shared concerns live in `lib/` (Better Auth server and client, Prisma client, Resend email), `components/ui` (shadcn primitives), and `components/emails`. The generated Prisma client (12 files) is committed under `lib/generated/prisma`, and CI fails if it drifts from the schema. CI has six required checks, protected by branch protection and by a contract test (`ci.test.ts`) that reads the workflow files. There are 100 tests, one Playwright smoke test, and two applied migrations on the AWS dev database.

Spec 0005 child 0001 (still in force under spec 0007) already chose pnpm workspaces plus Turborepo, `@aft/*` package names, packages consumed as TypeScript source, and the first five packages. Spec 0007's path to live makes this move step 1, because `apps/auth` (spec 0004) and `apps/worker` (DBOS, spec 0007) must share the database, auth, and email code, and the container images in feature 9 are built per app. What was still open is the how: what goes into each package, whether generated code stays committed, where env files live, how CI and the contract test change, how to keep server code out of browser bundles once it sits in a package, and how to prove nothing changed.

Forces: one engineer working with AI agents; no users and no deployed environment yet, so there is no traffic to protect, but the dev database holds applied migrations whose checksums must not change; pnpm 12 has changed settings since spec 0005 was written (`onlyBuiltDependencies` is gone, `allowBuilds` replaces it), and Corepack is deprecated and leaves Node after version 24; the shared checkout is used by more than one session, and a long lived branch that moves every file conflicts with anything else open.

## Options considered

### Option 1: Move in place in one PR, in green milestone commits

Switch tooling first with the app untouched, then `git mv` the app, then extract packages one commit each, each commit green.

**Pros**:
- Matches the one feature, one PR ship rule and the milestone commit rule.
- History follows the files (`git mv`), and a bad step is found by bisecting a handful of commits.
- Tooling problems (phantom dependencies, Next.js workspace root) surface before any file moves, so they are not mixed with import rewrites.

**Cons**:
- One very large diff to review.
- The branch must be short lived; anything else open conflicts.

### Option 2: Fresh scaffold, copy code in

Generate a new monorepo with `create-turbo`, then copy the app and shared code into it.

**Pros**:
- Clean starter configs with no leftovers.
- Easy to compare against the Turborepo reference layout.

**Cons**:
- Loses file history unless the copy is done with `git mv` anyway.
- Starter defaults (ESLint, tsconfig, Next.js versions) differ from what passes today, so "no behavior change" is harder to prove.

### Option 3: Several PRs

pnpm switch, app move, and each package as separate PRs.

**Pros**:
- Smaller reviews; each merge is a safe resting point.

**Cons**:
- Breaks the one feature per PR rule in the scope.
- `main` sits in half moved states (for example the app moved but Prisma still inside it) between merges, which other sessions might build on.

### Option 4: Strangler, build `apps/web` beside the root app

Keep the root app running while a new `apps/web` grows, then delete the old one.

**Pros**:
- The old app keeps working the whole time.

**Cons**:
- Two copies of every file during the move, with nothing to protect: there are no users or deployments yet.

## Rationale

Option 1 is right because the thing the strangler pattern protects (live traffic) does not exist yet, while the things that can actually break (migration checksums, CI check names, client and server boundaries) are all caught by CI on each small commit. Doing the tooling switch first, with the app still at the root, isolates the riskiest unknown (how pnpm's strict linking and Turborepo's strict env mode treat today's code) from the import rewrites. Option 2 throws away history and the configs that already pass; Option 3 breaks the ship rule and leaves `main` half moved; Option 4 doubles the code for no benefit.

The smaller calls, all chosen by the engineer:
- **Generate the Prisma client, stop committing it.** Committing it made sense for a single app with no task runner; with Turborepo, `db:generate` runs before every dependent task, so the large generated diff and the drift check both go away. Runner up: keep committing, which needs no generate step but carries noise into every schema PR.
- **Auth server and client in `packages/auth`, UI in the app.** `apps/auth` needs the same Better Auth config and client; the sign in forms are page specific and spec 0004 already plans to copy pages. Runner up: move the forms too, which pulls `packages/ui` into auth earlier than needed.
- **shadcn's monorepo layout for `packages/ui`.** It is what the shadcn CLI supports, so `add` keeps working; the theme tokens move too so `apps/auth` looks the same. Runner up: primitives only.
- **One root `.env`, loaded explicitly.** One file to edit, matching feature 8's single local dev command. Runner up: per app files, which duplicate `DATABASE_URL`.
- **`ci.test.ts` as a root task.** It reads root files, so it belongs at the root. Runner up: a tooling workspace that exists for one test.
- **`@aft/config` with tsconfig bases and today's ESLint rules.** Packages get linted from day one with no new rules. Runner up: tsconfig only.
- **Keep `@/` in `apps/web` only.** Fewest edits; packages use relative imports. Runner up: drop the alias, which rewrites nearly every import.
- **`@aft/email` holds templates and send functions.** It is the email adapter spec 0005 names, and the worker will send mail too. Runner up: templates only.
- **Vitest per workspace.** Matches spec 0005 and Turborepo's per package cache. Runner up: one root config with projects.
- **Tests plus a manual auth run as proof.** The e2e smoke does not sign in, so the manual run (as in spec 0002) covers the auth paths. Runner up: automated checks only.
- **`server-only` on server entry points.** A client import now fails the build instead of leaking `DATABASE_URL`. Runner up: the written rule only.
- **Strict env mode with a declared list.** Keeps the cache honest. Runner up: loose mode.
- **`pnpm/action-setup` in CI.** Corepack is deprecated and leaves Node after 24. Runner up: Corepack.
- **Close open branches first.** Rebasing across a full move is the most expensive conflict there is. Runner up: rebase later.

- **`pnpm audit` instead of `audit-ci`.** `audit-ci` shells out to the package manager's audit and parses its JSON; pnpm 11 and later changed the audit endpoint, so the gate could break on day one. pnpm's own `pnpm audit --prod --audit-level high` matches `audit-ci.jsonc` (`high`, `skip-dev`) exactly, and its allowlist (`auditConfig.ignoreGhsas`) lives in the workspace file. Runner up: keep `audit-ci` and test it in step 1.

Decided while writing (no engineer input needed): pnpm 12.15.0 and Turborepo 2.11.10 (current `latest` on the registry today); `pnpm import` to keep resolved versions identical (runner up: a fresh resolve, which could change versions mid move); a `.turbo` cache in CI through `actions/cache` (runner up: none, slower CI); `turbopack.root` and `outputFileTracingRoot` at the repo root now rather than in feature 9 (runner up: wait, which leaves a build warning and a trap for feature 9); `no-restricted-imports` for deep imports (runner up: an ESLint plugin for boundaries, one more dependency for one rule).

## Amendment 2026-10-25: a light providers entry

**What happened.** At build step 6, the sign in and sign up pages imported `resolveSocialProviders` from `@aft/auth/server`, the only subpath that exported it. That entry re-exports `auth`, so importing it evaluates `auth.ts`, which builds Better Auth with the Prisma adapter and loads `@aft/email`, whose module creates the Resend client. Before the move these pages imported only `lib/auth-providers.ts`, which reads `process.env` and nothing else. The two A11 page tests call the real resolver, and they crashed with "Missing API key" because tests have no Resend key. The app itself still worked (the pages run on the server with the env loaded), so the gap was in the spec's export surface, not in the code.

**Options considered.**
- **Option A: a `./providers` subpath (chosen).** Export `src/server/auth-providers.ts` as `@aft/auth/providers`; the pages and the client type imports use it; `./server` keeps re-exporting the same names. Restores the old import weight exactly, keeps the tests unchanged, and gives `apps/auth` (spec 0004) a cheap way to list providers. Cost: one more subpath to document.
- **Option B: create the Resend client lazily.** No new export, but the page tests would then build Better Auth and the Prisma client inside jsdom, and every page that lists providers would still load the whole auth server. Rejected: it hides the coupling instead of removing it.
- **Option C: mock `@aft/auth/server` in the page tests.** Rejected: the A11 tests exist to run the real resolver against stubbed env, so a mock would stop them testing anything.

**Engineer's picks (both recommended).** Client components import the `SocialProvider` type from `@aft/auth/providers` (erased at build, and it keeps browser files pointed at the light entry by name). The entry starts with `import "server-only"`, because the resolver reads OAuth secrets, so a value import into a `'use client'` file fails `next build` (I20); Vitest already aliases the stub (AC-12).

**Also recorded.** The client boundary scan in `lib/auth-client.test.ts` read the app's `components/auth` folder. Left in `packages/auth`, a Turborepo cached pass of `@aft/auth:test` would not notice a change in an app component, so a violation could hide behind the cache. The scans are split: the package test checks its own client entries, and `apps/web/components/auth/client-boundary.test.ts` repeats the two scans under the same `it` names over the app's components. Two corrections found while building steps 1 to 5 are written into the spec too: `loadEnvConfig` needs `forceReload`, because Next.js has already loaded (and cached) env files from `apps/web` before `next.config.ts` runs, so without it the root `.env` never reached the build workers; and `server-only` joins the catalog, because two workspaces use it.

**Cross check of the amendment (Sonnet, 2026-10-25).** Nothing blocking; six gaps, all fixed at the engineer's request: the test split now names its describes and file sets; the types only scans match the new specifiers and reject a mixed `import { type X }`; the AC-11 client and schemas test is named; the invariant now forbids only values of `@aft/auth/providers` in client code; `./server` re-exports from the same file; and two checks were added (a type import must still build, and a package edit must miss the app's test cache, with the `transit` task as the named fallback).

## Amendment 2026-10-27: shadcn and the cn package

**What happened.** At build step 8, the AC-16 check (`pnpm dlx shadcn@4.22.1 add accordion` from `apps/web`) failed in two separate ways.
- **Wrong place on Windows.** The file landed outside the repo, in `Desktop\remwa`. `/debug` traced this to `@shadcn/registry` 0.2.0. After matching a wildcard export, it strips the file extension with `path.replace(/\.[^/]+$/, "")`, which assumes `/` separators. On Windows the match starts at the first dot anywhere in the path, here the one in `remwa.com`. Proof: from a dotless `subst` drive every alias resolved. The engineer renamed the folder to `Desktop\remwa-com`, and the file now lands in `packages/ui/src/components/` (I30).
- **An unexpected `cn` dependency.** The file imported `{ cn } from "cn"`, and `cn` was added to `apps/web/package.json`. This is intended upstream behavior, not a bug. Since about 2026-10-16, every shadcn registry style checked (`radix-lyra`, `radix-nova`, `new-york-v4`) ships that import and lists `cn` as a dependency. `cn` is an npm package by shadcn and aidenybai (0.5.0, zero dependencies, Node 22 or newer), a drop in replacement for `clsx` plus `tailwind-merge` that claims full parity and is faster. Running `add` from `packages/ui` gave the same import, with the dependency in `packages/ui/package.json` instead.

**Options considered for `cn`.**
- **Option A: keep `lib/utils`, rewrite after each `add`, adopt later (chosen).** The migration stays behavior neutral, as AC-1 (dependency versions unchanged) and AC-5 (behavior unchanged) require. The cost is one documented hand edit per `add` until adoption.
- **Option B: adopt now through a re-export.** `utils.ts` becomes `export { cn } from "cn"`, and `clsx` and `tailwind-merge` leave `@aft/ui`. AC-16 would hold with no hand edit. Rejected for this PR: it changes a runtime dependency inside a move meant to change nothing. `cn` is 11 days old and before 1.0, and its parity claim has not been checked against this app's class strings.
- **Option C: adopt now and migrate every import** (`shadcn migrate cn`). Same objections as B, with the largest diff.

**Options considered for where `add` runs.**
- **`packages/ui` (chosen).** The file and its npm dependencies land in the same workspace, as shown on 2026-10-27.
- **`apps/web` (the original spec).** shadcn writes the file into `packages/ui` but puts the dependencies in the app, where `@aft/ui` cannot resolve them under the isolated linker (I19). They would need moving by hand every time.

**Engineer's picks (both recommended).** Option A, with `add` run from `packages/ui`. Adopting `cn` gets its own scope feature and `/architect` pass, with a class merge parity check.

**Not taken: a pnpm `overrides` alias.** Pointing the `cn` package at a local shim (for example `link:` to `src/lib/utils.ts`) would avoid the per `add` rewrite, but it is untested with the isolated linker and leaves a misleading `cn` entry that the adoption feature would have to unpick.

**Cross check of the amendment (Sonnet, 2026-10-27).** Eight findings, all fixed at the engineer's request. The plain lockfile check could not pass: `shadcn` already depends on `cn@0.2.6` through `@shadcn/registry`, as `main`'s npm lockfile did, so AC-16 now checks that no workspace lists `cn` (`pnpm why cn -r`). The rewrite now targets `@aft/ui/lib/utils` for any import form and depth, and an ESLint `paths` entry fails on leftovers. The remove step runs only if `cn` was added. `add` never overwrites, and `git status` limits what it may change, including an additive `globals.css` hunk the engineer reviews. Added dependencies follow `catalog:`. The discard steps are spelled out. `pnpm exec shadcn` replaces `pnpm dlx`. The self import sentence is clarified.

## Amendment 2026-10-27: build only tools back to dev dependencies

**What happened.** `/check verify` ran `pnpm audit --prod --audit-level high`, and it exited 1 with 15 high advisories (`brace-expansion`, `js-yaml`, `picomatch`, `body-parser`). Every path started at one of two workspace runtime dependencies: `@aft/config` → `eslint-config-next` (21 paths, through ESLint) and `@aft/ui` → `shadcn` (9 paths, through the CLI's MCP and Express tree). On `main`, both were root dev dependencies and `audit-ci` used `skip-dev`, so neither was audited. Spec 0001 AC-8 had already moved `shadcn` out of runtime dependencies for exactly this reason. This spec's *Package contents* table put both back as runtime dependencies inside packages, and the `ci.test.ts` guard only read the root `package.json`, so nothing caught it until the audit ran. The audit treats a workspace's `dependencies` like the root's: `--prod` skips only `devDependencies`.

**Why they are build only.** `shadcn` is used by `@aft/ui` for `@import "shadcn/tailwind.css"`, which Tailwind resolves from `packages/ui` while it builds the CSS, and for the `add` command. `eslint-config-next` is loaded by `packages/config/eslint/index.mjs` only while lint runs. Neither is ever imported by code that runs in the app. pnpm links each workspace's dev dependencies in every local and CI install, so both still resolve.

**Options considered.**
- **Make both dev dependencies of their packages (chosen).** The audit covers what it covered on `main`, AC-1's versions stay the same, and spec 0001's decision holds again. A new `ci.test.ts` check across every workspace stops the regression from coming back. Con: a production only install cannot build `@aft/ui`'s CSS (feature 9 builds with dev dependencies anyway), and the ESLint and CLI advisories stay unfixed, only unaudited, as on `main`.
- **Override the transitive versions with pnpm `overrides`.** This would keep both as runtime dependencies and force patched `brace-expansion`, `js-yaml`, `picomatch`, and `body-parser`. Rejected: it changes resolved versions inside ESLint and the shadcn CLI during a move meant to change nothing (several overrides cross major lines, such as `brace-expansion` 1 to 5), and it hides that build tools are classed as runtime code.
- **Allowlist the advisories in `auditConfig.ignoreGhsas`.** Rejected: AC-9 allows only advisories with no available fix there, and all 15 have fixes.

**Engineer's pick (recommended).** Make both dev dependencies, plus the every workspace check. A non blocking dev dependency audit is noted as an optional follow up.

**Cross check of the amendment (Sonnet, 2026-10-27).** Six findings, all fixed at the engineer's request. The blocker: `pnpm-lock.yaml` records `@aft/config`'s peers (`eslint`, `vitest`, two testing libraries) as runtime dependencies, because `autoInstallPeers` is on and they were not also dev dependencies, and `pnpm why eslint -r --prod` confirmed `@aft/config (dependencies)`. `eslint` reaches the same `brace-expansion` and `js-yaml` advisories, so moving only `eslint-config-next` would not have cleared the audit. The fix mirrors those peers in `devDependencies`, the pattern `@aft/ui`, `@aft/auth`, and `@aft/email` already follow for React, and a second check enforces it. Turning off `autoInstallPeers` was not taken: it changes the resolved peer graph during a migration meant to change nothing. Also settled: root `shadcn` and its existing check stay; the new checks read the workspace globs from `pnpm-workspace.yaml` and refuse to pass on an empty list; the survey found no other build tool in runtime dependencies, and `tw-animate-css` stays runtime as on `main`; the Consequences line names `turbo prune` and Docker; step 8b checks that the audit command and the empty `ignoreGhsas` are unchanged.

## Amendment 2026-10-27: capping test start contention

**What happened.** `/check verify` and `/test` saw Vitest fail a whole workspace with "Timeout waiting for worker to respond" three times in about four full runs on the engineer's 4 core machine (`@aft/ui` twice, `@aft/app-web` once); each passed on rerun. `/check review` traced it: in vitest 5.0.5 a worker must report "started" within `START_TIMEOUT = 6e4` (60 seconds, `dist/chunks/index.1TqnEahn.js`), a constant with no config option, so the limit cannot be raised. `pnpm turbo run test:coverage //#test:root:coverage` started up to six Vitest processes at once (Turborepo's default concurrency is 10), each with up to cores minus one forked workers, jsdom setup of about 10 seconds per worker, and v8 coverage. The repo is public, so GitHub runners have 4 vCPUs, the same as this machine, and the required `test` check would fail at random.

**Options considered.**
- **Cap Turborepo test concurrency at 2, locally and in CI, plus `VITEST_MAX_WORKERS=2` in CI (chosen).** About four workers on four vCPUs in CI, and at most two Vitest processes locally. The cap sits only on the test scripts, so `lint`, `typecheck`, and `build` keep full parallelism. `VITEST_MAX_WORKERS` is read by Vitest itself, so no config changes. Con: test runs take longer, and the variable must be passed through Turborepo's strict env mode.
- **CI only cap.** Rejected by the engineer: the flake also happened locally, and local runs would keep failing under load.
- **`concurrency: 2` at the top of `turbo.json`.** Rejected: it slows every task, including the ones that never flaked.
- **`maxWorkers: process.env.CI ? 2 : undefined` in each Vitest config.** Runner up: no env pass through needed, but five edits, and every future config must remember it.
- **`pool: "threads"` for the jsdom workspaces.** Not now: threads start faster, but module mocks and globals behave differently, so every test would need checking again. Recorded in I32 as the next step if the caps are not enough.
- **A retry (`retry`, `--retry`, or a rerun step).** Rejected: it hides real failures and trains people to ignore red runs.

**Proof chosen by the engineer.** Four uncached local runs in a row and three CI `test` runs on the same commit, because the review could not run on a GitHub runner.

**The smaller fixes.** These came from the same review and need no deliberation, but each changes a value this spec named:
- **Per job Turborepo cache key.** `actions/cache` saves only when the key is new, and all six jobs shared one key per commit, so only the first job to finish saved, and the others restored a cache with none of their own results. Adding `github.job` gives each job its own cache.
- **Narrow `//#test:root` inputs.** `packages/**` is not filtered by `.gitignore`, so a dry run hashed 234 inputs, including coverage, turbo logs, the generated client, and 83 installed files. Because the root test runs beside the package tests, its hash depended on timing. The inputs now mirror what `ci.test.ts` reads, plus `turbo.json`, which the new AC-20 check reads.
- **`build-smoke` cache key exclusions.** `hashFiles` runs after `pnpm install`, so `apps/web/**` and `packages/**` walked `node_modules`. Excluding installed, build, and generated folders keys the cache on source, as on `main`.
- **`@next/env` in the catalog.** It was a hand pinned literal that must equal `next`, and `next.config.ts` depends on its `forceReload` behavior. A catalog entry beside `next` keeps them together. Runner up: a `ci.test.ts` check that the two versions match, which catches drift later instead of preventing it.

**Cross check of the amendment (Sonnet, 2026-10-27).** It confirmed that Vitest 5.0.5 reads `VITEST_MAX_WORKERS` for the forks pool, that `github.job` works inside a composite action, and that `hashFiles` accepts `!` patterns. It found seven gaps, and the engineer chose every recommended fix. The main one: a CI rerun of the same commit restores the `.turbo` cache and replays the test results, so three green runs could prove nothing. Reruns of the `test` job now set `TURBO_FORCE`, which is also the right behavior whenever someone suspects a flaky test. The others: the local proof runs the exact CI command (the root task holds one of the two slots); a `ci.test.ts` check keeps `@next/env` equal to `next`, because a catalog entry cannot point at another; AC-20 says plainly that local workers are uncapped, with a set next step if the local proof fails (the engineer kept the CI only variable over `maxWorkers` in every config); `/sync` documents the root scripts as the supported entry point; the root test inputs add `vitest.config.mts`, `package-lock.json`, and `audit-ci.jsonc`; and new checks pin both cache keys, with an exact form for the dry run check.

## Cross check record

On 2026-10-24 a read only Sonnet cross check reviewed the first draft and reported 6 blockers, 25 gaps, and 4 nits. The engineer chose to apply every recommended fix:

- Blockers fixed: `server-only` crashing plain Node (stub alias, AC-12, I27); root anchored `.gitignore` entries; no `DATABASE_URL` for `prisma generate` in most CI jobs (*CI placeholders*); Tailwind not scanning `packages/ui` (`@source`, AC-19, I26); shadcn's generated `@/` imports against the no `@/` rule (*shadcn setup*); the test parity rule against the rewritten `ci.test.ts` (*Renamed CI contract tests*).
- Gaps closed: a per workspace dependency table, a full file move table, the Vitest environment and coverage per workspace, `--passWithNoTests`, `vi.mock` rewrites, the Playwright web server, tsconfig bases, workspace scripts (root `test:root` so turbo cannot recurse), the schema `output` line exception in AC-4, lockfile version checks after `pnpm import`, the `@/` gate in packages, Prisma type re-exports as types only, `prisma.config.ts` and `next.config.ts` root paths through `fileURLToPath`, `loadEnvConfig` arguments, turbo `inputs` and `cache: false` for e2e, pass through env vars, `pnpm audit` instead of `audit-ci` (AC-9), the setup action order and `.turbo` cache key, the build-smoke step order, client entries never importing server code, and the full workspace file with a wider catalog.
- Not taken: deferring `packages/ui` and `packages/email` to a later feature, because scope feature 4's "Done when" requires all five packages. `turbo boundaries` is noted for feature 5 instead of replacing the lint rule now.
