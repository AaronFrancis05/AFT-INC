# Epic: Foundation and platform engineering

Back to the [scope index](index.md).

Everything every later feature stands on: a green pipeline, the monorepo, shared standards, the AWS platform, the CI/CD pipeline for AFT itself (broken into small shippable steps), flags, observability, background work, the design system, and multiple languages. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Foundation: repair and decide

### 1. CI repair and test harness · in-progress · GA
Fix the broken CI and add a real test runner, so every later feature lands on a green pipeline.
**Done when:** every pull request runs lint, typecheck, unit tests, and build, and all pass on `main`; pull requests from forks get no secrets (I6).
- [x] Design it (spec): `/architect ci repair and test harness`
- [ ] Build it: `/develop ci repair and test harness`
   - [ ] Toolchain pinned (Node, npm, install scripts, LF line endings) (AC-5, AC-11)
   - [ ] Vitest harness, starter tests, and the thin CI thread with typecheck (AC-1, AC-2, AC-3, AC-9, AC-10, AC-13)
   - [ ] Dependencies patched and audit gate live, then lint fixed and gated (AC-4, AC-8)
   - [ ] Prisma gate and the build plus Playwright smoke gate (AC-5, AC-6, AC-7)
   - [ ] `main` protected through the GitHub CLI (AC-12)
- [ ] Verify it: `/check verify ci repair and test harness`
- [ ] Test it: `/test ci repair and test harness`
- [ ] Review it (fresh model): `/check review ci repair and test harness`
- [ ] Document it: `/document ci repair and test harness`
- [ ] Ship it: squash merge the pull request with all six checks green (staging does not exist yet)
Spec [0001](../specs/0001-ci-repair-test-harness.md)

### 2. Auth defect fixes · GA
Fix the three known auth defects before anything builds on top of them.
**Done when:** the browser auth client uses a correct public base URL; the OTP is never printed outside development (A3); Google and GitHub sign in appear only when their keys are configured (A11).
- [ ] Build it: `/develop auth defect fixes`

### 3. Platform architecture · needs a decision · GA
The umbrella decision for the whole platform: monorepo layout, AWS and Kubernetes topology, data and tenancy model, workflow engine, provider adapter pattern, environments and releases.
**Done when:** spec 0001 is accepted, and every later spec can point to it instead of deciding these again.
- [ ] Decide the architecture (spec): `/architect platform architecture`

### 4. Monorepo migration · needs a decision · GA
Move the current app into `apps/web` and pull shared code into packages, with no change in behavior.
**Done when:** the app runs from `apps/web` and behaves exactly as before (auth flows, dashboard); `packages/db`, `packages/auth`, `packages/ui`, `packages/email`, `packages/config` exist; the existing migration is preserved.
- [ ] Design it (spec): `/architect monorepo migration`

### 5. Workspace tooling · needs a decision
Shared lint, format, type settings, and commit hooks for every workspace.
**Done when:** one command lints, formats, and typechecks every workspace, and commit hooks block unformatted code.
- [ ] Design it (spec): `/architect workspace tooling`

### 6. Typed environment config · needs a decision
One validated config schema per app, so a missing or wrong secret stops the app at boot, not in production traffic.
**Done when:** a missing or malformed variable fails startup with a clear message; `.env.example` lists every variable; production refuses test mode payment keys (B13).
- [ ] Design it (spec): `/architect typed environment config`

### 7. Engineering standards and shared helpers · needs a decision · GA
Spec 0002: one way to do errors, logging, validation, idempotency, tenant scoping, and API style, shipped as shared helpers.
**Done when:** shared helpers exist with tests for: idempotent mutations (X1), input validation and size limits (X8), money and time handling (X10), untrusted model output (X14), and tenant scoped data access that returns 404 across workspaces (X15).
- [ ] Design it (spec): `/architect engineering standards and shared helpers`

### 8. Local dev stack · needs a decision
One command brings up every dependency locally, with seed data.
**Done when:** a fresh clone runs the whole platform locally (database, cache, object storage, mail catcher) with seed data in one command.
- [ ] Design it (spec): `/architect local dev stack`

### 9. Container images · needs a decision
Production container images for each app.
**Done when:** each app builds a small, non root image that starts, passes a health check, and shuts down cleanly on SIGTERM (X13).
- [ ] Design it (spec): `/architect container images`

## Foundation: AWS platform

### 10. AWS foundation and infrastructure state · needs a decision · GA
AWS accounts, infrastructure as code with locked remote state, and keyless CI access to AWS.
**Done when:** staging and production are separate, all infrastructure is in code, state is locked, drift is detected on a schedule (I5), and CI reaches AWS without stored keys.
- [ ] Design it (spec): `/architect aws foundation and infrastructure state`

### 11. Network and Kubernetes cluster · needs a decision · GA
The private network and the Kubernetes cluster, with autoscaling node pools.
**Done when:** the cluster spans at least two availability zones, scales nodes on demand, and survives losing a node or a spot interruption without downtime (X13).
- [ ] Design it (spec): `/architect network and kubernetes cluster`

### 12. Data services · needs a decision · GA
Managed Postgres, Redis, and object storage, with backups.
**Done when:** Postgres runs across zones with automated backups, Redis and storage buckets exist per environment, and a restore into a scratch database is proven (I8, X13).
- [ ] Design it (spec): `/architect data services`

### 13. Edge, DNS, and certificates · needs a decision · GA
Public entry: DNS, TLS certificates, CDN, firewall, and ingress into the cluster.
**Done when:** a test service is reachable over HTTPS on an AFT subdomain through the CDN and firewall, with certificates and DNS records managed automatically.
- [ ] Design it (spec): `/architect edge dns and certificates`

### 14. Secrets delivery · needs a decision · GA
Secrets live in a managed store and reach pods without ever touching the repo.
**Done when:** apps read secrets from the managed store, and rotating one causes no downtime (X12).
- [ ] Design it (spec): `/architect secrets delivery`

## Foundation: CI/CD for the platform

### 15. GitOps and environments · needs a decision · GA
The deploy engine: the cluster pulls its desired state from git, per environment.
**Done when:** staging and production are described in git, and the cluster converges to that state on its own and reports healthy.
- [ ] Design it (spec): `/architect gitops and environments`

### 16. Image build and supply chain pipeline · needs a decision · GA
CI builds, scans, signs, and publishes images on every merge.
**Done when:** each merge builds images with an SBOM and a signature, a critical vulnerability blocks the release (I7), deploys use image digests only (I3), and forks never get secrets (I6).
- [ ] Design it (spec): `/architect image build and supply chain pipeline`

### 17. Database migration gate · needs a decision · GA
Migrations run as their own step before a deploy, and only safe changes are allowed.
**Done when:** migrations run before new pods start, a failed migration stops the deploy while old pods keep serving (I2), and destructive changes in the same release are rejected (X9).
- [ ] Design it (spec): `/architect database migration gate`

### 18. Continuous deploy to staging · needs a decision · GA
Every merge to `main` reaches staging automatically.
**Done when:** a merge to `main` is live on staging within minutes, and a smoke test runs against it.
- [ ] Design it (spec): `/architect continuous deploy to staging`

### 19. Production promotion and canary · needs a decision · GA
An approved promotion to production rolls out gradually and rolls back on its own.
**Done when:** a promotion needs approval, rolls out to a small share of traffic first, and rolls back automatically when health or error checks fail (I1).
- [ ] Design it (spec): `/architect production promotion and canary`

### 20. Pull request previews · needs a decision · GA
Each pull request gets its own short lived environment.
**Done when:** a pull request gets a preview URL, end to end tests run against it, and the preview is deleted when the pull request closes or its time runs out (I4).
- [ ] Design it (spec): `/architect pull request previews`

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
**Done when:** limits apply per IP, user, workspace, and key with a 429 and `Retry-After` (X7), and oversized or malformed requests get a clean 4xx with no stack trace (X8).
- [ ] Design it (spec): `/architect rate limiting and request guards`

## Foundation: experience

### 27. Design system and AFT brand · needs a decision
The visual language for every screen, written into `design.md`, replacing the placeholder branding.
**Done when:** `design.md` defines type, color, spacing, and components; the "Better Auth" and "My App" placeholders are gone; base components meet WCAG 2.2 AA for focus, keyboard, and contrast.
- [ ] Design it (spec): `/architect design system and aft brand`

### 28. Internationalization foundation · needs a decision
Every user facing string is translatable from day one, so languages never need a retrofit.
**Done when:** UI strings come from message files, the locale is detected and switchable, and dates, numbers, and money format per locale (X10).
- [ ] Design it (spec): `/architect internationalization foundation`
