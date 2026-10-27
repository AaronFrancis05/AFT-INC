# Review, feat/monorepo-migration, 2026-10-27

**Reviewed by**: Sonnet 5.5 (author on a different session, spec 0008 build)
**Scope**: 347 files, branch vs origin/main (merge base 3e87f90)
**Verdict**: Changes requested

## Summary
The change moves the single Next.js app into `apps/web`, extracts five packages (`config`, `db`, `email`, `auth`, `ui`), switches to pnpm 12.15.0 and Turborepo 2.11.10, and keeps the six CI job names. The work follows spec 0008 closely. Config, exports maps, `server-only` guards, the ESLint boundary rules, the CI contract tests, and the dependency placement all check out against AC-1 to AC-19, and the recorded deviations are sound. There are no blockers. The one headline issue is the intermittent Vitest "Timeout waiting for worker to respond" failure, which is likely to hit CI because the timeout is hard coded inside Vitest and cannot be raised with config. A few smaller cache and doc issues follow.

## Major
### 🟠 Vitest worker start timeout is likely to fail the required `test` job, `.github/workflows/ci.yml:37` (also `turbo.json`, every `vitest.config.mts`)
**Problem**: The error comes from Vitest's pool runner. In vitest 5.0.5 (`dist/chunks/index.1TqnEahn.js`) a worker must send its "started" message within `START_TIMEOUT = 6e4` (60 seconds), a constant with no config option. `teardownTimeout` does not control it. So the note in MEMORY.md ("raise the Vitest worker timeout") cannot be done; the only fix is less contention. Today `pnpm turbo run test:coverage //#test:root:coverage` starts up to five Vitest workspaces plus the root test at once (turbo's default concurrency is 10), after `db:generate`. Each Vitest process starts up to cpu minus one workers, and each jsdom worker needs about 10 seconds of setup. `apps/web` alone has nine test files, and `apps/web/eslint.config.test.ts` also loads the full Next ESLint config inside a worker, with v8 coverage on top. On this 4 core machine it failed 3 times in 4 or so full runs. A GitHub ubuntu runner has 2 vCPUs on private repos and 4 on public ones, so it is at least as likely to hit it, and it fails a whole workspace with no test result.
**Why it matters**: A flaky required check (`test`) blocks merges at random and trains people to rerun, which hides real failures. A rerun passes, so it will look like noise.
**Suggested fix**: Cut parallel pressure, in this order. (1) Add `--concurrency=2` (or 1) to the test job command in `ci.yml`, so at most two workspaces start Vitest at once. (2) Cap workers in CI: set `test.maxWorkers` in the four jsdom and node configs (for example `process.env.CI ? 2 : undefined`), or export `VITEST_MAX_WORKERS=2` in the job. (3) Optionally try `pool: "threads"` for the jsdom workspaces, which starts faster than forks, and check the mocks still behave. (4) Avoid per file jsdom where a file does not need it; `apps/web/eslint.config.test.ts` and `next.config.test.ts` already use the node environment, so that is done. Do not add a blind retry. After the change, run the CI `test` job three or four times on the PR before relying on it, since I could not run on a GitHub runner.

## Minor
### 🟡 Turborepo cache key is per commit and shared by every job, so most jobs never get a useful cache, `.github/actions/setup/action.yml:23`
**Problem**: The key is `turbo-<os>-<lockhash>-<sha>`. The `test`, `typecheck`, `lint`, `build-smoke`, and `audit` jobs all use the same key. `actions/cache` saves only if the key does not exist, so only the first job to finish saves, and that cache holds only its own task results. Later runs restore that one job's cache for all jobs.
**Why it matters**: The cache the spec wants for fast CI mostly will not work. It is a speed problem, not a correctness one.
**Suggested fix**: Add `${{ github.job }}` to the key and the restore key, so each job saves and restores its own cache.

### 🟡 `//#test:root` inputs pull in gitignored output, `turbo.json:117` and `turbo.json:128`
**Problem**: The input glob `packages/**` is not filtered by `.gitignore`. A dry run lists 234 inputs, including `packages/*/coverage/**`, `packages/*/.turbo/*.log`, `packages/db/src/generated/**`, and 83 files under `node_modules`.
**Why it matters**: The root contract test hash changes whenever any package writes coverage or a turbo log, so it misses cache after any other test run. In the `test` job it runs in parallel with the package tests, so its hash depends on timing. The task is cheap, so this is waste, not breakage, but it also hashes thousands of needless files.
**Suggested fix**: Narrow the globs to what `ci.test.ts` reads: `packages/*/package.json`, `packages/**/*.{ts,tsx,mts,mjs}`, with exclusions `!**/node_modules/**`, `!**/generated/**`, `!**/coverage/**`.

### 🟡 `build-smoke` cache key hashes `node_modules`, `.github/workflows/ci.yml:131`
**Problem**: `hashFiles('apps/web/**', 'packages/**')` runs after `pnpm install`, so it walks `apps/web/node_modules` and `packages/*/node_modules` too. On main the globs named only source folders.
**Why it matters**: Slower key computation and a key that depends on install layout, not on source.
**Suggested fix**: Add exclusion patterns (`!**/node_modules/**`) or list source folders as on main.

### 🟡 `@next/env` is pinned by hand, not through the catalog, `apps/web/package.json:19`
**Problem**: `"@next/env": "16.4.2"` is a literal that must always equal `next` (catalog `16.4.2`). Dependabot or a manual bump of `next` in the catalog leaves it behind.
**Why it matters**: Two Next versions' env loaders is the kind of drift the catalog exists to prevent (I25), and `next.config.ts` relies on `forceReload` behaviour of this exact version.
**Suggested fix**: Add `@next/env` to the catalog next to `next` and reference it as `catalog:`, or add a `ci.test.ts` check that the two versions match.

### 🟡 Root `AGENTS.md` and `README.md` now give wrong instructions, `AGENTS.md:46` and `README.md:8`
**Problem**: `AGENTS.md` still says package manager npm, `npm ci`, `@/lib/auth`, `@/lib/prisma`, `lib/generated/prisma` is committed, `allowScripts`, and the audit-ci job. `README.md:8` still says `npm run dev`. The spec lists this as a `/sync` follow-up after merge.
**Why it matters**: The Rules say "never import `@/lib/auth`" and tell agents to run `npm`. Any session between merge and `/sync` follows rules that no longer match the repo. The new `apps/web/AGENTS.md` only holds the Next.js block.
**Suggested fix**: Run `/sync` in this PR, or immediately after merge, before the next feature session. Do not leave it for later.

## Nits
- ⚪ `.gitignore:21`, `build/` is now unanchored and will also hide any future `infra/**/build/` folder; anchor it per workspace or accept it knowingly.
- ⚪ `MEMORY.md` (2026-10-25 entries), the step 0 baselines (100 tests with names, 15 route table, `npm ls`, seven lockfile versions) live only in a session scratchpad; copy them into the PR description as the spec requires.
- ⚪ `apps/web/eslint.config.test.ts:14`, the 60 second `beforeAll` that loads the whole Next ESLint config is one of the heavier workers in the flake above; keep it in mind when tuning.

## Recorded deviations (MEMORY.md, 2026-10-25 and 2026-10-27)
All are sound; list them in the PR description.
- `loadEnvConfig(..., console, true)` with `forceReload`: sound, covered by `apps/web/next.config.test.ts`; already written into the spec amendment.
- Strict env settings arrived in step 2, not step 4: sound, Turborepo 2 is strict by default; no behavior difference at the end.
- `server-only@0.0.1` added to the catalog: sound, two workspaces use it (AC-15); written into the spec.
- `tsx` dropped: sound, nothing imports it. Worth remembering for `apps/worker`, which will need to add it back.
- `//#test:root` inputs also list `apps/*/package.json`: sound, `ci.test.ts` reads `apps/web/package.json` and every manifest. See the Minor above about the `packages/**` glob.
- `@next/env` declared in `apps/web` (I19): sound as a fix, but see the Minor above about pinning it.
- `react-hook-form` added to the catalog and as a `@aft/ui` peer: sound, `form.tsx` imports it and `FormProvider` needs one instance.
- `sonner` and `lucide-react` not declared in `@aft/ui`: sound, no ui file imports them (I19). The app declares both.
- `packages/ui/tsconfig.json` `types` adds `@testing-library/jest-dom/vitest`: sound, needed for matcher types in `form.test.tsx`.
- The app drops `class-variance-authority`, `clsx`, `input-otp`, `radix-ui`, `tailwind-merge`, `tw-animate-css`, `shadcn`: sound, they now live in `@aft/ui`; typecheck and build pass. Root keeps `shadcn` for the contract test, as the spec says.
- Keeping `@aft/ui`'s own `cn` (amendment 2026-10-27): sound, with the lint guard in `packages/config/eslint/index.mjs` and a test for it.
- `@aft/config` devDependencies mirror its peers, and build only tools are dev dependencies (amendment, I31): sound, and the two contract checks scan every workspace with a guard against an empty list.

## Strengths
- Boundaries are enforced in code, not only in docs: `server-only` on `@aft/db`, `./server`, and `./providers`; ESLint rules for deep `src` imports, importing the app, and the `cn` package, each with a test in `apps/web/eslint.config.test.ts`; client boundary tests split per workspace.
- `ci.test.ts` was rewritten with care. It keeps the six job names, `persist-credentials`, `allowBuilds`, and the pnpm pin, and the new every workspace checks assert that the workspace list is not empty before passing.
- Config is tight and matches the spec: catalog pins equal the old lockfile versions, `allowBuilds` keeps npm's decisions, strict env lists exactly the nine variables, `turbopack.root` and `outputFileTracingRoot` agree, the `.env` load path is tested, and the lockfile is frozen in CI.
- The audit regression (15 high advisories) was caught in verify and fixed at the right level (dev dependencies plus peer mirrors) without allowlisting anything.

## Test coverage
Test signal is configured, and coverage is good. 128 tests across 18 turbo tasks pass, all 100 baseline names are kept except the planned `ci.test.ts` renames, and 20 new tests cover the new logic: the ESLint boundary and `cn` rules (9), `next.config.ts` env loading and roots (6), and the `@aft/db` client creation (5). The client boundary tests and the `@/` gate in `ci.test.ts` cover AC-11 and AC-12 at test level; the `next build` failure on a client import of `@aft/db` was checked by hand only (a throwaway file), which is fine for a one time proof. Gaps: nothing automated checks that `turbo.json` `globalEnv` matches `.env.example` (feature 6 is meant to add that), and the Vitest start timeout cannot be tested locally, only observed in CI runs.
