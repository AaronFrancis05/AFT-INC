# Epic: Foundation and platform engineering

Back to the [scope index](index.md).

Everything every later feature stands on: a green pipeline, the monorepo, shared standards, the AWS platform, the CI/CD pipeline for AFT itself (broken into small shippable steps), flags, observability, background work, the design system, and multiple languages. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

Since 2026-10-24 the platform runs on one EC2 server per spec [0007](../specs/0007-lean-hosting-customer-delivery/index.md); features 9 to 18 and 148 follow its *Path to live* (steps 1 to 11), and its child 0001 holds the build detail.

## Foundation: repair and decide

### 1. CI repair and test harness · done · GA
Fix the broken CI and add a real test runner, so every later feature lands on a green pipeline.
**Done when:** every pull request runs lint, typecheck, unit tests, and build, and all pass on `main`; pull requests from forks get no secrets (I6).
- [x] Design it (spec): `/architect ci repair and test harness`
- [x] Build it: `/develop ci repair and test harness`
   - [x] Toolchain pinned (Node, npm, install scripts, LF line endings) (AC-5, AC-11)
   - [x] Vitest harness, starter tests, and the thin CI thread with typecheck (AC-1, AC-2, AC-3, AC-9, AC-10, AC-13)
   - [x] Dependencies patched and audit gate live, then lint fixed and gated (AC-4, AC-8)
   - [x] Prisma gate and the build plus Playwright smoke gate (AC-5, AC-6, AC-7)
   - [x] `main` protected through the GitHub CLI (AC-12)
- [x] Verify it: `/check verify ci repair and test harness`
- [x] Test it: `/test ci repair and test harness`
- [x] Review it (fresh model): `/check review ci repair and test harness`
- [x] Document it: `/document ci repair and test harness`
- [x] Ship it: squash merge the pull request with all six checks green (staging does not exist yet)
Spec [0001](../specs/0001-ci-repair-test-harness.md)

### 2. Auth defect fixes · done · GA
Fix the three known auth defects before anything builds on top of them.
**Done when:** the browser auth client uses a correct public base URL; the OTP is never printed outside development (A3); Google and GitHub sign in appear only when their keys are configured (A11).
- [x] Design it (spec): `/architect auth defect fixes`
- [x] Build it: `/develop auth defect fixes`
   - [x] Provider helper and server registration, with the A11 unit tests (AC-2, AC-3, AC-9)
   - [x] Sign in, then sign up: shared social buttons, dynamic pages, and the sign up log removed (AC-4, AC-5, AC-7, AC-9)
   - [x] OTP log gated to development, with the A3 tests (AC-6, AC-9)
   - [x] Same origin auth client, stale test env and `.env.example` comments, full gate run and manual pass (AC-1, AC-5, AC-8) (manual pass done in `/check verify`)
code in `lib/auth-providers.ts`, `lib/auth-otp.ts`, `lib/auth.ts`, `lib/auth-client.ts`, `components/auth/`, `app/(auth)/auth/`
- [x] Verify it: `/check verify auth defect fixes`
- [x] Test it: `/test auth defect fixes`
- [x] Review it (fresh model): `/check review auth defect fixes`
- [x] Document it: `/document auth defect fixes`
- [x] Ship it: squash merge the pull request with all six checks green (staging does not exist yet)
Spec [0002](../specs/0002-auth-defect-fixes/index.md)

### 3. Platform architecture · done · GA
The umbrella decision for the whole platform: monorepo layout, AWS and Kubernetes topology, data and tenancy model, workflow engine, provider adapter pattern, environments and releases.
**Done when:** the platform architecture spec is accepted, and every later spec can point to it instead of deciding these again.
- [x] Decide the architecture (spec): `/architect platform architecture`
Spec [0005](../specs/0005-platform-architecture/index.md) (accepted 2026-10-22: ECS Fargate instead of EKS), partly superseded by spec [0007](../specs/0007-lean-hosting-customer-delivery/index.md) (accepted 2026-10-24: one EC2 server, no customer hosting); Foundation now follows spec 0007's Path to live

### 4. Monorepo migration · done · GA
Move the current app into `apps/web` and pull shared code into packages, with no change in behavior.
**Done when:** the app runs from `apps/web` and behaves exactly as before (auth flows, dashboard); `packages/db`, `packages/auth`, `packages/ui`, `packages/email`, `packages/config` exist; the existing migration is preserved; edge cases I18 to I28 hold.
- [x] Design it (spec): `/architect monorepo migration`
- [x] Build it: `/develop monorepo migration`
   - [x] Preflight and toolchain switch: open branches closed, baselines saved, pnpm 12.15.0 plus Turborepo, CI and `ci.test.ts` on pnpm, `pnpm audit` (AC-1, AC-7, AC-8, AC-9, AC-10, AC-18)
   - [x] App moved to `apps/web` with root `.env` loading and the workspace root set (AC-2, AC-6, AC-13, AC-17)
   - [x] `packages/config` and `packages/db`: shared configs, catalog, generated Prisma client, `server-only`, strict env (AC-3, AC-4, AC-11, AC-12, AC-14, AC-15)
   - [x] `packages/email`, `packages/auth`, `packages/ui`: code, tests, shadcn and Tailwind setup (AC-2, AC-11, AC-12, AC-16, AC-19)
   - [x] Parity pass: tests, routes, lockfile versions, manual auth run on the dev database (AC-5, AC-6)
   - [x] Audit fix: build only tools and `@aft/config`'s peers back to dev dependencies, two every workspace CI checks, `pnpm audit --prod` passes (AC-9, I31)
   - [x] Review fixes: test runs capped at two Turborepo tasks and two Vitest workers per config, a 120 second ESLint test hook, uncached CI reruns, per job cache keys, narrow root test inputs, `@next/env` in the catalog, proven by four local and three CI runs (AC-14, AC-15, AC-20, I32)
- [x] Verify it: `/check verify monorepo migration`
- [x] Test it: `/test monorepo migration`
- [x] Review it (fresh model): `/check review monorepo migration`
- [x] Document it: `/document monorepo migration`
- [x] Ship it: squash merge the pull request with all six checks green
Spec [0008](../specs/0008-monorepo-migration/index.md)
code in `apps/web/`, `packages/config/`, `packages/db/`, `packages/email/`, `packages/auth/`, `packages/ui/`

### 5. Workspace tooling · done
Shared lint, format, type settings, and commit hooks for every workspace.
**Done when:** one command lints, formats, and typechecks every workspace, and commit hooks block unformatted code.
Spec: [0009](../specs/0009-workspace-tooling/index.md). Ships as two PRs (format, then tooling), a one off exception so `git blame` can skip the reformat.
- [x] Design it (spec): `/architect workspace tooling`
- [x] Build it: `/develop workspace tooling` (code in `lint-staged.config.mjs`, `scripts/lint-staged/`, `.husky/`, `packages/config/`)
   - [x] PR 1, the reformat: Prettier config, ignore file, `.editorconfig`, and one repo wide `prettier --write`, merged alone (AC-1, AC-2, I18, I24, I42); squash 7c7c901 (#15)
   - [x] Commit hook and one command: Husky, lint-staged with the per workspace ESLint helper, `pnpm check`, `pnpm format`, Prisma format, the CI Format step, `HUSKY=0` (AC-4 to AC-10, I33 to I39, I44)
   - [x] Stricter rules: `noUncheckedIndexedAccess` and two more flags, the promise lint rules, `eslint-config-prettier`, the `@aft/config` tsconfig, and the fixes (AC-11, AC-12, I41)
   - [x] Editor files, `.git-blame-ignore-revs`, and the `ci.test.ts` checks (AC-3, AC-13, AC-14, I40, I43, I45)
- [x] Verify it: `/check verify workspace tooling`
- [x] Test it: `/test workspace tooling`
- [x] Ship it: squash merge both pull requests with all six checks green, PR 1 first

### 6. Typed environment config · in-progress
One validated config schema per app, so a missing or wrong secret stops the app at boot, not in production traffic.
**Done when:** a missing or malformed variable fails startup with a clear message; `.env.example` lists every variable; production refuses test mode payment keys (B13).
Spec: [0010](../specs/0010-typed-environment-config/index.md).
- [x] Design it (spec): `/architect typed environment config`
- [ ] Build it: `/develop typed environment config`
   - [x] Thread: `@aft/config/env`, the db slice, `apps/web/env.ts`, the start check in `instrumentation.ts`, `AFT_ENV` in `.env.example`, turbo, CI, and every Vitest setup (AC-1, AC-2, AC-3, AC-4, AC-9, AC-10, AC-14, I46 to I51)
   - [x] Auth and email slices, the production rules, and the B13 helper (AC-5, AC-6, AC-7, AC-8, A12, A3, B13)
   - [ ] The `env-schema.json` exporter and the drift contract test (AC-11, AC-12, I52, I22)
   - [ ] The `process.env` lint ban (AC-13, I53)
- [ ] Verify it: `/check verify typed environment config`
- [ ] Test it: `/test typed environment config`
- [ ] Ship it: squash merge the pull request with all six checks green

### 7. Engineering standards and shared helpers · needs a decision · GA
One standard spec: one way to do errors, logging, validation, idempotency, tenant scoping, and API style, shipped as shared helpers.
**Done when:** shared helpers exist with tests for: idempotent mutations (X1), input validation and size limits (X8), money and time handling (X10), untrusted model output (X14), and tenant scoped data access that returns 404 across workspaces (X15).
- [ ] Design it (spec): `/architect engineering standards and shared helpers`

### 8. Local dev stack · needs a decision
One command runs the apps locally against the `dev` database on the EC2 server, with seed data.
**Done when:** a fresh clone runs the apps locally through one command that opens the SSM port forward to `dev` as `aft_dev` (spec 0007 AC-13), seeds data, and catches mail; no Docker or cache is needed on the engineer's machine.
- [ ] Design it (spec): `/architect local dev stack`

### 9. Container images · in-progress · GA
Production ARM64 container images for each app, plus a `migrate` target (spec 0007 path step 2).
**Done when:** each app builds a small, non root ARM64 image with a shallow `/healthz` and an internal `/readyz`, JSON logs, and a clean stop within 30 seconds of SIGTERM (AC-17); the `migrate` target runs Prisma migrations.
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (containers).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop container images`
   - [ ] `apps/web` standalone ARM64 image, non root, `/healthz` and `/readyz`, SIGTERM (AC-17)
   - [ ] `migrate` image target with the Prisma CLI (AC-17)
- [ ] Verify it: `/check verify container images`
- [ ] Test it: `/test container images`
- [ ] Review it (fresh model): `/check review container images`
- [ ] Document it: `/document container images`
- [ ] Ship it: squash merge with all checks green

## Foundation: AWS platform

### 10. AWS foundation · in-progress · GA
The `aft-production` member account, its guardrails, CDK, keyless CI roles, and the budget (spec 0007 path step 3).
**Done when:** the account exists with the Region SCP (AC-2), CDK is bootstrapped and every resource is in code (AC-16), CI reaches AWS only through `aft-ci-push` and `aft-ci-deploy` (AC-8), and the $28 budget plus the `cdk synth` cost check are live (AC-1, I15).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (account and CI roles).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop aws foundation`
   - [ ] Member account, SCP, Identity Center permission set, CDK bootstrap (AC-2, AC-16)
   - [ ] Both GitHub OIDC roles and the `aft-deploy` SSM document (AC-8)
   - [ ] $28 budget with alerts, `cdk synth` resource allow list check (AC-1)
- [ ] Verify it: `/check verify aws foundation`
- [ ] Test it: `/test aws foundation`
- [ ] Review it (fresh model): `/check review aws foundation`
- [ ] Document it: `/document aws foundation`
- [ ] Ship it: squash merge with all checks green

### 11. Server and Compose · in-progress · GA
The VPC, the single EC2 instance, Docker Compose, and its alarms (spec 0007 path step 4).
**Done when:** the instance runs with only 80 and 443 open and SSM only access (AC-3), IMDS reachable only by the worker (AC-4), container memory limits within 1,150 MB and swap active (AC-6), the A records point at the Elastic IP, and every alarm emails the engineer (AC-12, I9, I10, I11, I16).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (network, instance, containers, alerts).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop server and compose`
   - [ ] VPC, security group, instance, Elastic IP, A records, with CDK assertion tests (AC-3)
   - [ ] Host bootstrap: Docker, git, swap, iptables metadata rule, render scratch quota (AC-4, AC-6)
   - [ ] Compose file with limits and health checks, Caddy placeholder site (AC-6)
   - [ ] Alarms: status checks with recover, memory, disk, CPU credits, Route 53 health check (AC-12)
- [ ] Verify it: `/check verify server and compose`
- [ ] Test it: `/test server and compose`
- [ ] Review it (fresh model): `/check review server and compose`
- [ ] Document it: `/document server and compose`
- [ ] Ship it: squash merge with all checks green

### 12. Data services · in-progress · GA
Postgres on the box with spec 0005's roles, backups to S3, the restore drill, and the move off Aurora (spec 0007 path step 5).
**Done when:** Postgres runs with databases `aft`, `dbos`, `dev` and every role (AC-13); nightly globals, dumps, and Caddy data reach S3 with a heartbeat alarm (AC-10); the monthly restore drill passes (AC-11, I8); `aft-dev` data lives in `dev` and the Aurora cluster is deleted (AC-13); a lost volume can be rebuilt (I12).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (data and backups).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop data services`
   - [ ] Postgres container, `bootstrap-roles.sql`, loopback only port (AC-4, AC-13)
   - [ ] Backup timer, S3 bucket rules, heartbeat, DLM snapshots (AC-10)
   - [ ] Restore drill and its alarm (AC-11)
   - [ ] Move `aft-dev` into `dev`, then delete the Aurora cluster (AC-13)
- [ ] Verify it: `/check verify data services`
- [ ] Test it: `/test data services`
- [ ] Review it (fresh model): `/check review data services`
- [ ] Document it: `/document data services`
- [ ] Ship it: squash merge with all checks green

### 13. Edge, DNS, and certificates · in-progress · GA
Public entry: `remwa.tech` DNS on Route 53, then HTTPS from Caddy on the server (spec 0007 path step 7).
**Done when:** `remwa.tech` and `www` serve valid certificates from Caddy with the `www` and HTTP redirects (AC-5, I13), and apps read the client IP only from Caddy's header (AC-14).
- [ ] Slice 1, remwa.tech DNS on Route 53 (spec [0003](../specs/0003-route53-dns-remwa-tech/index.md)): `/develop route 53 dns for remwa.tech`
   - [x] Admin identity: Organizations and Identity Center with MFA, `aft-admin` profile (AC-1, AC-2, AC-3) (verification email, second root MFA device, and contacts confirmed by the engineer on 2026-10-24)
   - [x] Records file from the name.com export, zone created and tagged, records applied and compared (AC-4, AC-5, AC-6)
   - [x] Nameserver switch at name.com, confirmed at 1 hour and 48 hours, 7 day rollback window (AC-7, AC-8) (switched 2026-10-21; 48 hour check passed 2026-10-24; keep the name.com records until 2026-10-28)
   - [x] Scope check: nothing else created, budget unchanged during the slice (AC-9) (the Identity Center us-west-2 replica and its KMS keys were removed again; the key is pending deletion; on 2026-10-24 the budget was replaced by `aft-monthly-28usd` for spec 0007)
   - [x] Verify it: `/check verify route 53 dns for remwa.tech`
   - [x] Review it (fresh model): `/check review route 53 dns for remwa.tech`
   - [x] Document it: `/document route 53 dns for remwa.tech`
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery` (spec [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001: Caddy certificates, no CDN or WAF at this size)
- [ ] Slice 2, HTTPS and client IP: `/develop edge dns and certificates`
   - [ ] Caddyfile with `email`, `www` and HTTP redirects, `/readyz` and `/internal/*` blocked (AC-5)
   - [ ] Client IP from Caddy's `X-Forwarded-For`, one trusted hop (AC-14)
- [ ] Verify it: `/check verify edge dns and certificates`
- [ ] Test it: `/test edge dns and certificates`
- [ ] Ship it: squash merge with all checks green

### 14. Secrets delivery · in-progress · GA
Secrets live in Parameter Store and reach each container as an env file written at deploy time, never touching the repo (spec 0007 path step 6).
**Done when:** `seed-parameters.ts` lists every name, the deploy fails when a schema name is missing, and env files are written `0600` as root (AC-9); rotating a value takes effect on the next deploy (X12, dual key windows per app).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (secrets).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop secrets delivery`
   - [ ] Seed script and the env schema export per app (AC-9)
   - [ ] Deploy time name check and env file rendering (AC-9)
- [ ] Verify it: `/check verify secrets delivery`
- [ ] Test it: `/test secrets delivery`
- [ ] Review it (fresh model): `/check review secrets delivery`
- [ ] Document it: `/document secrets delivery`
- [ ] Ship it: squash merge with all checks green

## Foundation: CI/CD for the platform

### 15. GitOps and environments · dropped
Folded into features 10 to 18 by spec 0007: there is one production environment described in CDK and the Compose release bundle, and no staging.

### 16. Image pipeline and release bundles · in-progress · GA
CI builds ARM64 images on every merge, pushes them by digest, and uploads a release bundle (spec 0007 path step 8).
**Done when:** each merge pushes images to ECR by digest (I3) and uploads `compose.yml`, `Caddyfile`, `deploy.sh`, `bootstrap-roles.sql`, `digests.env`, `env-schema.json` to `releases/<sha>/` through `aft-ci-push` (AC-7, AC-8); the migration lint blocks unsafe migrations (X9); forks never get secrets (I6). Image scanning, SBOM, and signing (I7) thicken it later.
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (deploys).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop image pipeline and release bundles`
   - [ ] ARM64 build and ECR push by digest on merge (AC-7)
   - [ ] Release bundle upload and the migration lint (AC-7, X9)
- [ ] Verify it: `/check verify image pipeline and release bundles`
- [ ] Test it: `/test image pipeline and release bundles`
- [ ] Review it (fresh model): `/check review image pipeline and release bundles`
- [ ] Document it: `/document image pipeline and release bundles`
- [ ] Ship it: squash merge with all checks green

### 17. Database migration gate · in-progress · GA
Migrations run as their own guarded step before containers are replaced (spec 0007 path step 9).
**Done when:** each deploy takes a pre migration dump, dry runs `migrate` on `restore_check`, and stops on failure while the old release keeps serving (I2, I17); then the worker stops and `migrate` runs against `aft` and `dbos` (AC-7).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (deploys).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop database migration gate`
   - [ ] Pre migration dump and the dry run on `restore_check` (AC-7, I17)
   - [ ] Worker stop, `migrate`, worker start (AC-7)
- [ ] Verify it: `/check verify database migration gate`
- [ ] Test it: `/test database migration gate`
- [ ] Review it (fresh model): `/check review database migration gate`
- [ ] Document it: `/document database migration gate`
- [ ] Ship it: squash merge with all checks green

### 18. Approved deploy to production · in-progress · GA
After approval, a release reaches the server through the `aft-deploy` SSM document, with smoke tests and automatic rollback (spec 0007 path step 10).
**Done when:** a deploy needs the `production` approval, never overlaps another deploy or a backup, passes the web and auth smoke tests, and rolls back to the previous release on failure (AC-7, I14); measured downtime stays at or under 30 seconds (AC-15).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001 (deploys).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop approved deploy to production`
   - [ ] `deploy` job with approval and `concurrency`, the `aft-deploy` document with `flock` (AC-7)
   - [ ] Smoke tests, automatic rollback, image and release pruning (AC-7, I14)
   - [ ] Downtime measurement (AC-15)
- [ ] Verify it: `/check verify approved deploy to production`
- [ ] Test it: `/test approved deploy to production`
- [ ] Review it (fresh model): `/check review approved deploy to production`
- [ ] Document it: `/document approved deploy to production`
- [ ] Ship it: squash merge with all checks green

### 148. First production go live · in-progress · GA · from spec 0007
The last path step: prove the box holds up, rehearse a rebuild, turn on the sign up gate, and serve `remwa.tech` (spec 0007 path step 11).
**Done when:** the load test plus one 50 MB render stays under 85 percent memory with no OOM kill (AC-6), the rebuild rehearsal finishes within 2 hours (AC-11, I12), the sign up gate is on (AC-18), and `remwa.tech` serves the app.
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0001.
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop first production go live`
   - [ ] Load test with a render, or switch to `t4g.medium` (AC-6)
   - [ ] Rebuild rehearsal on a temporary instance (AC-11)
   - [ ] Sign up gate on, first release live (AC-18)
- [ ] Verify it: `/check verify first production go live`
- [ ] Test it: `/test first production go live`
- [ ] Review it (fresh model): `/check review first production go live`
- [ ] Document it: `/document first production go live`
- [ ] Ship it: `remwa.tech` serves the app

### 19. Production promotion and canary · dropped
Dropped by spec 0007: one server has no traffic splitting; feature 18 covers approval, smoke tests, and rollback.

### 20. Pull request previews · dropped
Dropped by spec 0007: no preview environments on a single 2 GB server; CI tests every pull request.

### 21. Feature flags · needs a decision
Every feature ships dark and turns on per environment, workspace, or user.
**Done when:** a flag can be checked on server and client, targets an environment, workspace, or user, and defaults to off in production.
- [ ] Design it (spec): `/architect feature flags`

## Foundation: runtime services

### 22. Tracing and structured logs · needs a decision
One trace follows a request across every app and background job.
**Done when:** a request shows as a single trace from web to worker, and logs are structured and linked to that trace.
- [ ] Design it (spec): `/architect tracing and structured logs`

### 23. Error tracking, alerts, and SLOs · needs a decision
Errors are captured with context, and alerts fire on what users feel.
**Done when:** errors from every app reach one place with release and user context, and each platform service has an availability goal with an alert.
- [ ] Design it (spec): `/architect error tracking alerts and slos`

### 24. Durable workflow engine and worker · needs a decision · GA
Long and multi step work runs in workers that retry and survive crashes.
**Done when:** a sample workflow survives a worker restart midway and finishes exactly once (X4), long requests return a job id with live progress (X5), and calls to slow providers use timeouts, retries, and a circuit breaker (X6).
- [ ] Design it (spec): `/architect durable workflow engine and worker`

### 25. Outbox and webhook inbox · needs a decision · GA
Events leave the database reliably, and incoming webhooks are processed once.
**Done when:** events are published only after their transaction commits (X4), duplicate webhooks are ignored (X2), out of order webhooks resolve to the provider's current state (X3), and retried requests are safe (X1).
- [ ] Design it (spec): `/architect outbox and webhook inbox`

### 26. Rate limiting and request guards · needs a decision
Protect every public endpoint from abuse and bad input.
**Done when:** limits apply per IP, user, workspace, and key with a 429 and `Retry-After` (X7), counted in Postgres (no Redis, spec 0007), and oversized or malformed requests get a clean 4xx with no stack trace (X8).
- [ ] Design it (spec): `/architect rate limiting and request guards`

## Foundation: experience

### 27. Design system and AFT brand · needs a decision
The visual language for every screen, written into `design.md`, replacing the placeholder branding.
**Done when:** `design.md` defines type, color, spacing, and components; the "Better Auth" and "My App" placeholders are gone; base components meet WCAG 2.2 AA for focus, keyboard, and contrast.
- [ ] Design it (spec): `/architect design system and aft brand`

### 149. Adopt the cn class merger · needs a decision · from spec 0008
Switch `@aft/ui` from its own `cn` (`clsx` plus `tailwind-merge`) to shadcn's `cn` package, so new shadcn components need no post add rewrite.
**Done when:** `packages/ui/src/lib/utils.ts` re-exports `cn` from `cn`; `clsx` and `tailwind-merge` are gone; class merge output matches on every primitive and app call; the post add rewrite, its lint guard, and edge case I29 are retired.
- [ ] Design it (spec): `/architect adopt the cn class merger`

### 28. Internationalization foundation · needs a decision
Every user facing string is translatable from day one, so languages never need a retrofit.
**Done when:** UI strings come from message files, the locale is detected and switchable, and dates, numbers, and money format per locale (X10).
- [ ] Design it (spec): `/architect internationalization foundation`
