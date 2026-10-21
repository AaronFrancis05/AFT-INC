# AFT Inc: Progress Memory

This file holds the project's working memory, so any session or teammate can pick up exactly where the last one stopped.

**How to use it**
- Read it at the start of every session, right after [PLAN.md](PLAN.md).
- Append a dated entry to the Session log at the end of every session. Never rewrite old entries.
- Keep **Current position** true. It is the only part you edit in place.
- Feature status (planned, in progress, done) lives in `docs/scope/`, and decisions live in `docs/specs/`. This file points to them and never duplicates them.

## Current position

- **Stage**: Scope feature 1 (CI repair and test harness) is `done`: PR #2 squash merged to `main` as fc11e16 on 2026-10-20; spec 0001 `Accepted`
- **Done**: `/audit` gap-fill of `AGENTS.md`; `/scope` wrote [docs/scope/index.md](docs/scope/index.md) plus 8 epic files (132 features, plus 3 pre-existing items A to C)
- **Spec 0001** ([CI repair and test harness](docs/specs/0001-ci-repair-test-harness.md)) `Accepted`; every build task (1 to 9, plus 7b) is done, and `/check verify` passed on 2026-10-20 (commit c0dacf9, CI run 39400720181 green on all six checks). `main` is protected (squash merges only). `/test`, `/check review` (sonnet, Approve with nits), and `/document` (PR body) all completed on 2026-10-20
- **Dev database**: AWS Aurora PostgreSQL 17 Serverless v2 cluster `aft-dev` in eu-west-1 (see Decisions log, 2026-10-20); both migrations applied; local `.env` points at it
- **Next command**: merge the `docs/close-feature-1` PR, then `/clear`. Then `/develop auth defect fixes` (feature 2), then `/architect platform architecture` (feature 3)
- **Owed to `/sync`**: nothing (the 2026-10-21 run filled `## Build approach` and the test and toolchain notes)
- **Blockers**: none

## Step 1 checklist

- [x] `/audit`: root `AGENTS.md` filled in (persona, stack, commands, env, rules, git, gotchas)
- [x] `PLAN.md` and `MEMORY.md` created
- [x] `/scope`: `docs/scope/index.md` and the epic files, with edge case IDs on each `Done when`
- [ ] Scope feature 1 (CI repair) and 2 (auth fixes) shipped first, so the pipeline is green
- [ ] `/architect platform architecture` (scope feature 3, spec 0001): monorepo, AWS and EKS, data and tenancy, workflow engine, provider adapters, environments and releases
- [ ] `/architect engineering standards and shared helpers` (scope feature 7, spec 0002): errors, logging, env and secrets, idempotency and outbox, authz and entitlements, API style
- [ ] Engineer confirms 0001 and 0002 (status `Accepted`)

## Decisions log

Locked decisions. Changing one needs an `/architect` supersede and a new line here.

| Date | Decision | Where it is recorded |
|---|---|---|
| 2026-10-18 | Repo becomes a pnpm and Turborepo monorepo | PLAN.md, spec 0001 (pending) |
| 2026-10-18 | AWS with Kubernetes (EKS), GitOps through Argo CD | PLAN.md, spec 0001 (pending) |
| 2026-10-18 | CI/CD covers both the platform and per customer deployments | PLAN.md |
| 2026-10-18 | Stripe Billing for subscriptions, metered usage, invoices | PLAN.md |
| 2026-10-18 | Hosted AI model APIs behind adapters, custom AFT model later | PLAN.md |
| 2026-10-18 | Media: images and 9:16 video first, then 3D GLB with turntable video | PLAN.md |
| 2026-10-18 | LLMs: multi provider from day one (Claude, OpenAI, Gemini) | PLAN.md |
| 2026-10-18 | App Studio v1 includes live multiplayer collaboration | PLAN.md |
| 2026-10-18 | Subscription modes: shared SaaS, dedicated instance, API plus MCP | PLAN.md |
| 2026-10-18 | Workflow tier: Beta by default, GA for auth, orgs, billing, metering, provisioning, infra, CI/CD, MCP | PLAN.md |
| 2026-10-18 | Build approach: Tracer Bullet | PLAN.md, scope header (pending) |
| 2026-10-18 | Edge cases are cataloged up front with IDs (X, A, C, B, D, M, G, S, I) and traced to specs and tests | PLAN.md |
| 2026-10-18 | Every module is split into small features (1 to 3 days), each specced, built, verified, tested, and shipped on its own | docs/scope/index.md |
| 2026-10-18 | Ship rule: merge, staging, then production behind a feature flag (off until the epic is ready) | docs/scope/index.md |
| 2026-10-18 | Solo engineer with AI agents, no fixed deadline, one feature at a time | docs/scope/index.md |
| 2026-10-18 | Go to market in scope: SEO, analytics, WCAG 2.2 AA, legal, multiple languages and currencies | docs/scope/launch.md |
| 2026-10-18 | Legal pages (feature 124) must ship before billing and generation flags turn on in production | docs/scope/launch.md |
| 2026-10-20 | Local development uses an AWS dev database from the start: Aurora PostgreSQL 17 Serverless v2 (auto pause), eu-west-1, public endpoint locked to the engineer's IP, TLS required. CI keeps its empty Postgres service and no secrets (I6). Production data design stays with `/architect platform architecture` | MEMORY.md |
| 2026-10-20 | Domains: `remwa.tech` (name.com) will point to the platform on AWS; `aft.remwa.tech` is verified in Resend (eu-west-1) and sends as `AFT <no-reply@aft.remwa.tech>`. When DNS moves to Route 53, copy the Resend records first. DNS and hosting design stays with `/architect platform architecture` | MEMORY.md |

## Known defects (fix inside the named scope feature, not ad hoc)

- `lib/auth-client.ts` reads a server env var in the browser (feature 1)
- OTP printed to the console in every environment, edge case A3 (feature 1 or 10)
- Social providers registered with empty secrets, edge case A11 (feature 1)
- Placeholder branding and mock dashboard data (features 10 and 17)

## Session log

### 2026-10-18
- Read the whole codebase (brownfield Next.js 16.2 app: auth built, catalog and dashboard mocked).
- Asked and locked 12 product and architecture decisions with the engineer (see Decisions log).
- Wrote and got approval for the plan, including the full edge case catalog. Saved as PLAN.md.
- Ran `/audit` (gap-fill): filled in root `AGENTS.md`, added the agent persona. No nested `AGENTS.md` yet, because feature 2 (monorepo migration) moves every area; write them per workspace after the move.
- Ran `/scope` (brownfield plan, epic split). Engineer asked that every module be broken into small features that are developed, tested, and deployed on their own. Result: 132 features across 8 epics; platform CI/CD alone is 12 features (10 to 21), customer CI/CD 15 (38, 39, 62 to 74), App Studio 20 (99 to 118). Each `Done when` names its edge case IDs, and every catalog ID is owned by at least one feature.
- Stopped after `/scope`. Next command: `/architect ci repair and test harness`.

### 2026-10-19
- Ran `/architect ci repair and test harness` and wrote spec 0001. Baseline measured: typecheck clean; lint 4 errors and 16 warnings; 3 critical and 29 high runtime advisories (`next`, `better-auth`, plus the `shadcn` CLI misplaced in dependencies); npm 11.19 blocks install scripts; the generated Prisma client is committed with CRLF line endings.
- Engineer's choices: Vitest and Testing Library; six blocking gates (lint, typecheck, test, prisma, audit, build-smoke); coverage reported with no threshold; Node 24 only; tests next to the code; audit fails on high or worse in runtime deps; vulnerabilities and lint fixed in this feature; CI on pull requests, pushes to main, and manual runs; main protected, linear history, squash merges only.
- A cross check on another model found 12 gaps and an ordering problem; all fixes applied (npm pinning, install script approvals, LF normalization, console error detection, an empty Postgres service in the smoke job, branch protection by `gh api`, dependency upgrades before lint fixes).
- Machine note: `npm ci` here can fail on network hiccups; retry with `--fetch-retries=5`. ESLint is slow because it walks `lib/generated` (spec 0001 adds the ignore).
- Next command: `/develop ci repair and test harness`.
- `/develop ci repair and test harness` started on branch `feat/ci-repair-test-harness` (spec 0001 now `In Progress`). Done: build task 1 (Node/npm pinned, install script approvals live in `package.json` `allowScripts` with bare names, `.gitattributes` LF) and task 2 (Vitest 5 harness, 10 passing tests). Version notes: `@vitejs/plugin-react` held at ^5.2 (v6 pulls Babel 8 and clashes with the shadcn CLI), `@types/node` moved to ^24 early because Vitest 5 requires it.
- Bug found by the new test and fixed (`fix(ui)` commit): `components/ui/form.tsx` `FormMessage` never showed field errors, so all 7 auth forms gave no validation feedback.
- Resume at build task 3 (thin CI thread: `ci.yml` with the `test` job, delete `webpack.yml`, open the pull request).
- Side task (engineer request): AWS Agent Toolkit set up and verified. Profile `remwa`, Region `eu-west-1`, classic AWS account `355103369250`. AWS CLI 2.38.1 (installed over a phone hotspot: the home network resets TLS to `awscli.amazonaws.com` only, other AWS endpoints work). `uv` installed. 24 AWS skills in `~/.claude/skills`; `aws-mcp` server in `~/.claude.json` with `AWS_MCP_PROXY_PROFILES=remwa` (backup at `~/.claude.json.bak-before-aws-mcp-profile`). AWS rules added to `AGENTS.md` between markers, with a project note that specs win (the IaC tool is decided in feature 10). Credentials last 12 hours and renew for 90 days without the browser; renew with `aws login --profile remwa`.
- Open risk: the profile signs in as the account **root user**. Create an admin identity (IAM Identity Center) before any real resources; to be covered in the feature 10 spec.
- The production Postgres stays in scope feature 12 (engineer's choice). No AWS resources exist yet.
- Build task 5 done: `next` 16.4.2, `better-auth` 1.7.11, Prisma 7.10.1 (all three packages), `shadcn` CLI moved to devDependencies; `audit-ci` passes with an empty allowlist; `audit` job added. `.env.example` added (all 9 variables).
- Better Auth 1.7 expects the same tables as 1.5 (checked with `getAuthTables`), so no migration was needed. Pre-existing bug found: `Account` has no optional `idToken` column, which Better Auth writes on Google sign in. Fix it (one additive migration) in scope feature 2, auth defect fixes.
- The manual sign up, in, and out check on the upgraded auth is deferred until a local database exists (scope feature 8). This machine has no Postgres and no Docker. The CI smoke test covers page rendering meanwhile.
- Resume at build task 6 (lint gate, after the upgrade).
- Draft PR #2 opened for feature 1: https://github.com/AaronFrancis05/AFT-INC/pull/2. First CI run green (`test`, `typecheck`). GitHub actions bumped to v5 (Node 24 runtime). The repo also has a CodeRabbit review app installed.
- A leftover Vercel project `aft-inc` (team `taremwa-aaron-francis-projects`) was auto-deploying the repo and served a live copy of the old app with a real `DATABASE_URL`, Resend, and OAuth secrets. Hosting is AWS per the plan, so the engineer deleted the project on 2026-10-19 (confirmed 404). The old database had no users. Cleanup owed by the engineer: delete that old database at its provider, and rotate the Google and GitHub OAuth secrets and the Resend key (they were stored readable on Vercel) before features 2 and 14.
- Build tasks 6 to 9 done. Task 6: lint gate, all findings fixed. Task 7: `prisma` job. Task 7b (spec Update 1): better-auth 1.7 refuses to run without `account.idToken` (`SCHEMA_MISMATCH`), so my earlier "no migration needed" note was wrong; the engineer chose to keep 1.7.11 and add the nullable column (migration `20261019200000_add_account_id_token`, applied when the first database exists). Task 8: `build-smoke` job (empty Postgres 17 service, build, Playwright Chromium, 4 smoke tests with console error checks). CI run 39317428115: all six jobs green.
- Task 9: `main` protection applied with the spec's `gh api` command (six required checks, strict, admins included, linear history, no force pushes or deletions, 0 approvals); repo set to squash merges only.
- The engineer deleted the old database and rotated the Google, GitHub, and Resend secrets (cleanup above is done).
- Findings routed to later features: form labels are not linked to their inputs (accessibility, features 27 and 121); a broken Unsplash image on the homepage (edge case C5); the `aws-mcp` server times out on first connect.

### 2026-10-20
- `/check verify ci repair and test harness` first came back FAIL: `build-smoke` was red on the docs commit d4554ee. `/debug` found the cause: an Unsplash photo on the homepage now returns 404, `next/image` proxies it through `localhost:3000/_next/image`, so the smoke filter counted an external failure as an app error, and lazy loading made it timing dependent. Fixed in c0dacf9 (filter sees through the proxy, homepage test scrolls and waits for network idle, dead photo id replaced). This also closes the broken image noted under edge case C5. CI run 39400720181 green on all six checks.
- Verify evidence: all local gates pass; the test, lint, and prisma gates each turn red on a throwaway breakage; a direct push to `main` is rejected (GH006); live branch protection matches the spec.
- Engineer chose an AWS dev database from the start. The account was on the AWS free plan, which only allows Aurora "express configuration" (IAM tokens only, no VPC, no IP lock), so at the engineer's request the account was upgraded to the paid plan ($100 credits carried over) and a $10 a month budget `aft-monthly-10usd` emails the engineer. Created: security group `sg-08cc53cdb07aaff8a` (5432 from the engineer's IP only), subnet group `aft-dev`, cluster `aft-dev` (Aurora PostgreSQL 17.11, Serverless v2 0 to 2 ACU, auto pause after 10 minutes, password in Secrets Manager, encrypted, deletion protection on) and instance `aft-dev-1`. TLS verifies the server with the RDS eu-west-1 CA bundle (path in `.env` `sslrootcert`). `prisma migrate deploy` applied both migrations; `account.idToken` confirmed live (AC-14).
- The manual auth check on better-auth 1.7 passed: the engineer signed in with Google (stored an `idToken`) after adding `http://localhost:3000/api/auth/callback/google` to the Google OAuth client; a browser script ran email sign up, OTP verify, sign in, dashboard, and sign out (session deleted, `/dashboard` redirects). Test users exist in the dev database (one Google, one `delivered+aft-verify-…@resend.dev`).
- The earlier note "No AWS resources exist yet" is out of date; the production data design is still owed to `/architect platform architecture`.
- `/test ci repair and test harness`: scoped to the feature branch (no uncommitted source). Added `test-preferences.json` (Vitest, Testing Library, Playwright, tests beside the code, from spec 0001) and 6 test files, 47 new tests (57 total, all green; typecheck and lint clean): `FormMessage`, `useIsMobile`, `useSessionStorageValue`, verify email (countdown, resend, verify), reset password, sign up, and `ci.test.ts`, a contract test that pins AC-1, AC-8, AC-10, AC-11, AC-13 by reading `ci.yml`, the setup action, `.nvmrc`, and `package.json`. OTP tests stub `ResizeObserver` and `document.elementFromPoint` per file (jsdom lacks them); user-event clicks hang under fake timers, so those tests switch to real timers before clicking. Scope `Test it` ticked.
- Finding for feature 2 (auth defect fixes): `components/auth/sign-up.tsx` runs `console.log("SIGNUP ERROR CONTEXT:", ctx)` on a failed sign up. The better-fetch context can carry the request, so the password may reach the browser console. Not locked in by a test.
- Next command: `/check review ci repair and test harness`.

### 2026-10-20 (review follow-up)
- `/check review` on sonnet: Approve with nits (0 blockers, 0 majors, 4 minors), findings in `docs/reviews/2026-10-20-feat-ci-repair-test-harness.md`. `/document` rewrote the PR #2 title and body. Scope `Review it` and `Document it` ticked.
- CodeRabbit reviewed PR #2 (9 comments plus the A3 OTP log, which stays with feature 2) and the engineer ran its autofix (commit 0020439). Kept: `persist-credentials: false` on all six checkouts (now pinned in `ci.test.ts`), the `list` reporter in CI, the homepage smoke without the scroll and `networkidle` wait, and the corrected `AGENTS.md` stack, test command, and CI gotcha. Reverted at the engineer's choice: the `form.tsx` label and error linking (stays with features 27 and 121, which should pick shadcn's standard Slot and `useFormField` pattern through a spec) and the `PLAN.md` relabels (the approved plan changes only through `/architect` or `/scope`).
- Spec 0001 still names `actions/*@v4` while CI uses `@v5` (deliberate, Node 24 runtime); owed a short spec note through `/architect`. A `prisma migrate diff` CI check is a follow up for feature 8 or 12.
- Next command: squash merge PR #2, then close out feature 1 (`done`, spec `Accepted`), `/sync`, `/clear`, and `/develop auth defect fixes`.
- PR #2 marked ready and squash merged (fc11e16) with all six checks green. Feature 1 set `done` in the scope, spec 0001 `Accepted`. `main` is protected, so the close out edits live on branch `docs/close-feature-1`.

### 2026-10-21
- `/sync` from the feature 1 merge (fc11e16) on branch `docs/close-feature-1`: `AGENTS.md` got the Build approach (Tracer Bullet), `npm ci` with the pinned toolchain, the typecheck, test, and e2e commands, `.env.example`, test placement and the `ci.test.ts` contract rule, plus gotchas for install script approvals and the jsdom OTP stubs. The `next dev` agent rules block is committed so the tree stays clean. Scope and spec 0001 were already current.
- Agent skills installed per project in `.claude/skills/` (pinned in `skills-lock.json`), at the engineer's pick: `vitest` (antfu/skills), `react-testing-library` (pproenca/dot-skills), `playwright-cli` (microsoft/playwright-cli), `playwright-best-practices` (currents-dev). Scanned clean before recording. `@playwright/mcp` recorded as recommended; the engineer connects it. No skill exists for audit-ci.
- `/architect auth defect fixes` wrote spec 0002 (`Proposed`, linked to scope feature 2, now `in-progress`). Engineer's picks: same origin auth client (no `baseURL`); a provider is on only when both ID and secret are set (trimmed), and one helper in `lib/auth-providers.ts` feeds `lib/auth.ts` and the sign in and sign up pages through a prop; both pages `force-dynamic`; 0 providers hides the buttons and divider, 1 is full width; the OTP fallback log only under `NODE_ENV === "development"`; the sign up `console.log` deleted. Nearby issues kept out and routed: A4 to feature 44, `lib/email.tsx` PII logs to 22, `profile.tsx` logs to 7. A Sonnet cross check found 13 gaps; all fixes applied (a pure `warnMissingSocialProviders`, exact warning text, test setup, removing the stale `BETTER_AUTH_URL` in `vitest.config.mts`, exact `.env.example` comments).
- Engineer asked mid run to "implement the SSO architecture". Clarified: SSO means AFT as the OIDC identity provider (PLAN.md, scope feature 38), designed as its own umbrella spec after feature 2's spec. Not started.
- The spec and scope edits sit uncommitted on `main` (protected): commit them on the feature 2 branch.
- Next command: `/clear`, then `/develop auth defect fixes`. After that, `/architect sso architecture` (AFT as identity provider).
- Engineer is registering a GitHub OAuth app for `https://remwa.tech`. Told them the redirect URI must be `https://remwa.tech/api/auth/callback/github` (their draft lacked `/auth`), plus `http://localhost:3000/api/auth/callback/github` for local work.
- `/architect route 53 dns for remwa.tech` wrote spec 0003 (`Proposed`, slice 1 of scope feature 13, now `in-progress`). Picks: Organizations plus Identity Center first (eu-west-1, MFA on every sign in, user `admin`, profile `aft-admin`) so root stops being used; the zone created by AWS CLI from `infra/dns/remwa.tech.records.json`, imported into IaC in feature 10; the whole domain moves (registration stays at name.com); compare before and after the switch; 7 day rollback window. Five Resend records known (`rsend.aft` CNAME found on the name.com page, missed by lookups). A Sonnet cross check gave 26 findings, all applied. Nothing created in AWS or changed at name.com yet. The `remwa` profile is an `aws login` session (no access keys).
- Owed by the engineer before building 0003: the name.com CSV export (save as `infra/dns/name.com-export-2026-10-21.csv`) and whether URL Forwarding or Email Forwarding has any entries.
- Next commands: `/develop auth defect fixes` (feature 2), then `/develop route 53 dns for remwa.tech`, then `/architect sso architecture`.
- Engineer supplied the name.com CSV export (saved to `infra/dns/name.com-export-2026-10-21.csv`): exactly the five known records, all TTL 300, no extras. URL Forwarding at name.com shows no entries (only the empty create form). Email Forwarding is not confirmed yet; check it before the 0003 switch.
- `/develop auth defect fixes` on branch `feat/auth-defect-fixes` (spec 0002 now `In Progress`, split into `docs/specs/0002-auth-defect-fixes/` with `index.md`, `rationale.md`, `verify.md`). Built every code task: `lib/auth-providers.ts` (resolve plus warn), `lib/auth-otp.ts` (OTP log only under `next dev`), `lib/auth.ts` wired, `components/auth/social-buttons.tsx`, both forms take a required `socialProviders` prop, both pages `force-dynamic`, the sign up `console.log` removed, no `baseURL` in `lib/auth-client.ts`, stale `BETTER_AUTH_URL` removed from `vitest.config.mts`, `.env.example` comments. Gates: lint and typecheck clean, 81 tests pass (24 new), build shows sign in and sign up as dynamic, one build started with 0, 1, 2 providers shows 0, 1, 2 buttons.
- `BETTER_AUTH_SECRET` is set in `.env` (128 characters; an earlier check misread it as empty). With it, the build is clean and all 4 local smoke tests pass.
- Fixed at the engineer's request: stale placeholder spec numbers in the scope (feature 3 said "spec 0001", feature 7 said "Spec 0002") now name no number. PLAN.md line 364 still says "seed for spec 0001 data child" (it means the platform architecture spec); PLAN.md changes only through `/architect` or `/scope`.
- Next command: `/check verify auth defect fixes` (manual pass against the dev database, steps in `verify.md`).
- `/check verify auth defect fixes` (2026-10-21, branch `feat/auth-defect-fixes`): PASS. The engineer confirmed a full Google sign in to the dashboard by hand, which closed AC-8 (engineer reported, not machine observed). Lint, typecheck, 81 tests (22 named `A11:`/`A3:`), build (sign in and sign up `ƒ`), 4 e2e smokes with blank OAuth keys, and the client `process.env` grep all pass. One `next start` build under 4 env cases showed 0, 1 (full width), 2 buttons and the exact half configured warning with no value. A browser run on `next dev` against the dev database passed sign up, OTP verify, sign in, dashboard, sign out, forgot and reset password (old password 401), and the Google redirect start; all 12 auth requests went to `http://localhost:3000`. Under `next start` the stored OTP never reached the log. Windows gotcha: an empty env var is deleted, so `.env` refills it; use a single space to blank an OAuth key.
- Finding: a duplicate email sign up returns 200 and shows "Account created!" (Better Auth hides existing accounts when verification is required) and sends the existing user a new OTP. So the AC-7 step in `verify.md` ("toast shows the error") can never happen as written; AC-7 was proven with a forced 422 instead. The step wording is owed a fix through `/develop`; the behavior belongs with A4 in feature 44.
- The engineer's public IP changed to `102.86.0.245`; at their request the dev database rule in `sg-08cc53cdb07aaff8a` was swapped from `197.239.8.167/32` to it (still one address). Test users added to the dev database: `delivered+aft-verify-1792607226824@resend.dev` and one `delivered+aft-verify-prod-…@resend.dev`.
