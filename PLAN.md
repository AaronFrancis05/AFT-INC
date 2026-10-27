<!--
  Approved engineering plan for AFT Inc. Approved by the engineer on 2026-10-18.
  Change control: this file changes only through an /architect spec update or supersede,
  or a /scope replan, and every change gets a dated line in MEMORY.md.
  Feature status does NOT live here; it lives in docs/scope/.
  2026-10-18 (/scope): the "Scope: epics and features" section below is the original coarse outline
  (42 items). The authoritative build list is docs/scope/index.md (132 small features, renumbered in
  build order). Use the scope numbers, not these.
-->

# AFT Inc: Platform Engineering Plan

## Context

AFT Inc is an AI platform with three parts:
1. A **marketplace** of production-ready projects that you built. Customers buy a project once, customize it through a form, and receive it in their own GitHub repo to deploy on their own hosting, with an optional updates subscription (spec 0007, 2026-10-24; this replaced shared SaaS, dedicated hosted instances, and API + MCP access).
2. An **AI Media Studio** that generates HD/4K images, 9:16 short videos for TikTok, and later 3D models (GLB) with turntable videos.
3. An **App Studio** (Figma-like, with live collaboration) that turns an idea into a brief, then wireframes, then hi-fi designs, then generated Next.js code, then a deployed preview.

CI/CD ships the platform; customer projects are delivered as code into the customer's repo, never deployed by AFT (spec 0007). MCP lets anything integrate with AFT (parked until App Studio or media need it).

**Today's repo** (`AFT-INC/`, brownfield, git remote `AaronFrancis05/AFT-INC`, branch `main`):
- **Stack**: Next.js 16.2 App Router, React 19.2, TS strict, Tailwind v4, shadcn (`radix-lyra`, phosphor/lucide icons), Prisma 7 + `@prisma/adapter-pg` (client generated to `lib/generated/prisma`), Better Auth 1.5 (email+password, email OTP, Google/GitHub), Resend + react-email, zod 4, react-hook-form.
- **Working**: auth pages ([components/auth/](components/auth/), [lib/auth.ts](lib/auth.ts)), a session-guarded dashboard layout ([app/dashboard/layout.tsx](app/dashboard/layout.tsx)), and the homepage with a hardcoded `PROJECTS` array ([app/page.tsx](app/page.tsx)).
- **Stubs or mocks**:
  - `/projects`, `/services` and `/pricing` are placeholder divs.
  - The dashboard shows mock CRM data ([app/dashboard/page.tsx](app/dashboard/page.tsx)).
  - Branding still says "Better Auth" and "My App".
- **Defects to fix first**:
  - CI ([.github/workflows/webpack.yml](.github/workflows/webpack.yml)) runs `npm test`, but no test script exists, so every PR fails. It also runs on Node 20.
  - [lib/auth-client.ts](lib/auth-client.ts) reads a non-`NEXT_PUBLIC_` env var in client code.
  - Social providers are registered with empty-string secrets.
  - There are no tests, and `AGENTS.md` holds only the Next.js warning.

**Decisions locked with you** (they seed the specs; changing one means an `/architect` supersede):

| Area | Decision |
|---|---|
| Repo | pnpm + Turborepo monorepo |
| Cloud | AWS, one `aft-production` account in `eu-west-1`: one EC2 t4g.small, Postgres 17 on the box, S3, ECR, Route 53, SSM Parameter Store; no Redis (superseded 2026-10-22 by spec 0005, then 2026-10-24 by spec 0007) |
| Orchestration | Docker Compose on the single EC2 behind Caddy; no customer workloads (spec 0007; Kubernetes and then Fargate superseded) |
| CI/CD | Platform only: GitHub Actions, OIDC roles, ECR by digest, release bundles deployed by a custom SSM document after approval; no staging. Customer projects are delivered by a render and push workflow into the customer's repo (spec 0007) |
| Payments | Stripe Checkout for one time project purchases plus optional updates subscriptions, with Stripe Tax; a credit ledger for AI and media usage (spec 0006, amendment owed) |
| AI media | Hosted model APIs behind an internal provider interface. A custom fine-tuned AFT image model comes later, behind the same interface |
| Media outputs | Phase A: image + 9:16 video (≤1080p+, TikTok-ready). Phase B: 3D GLB + turntable video |
| LLM | Multi-provider from day one (Claude, OpenAI, Gemini), with routing, fallback, cost tracking and evals |
| App Studio v1 | Full: idea → PRD → wireframes → hi-fi → code in sandbox → preview deploy, **with live multiplayer collaboration** |
| Subscription modes | One time purchase, customized by a form and delivered to the customer's own repo and hosting · optional updates subscription (pull requests) (spec 0007; shared SaaS, dedicated hosted instances, and API + MCP resale are off) |
| Rigor (workflow tier) | Project default **Beta** (spec → build → verify → test). **GA** (adds a second-model review + docs) for auth, orgs, billing, metering, provisioning, infra, CI/CD, MCP |
| Build approach | **Tracer Bullet**: one thin end-to-end slice through every layer, then thicken |

## Target architecture

> **Superseded (2026-10-24).** The current architecture is spec [0007](docs/specs/0007-lean-hosting-customer-delivery/index.md): one EC2 server (Caddy, web, auth, worker, Postgres in Docker Compose) and projects delivered to customers' own repos. The original diagram below is kept for history; the monorepo layout still holds, except that `packages/provisioning` becomes `packages/delivery` and `infra/` holds `cdk/`, `compose/`, and `host/`.

```
                         Route 53 + CloudFront (CDN, WAF)
                                     │
                     AWS ALB  ─►  EKS cluster (Karpenter autoscaling)
 ┌─────────────────────── platform namespaces ───────────────────────┐
 │ apps/web      Next.js 16 (standalone): marketing, catalog,        │
 │               dashboard, studios UI, admin, BFF route handlers    │
 │ apps/mcp      MCP server (Streamable HTTP, OAuth 2.1) + MCP       │
 │               gateway to subscribed projects' MCP servers         │
 │ apps/collab   realtime CRDT server (Yjs) for App Studio canvas    │
 │ apps/worker   durable workflow workers: generation, provisioning, │
 │               codegen, billing sync, outbox relay                 │
 │ apps/gateway  API gateway for subscribed project APIs (keys,      │
 │               rate limits, metering)                              │
 └───────────────────────────────────────────────────────────────────┘
 ┌── sandbox node pool (gVisor/Kata isolation) ──┐  ┌── tenant-* namespaces ──┐
 │ untrusted generated-code builds & previews    │  │ dedicated instances     │
 └───────────────────────────────────────────────┘  └─────────────────────────┘
   RDS Postgres · ElastiCache Redis · S3 (assets, builds) · ECR · Secrets Manager
   External providers: Stripe · LLMs · image/video/3D APIs · Resend · GitHub
```

**Monorepo layout** (the current app moves to `apps/web` unchanged first):
```
apps/    web · mcp · collab · worker · gateway
packages/
  db         Prisma schema, client, migrations (moved from prisma/ + lib/prisma.ts)
  auth       Better Auth server config + client (from lib/auth*.ts)
  contracts  zod schemas, event types, Design IR, project integration contract
  ai         LLM gateway + media provider adapters (ports/adapters)
  billing    Stripe adapter, entitlements, credit ledger
  provisioning  tenant/instance workflows, Helm value rendering
  ui         shadcn components (from components/ui)
  email      react-email templates + Resend (from lib/email.tsx, components/emails)
  observability  OpenTelemetry, logger, error reporting
  config     tsconfig, eslint, env schema
infra/   terraform/ (AWS)  ·  gitops/ (Argo CD apps, Helm charts: platform + tenant-instance)
docs/    scope/ · specs/ · reviews/ · releases/
```

**Bounded contexts.** Each is a package with a public API. Apps compose them, and nothing reaches into another context's tables.
- Identity & Orgs
- Catalog
- Billing & Entitlements
- Provisioning & Instances
- Integrations (MCP, API keys, gateway)
- Media Studio
- App Studio
- Admin & Audit

**Production patterns applied everywhere** (each defined once in a cross-cutting spec):
- **Ports and adapters for every external provider** (LLM, media, Stripe, AWS, GitHub). Swapping a provider never touches UI or domain code.
- **Durable workflows for anything multi-step or slow**: generation, provisioning, codegen, Stripe sync. They retry, are idempotent, and resume after crashes.
- **Transactional outbox plus idempotent consumers.** Every webhook, including Stripe and the provider callbacks, is stored with a unique event id before it is processed.
- **Tenant isolation**: `organizationId` on every tenant row, enforced in a repository layer, with tests that prove cross-tenant reads fail.
- **Central entitlement checks**: one `can(org, capability)` function backed by subscriptions and credits. Never check a plan inline.
- **Typed env at boot**: a zod schema, so the app fails fast on missing secrets. Secrets come from AWS Secrets Manager via External Secrets Operator.
- **Observability**: OpenTelemetry traces, metrics and logs, an error tracker, an audit log for privileged actions, and SLOs per service.
- **Supply chain**: signed images, an SBOM, vulnerability scans that block on critical findings, and GitHub OIDC to AWS (no static keys).

## Delivery method (the skills workflow, file-based)

Brownfield order: **`/audit` → `/scope` → per-feature loop.** Every decision and status lives in the repo, so nothing depends on chat memory. Run `/clear` at each handoff.

**Per-feature loop**, one feature at a time and one PR each:
1. `/architect <feature>` writes `docs/specs/NNNN-*` (status `Proposed`).
2. `/develop <feature>` builds it and runs migrations (spec moves to `In Progress`).
3. `/check verify <feature>` drives the real app against every acceptance criterion.
4. `/test <feature>` adds the test suite.
5. GA only: `/check review` (a fresh model, writes to `docs/reviews/`), then `/document pr|changelog`.
6. `/sync` updates `AGENTS.md`, the scope status, and stale specs. The spec moves to `Accepted` when the feature is `done`.
7. Anything failing goes to `/debug`, which writes a regression test and hands it to `/test`.

**No-deviation rule.**
- `/develop` builds only what a spec names. If a value or behavior has no named source, it stops and routes to `/architect`.
- A scope change goes through `/scope <feature>` (add) or bare `/scope` (replan).
- A decision change goes through an `/architect` update or supersede. Nothing is decided only in chat.

## Step 1: What I execute right after approval (planning artifacts, no app code)

1. **`/audit`** (Phase 4 gap-fill: root `AGENTS.md` exists). Keep the Next.js warning block verbatim and add:
   - the stack and commands
   - conventions (App Router, shadcn, zod, Prisma via `@/lib/prisma`, Better Auth server/client split)
   - known gotchas (the auth-client env bug, missing test script, Next 16 `proxy.ts` replacing middleware, and the rule to read `node_modules/next/dist/docs/` before writing Next code)
   - workflow tier, build approach, and `## Git` (integration: on, with feature branches off `main`)

   `CLAUDE.md` stays as the `@AGENTS.md` pointer.
2. **`/scope`** (brownfield plan). More than 40 features means the epic split:
   - `docs/scope/index.md` holds the At a glance table and per-epic rollups.
   - There is one file per epic (below). Existing work is enrolled as `existing` or `in-progress`.
   - Each feature's `Done when` line lists the edge-case IDs it owns, from the catalog below.
3. **`/architect` foundation specs** (standalone decision specs, ratified on your confirmation):
   - `0001-platform-architecture/` is an umbrella (`index.md` + `rationale.md`) with children: monorepo layout and tooling, AWS + EKS topology, data and tenancy model, durable workflow engine, provider adapter pattern, environments and release strategy.
   - `0002-cross-cutting-standards` covers errors, logging/tracing, env/secrets, idempotency/outbox, authz/entitlements, API style and versioning.

   Each recommends concrete tools, for example Temporal vs BullMQ for workflows, Yjs/Hocuspocus vs Liveblocks for collaboration, tldraw vs a custom canvas, E2B vs a self-hosted gVisor sandbox, Terraform/OpenTofu, Vitest + Playwright, and Sentry vs Grafana stack. You confirm each one. Nothing is chosen silently.

Then the feature loop starts at Feature 1.

## Scope: epics and features, in build order

Tier is Beta unless marked **GA**. "Decision" means it needs a spec before `/develop`.

**Epic 0: Foundation** (`docs/scope/foundation.md`)
1. **Quality baseline**: add the test runner, fix CI's missing `npm test`, typecheck job, Node LTS, fix the auth-client env bug, and remove empty social secrets. *(first PR, unblocks CI)*
2. **Monorepo migration** (GA, decision 0001): move to `apps/web` and extract `packages/db|auth|ui|email|config`. The app must behave identically.
3. **Typed env & secrets**: zod env schema in `packages/config`, `.env.example`, Secrets Manager mapping.
4. **Local dev stack**: Dockerfiles (Next standalone), docker compose with Postgres, Redis, S3-compatible storage and a mail catcher, plus seed data.
5. **AWS infrastructure** (GA, decision): Terraform for VPC, EKS + Karpenter, RDS, ElastiCache, S3/CloudFront, ECR, Route 53/ACM, IAM, GitHub OIDC; staging and prod.
6. **Platform CI/CD + GitOps** (GA, decision):
   - On every PR: lint, typecheck, unit, e2e, migration check, image build, scan, SBOM, sign, then push to ECR.
   - A per-PR preview namespace.
   - Argo CD deploys staging automatically. Prod needs approval and rolls out as a canary.
7. **Observability**: OTel SDK in every app, structured logs, error tracking, dashboards, alerts.
8. **Durable jobs & workflow engine** (decision): `apps/worker`, outbox relay, idempotent webhook inbox.

**Epic 1: Identity & Organizations** (`identity.md`)

9. **Existing auth** (`existing`). Enrolled as already built, with a hardening pass in 10.
10. **Auth hardening & route protection** (GA): `proxy.ts`, rate limits, 2FA, session policy, branding fixes.
11. **Organizations, roles, invitations** (GA, decision: tenancy model): workspaces for developers, enterprises and individuals.
12. **API keys & audit log** (GA).

**Epic 2: Catalog & Commerce** (`commerce.md`)

13. **Catalog data model + admin CMS** (decision): projects, versions, domains/categories, media, delivery modes, plans.
14. **Public catalog**: `/projects` with search and filters, project detail, `/services`, `/pricing`. The homepage reads from the DB, not the `PROJECTS` array.
15. **Stripe subscriptions** (GA, decision): checkout, customer portal, idempotent webhooks, entitlements.
16. **Usage metering & credits** (GA): credit ledger, Stripe meters, quotas, and hard caps on AI spend.
17. **Customer dashboard**: replace the mock CRM with subscriptions, instances, usage, invoices and keys.

**Epic 3: Project Delivery** (`delivery.md`)

18. **Project integration contract** (GA, decision). This is what every showcase project must implement:
    - a health endpoint
    - a tenant provisioning API
    - SSO via AFT as OIDC provider
    - usage reporting
    - an MCP manifest
    - a Helm chart
19. **Shared SaaS tenant provisioning** (GA).
20. **Dedicated instance pipeline** (GA): namespace, quotas, secrets, Helm via GitOps, DNS (ExternalDNS), TLS (cert-manager), health gate, teardown.
21. **Instance lifecycle**: upgrades, rollback, suspend on non-payment, backups, custom domains.
22. **API gateway for project APIs** (GA): key auth, rate limits, metering.

**Epic 4: MCP & Integrations** (`mcp.md`)

23. **AFT MCP server** (GA, decision): Streamable HTTP and OAuth 2.1, with tools for catalog, generation, studio and deploy status.
24. **Per-project MCP gateway** (GA): proxies each subscribed project's MCP server, with entitlement checks and metering.
25. **Connections UI & developer docs**: one-click config for MCP clients and API reference.

**Epic 5: AI Media Studio** (`media.md`)

26. **AI gateway package** (GA, decision): multi-provider LLM routing, fallback, per-call cost tracking, eval harness, safety filters.
27. **Image generation**: text→image, image→image, HD/4K upscaling, asset library on S3/CDN.
28. **Content safety & commercial licensing**: moderation, provenance/C2PA, usage-rights terms.
29. **Short vertical video**: 9:16 1080p MP4 for TikTok/Reels, with a TikTok export/post integration.
30. **3D model generation**: GLB/USDZ, in-browser viewer, auto turntable video. *(Phase B)*
31. **Custom AFT image model**: fine-tuned model on an EKS GPU pool, behind the same adapter. *(later)*

**Epic 6: App Studio** (`studio.md`)

32. **Design IR** (GA, decision): one versioned schema for brief, screens, component tree and tokens. The canvas renders it and codegen reads it. This is the core error-limiting contract.
33. **Idea → brief/PRD** generation and editing.
34. **Canvas editor** (decision): frames, layers, components, zoom/pan, undo/redo.
35. **Live collaboration** (decision): CRDT sync, presence and cursors, comments, persistence.
36. **Brief → wireframes** onto the canvas.
37. **Wireframes → hi-fi design** with a design system and tokens.
38. **Design → code** (GA, decision: sandbox): Next.js + shadcn generated in an isolated sandbox, built and tested automatically.
39. **Preview deploy & export**: deploy through the provisioning pipeline and push to the customer's GitHub repo.

**Epic 7: Launch readiness** (`launch.md`)

40. **Admin console**: users, orgs, catalog moderation, instances, refunds.
41. **Security & compliance** (GA): OWASP review, GDPR export/delete, ToS/AUP, backups and DR drill, load test, SLOs.
42. **Release 1.0**: changelog, release notes, runbooks.

**Critical path**: 1 → 2 → 3/4 → 5 → 6 → 8 → 11 → 13 → 15 → 18 → 20 → 23.

After that, Epic 5 (needs 16 and 26) and Epic 6 (needs 26, 32 and 20) can run in parallel. Epic 6 is the largest risk, so it starts only after delivery and billing are proven.

## Edge cases catalog (decided before any build)

Each edge case has an ID and a required handling. How the IDs flow through the workflow:
- `/architect` copies every ID for a feature into that spec's `## Requirements`, as acceptance criteria.
- `/check verify` proves each one.
- `/test` writes at least one test per ID.
- A new edge case found during a build goes back through `/architect` as a spec update. It is never patched silently.

**Format:** `ID: situation → required handling`

### X: Cross-cutting (applies to every feature)
- **X1** Double submit or retried request (double click, network retry) → an `Idempotency-Key` on every mutating endpoint, and a repeat returns the first result.
- **X2** A webhook is delivered twice → a `WebhookEvent` unique on provider event id, so the second delivery is a no-op that returns 200.
- **X3** Webhooks arrive out of order (e.g. `subscription.updated` before `created`) → re-fetch the provider object's current state. Never apply event payloads in sequence.
- **X4** The DB commits but the external call fails, or the reverse → transactional outbox plus a saga with compensation steps. No dual writes.
- **X5** A request outlives the load balancer or browser timeout (>30s) → hand it to a durable job, return a job id, and stream progress over SSE with keepalive.
- **X6** An external provider is down or slow → timeouts, a retry budget with jitter, a circuit breaker, fallback where defined, and a clear "temporarily unavailable" message. Charged credits are refunded.
- **X7** Abuse or bursts → rate limits per IP, user, org and API key (Redis). Return 429 with `Retry-After`.
- **X8** Oversized or malformed input (huge JSON, bad unicode, wrong MIME, zip bombs) → body size limits, zod validation at every boundary, file sniffing, and 4xx errors that never leak a stack trace.
- **X9** A rolling deploy runs old pods against the new schema → expand-then-contract migrations only. Migrations run as a pre-deploy job and are never destructive in the same release.
- **X10** Time and money → store UTC and render in the user's timezone. Money is integer minor units plus a currency, never a float.
- **X11** A referenced record is deleted (project unpublished, member removed) → soft delete for business entities, and foreign keys with explicit `onDelete` rules.
- **X12** Secret rotation → zero-downtime dual-key support (old and new valid during the rotation window).
- **X13** An AZ or node fails, or a spot node is interrupted → multi-AZ RDS, PodDisruptionBudgets, at least 2 replicas per platform service, and graceful shutdown on SIGTERM.
- **X14** Prompt injection (user text, retrieved content, third-party MCP tool output) → treat it as data, never as instructions. Tools are allowlisted and model output is schema-validated before use.
- **X15** Cross-tenant access → every query is scoped by `organizationId` in the repository layer, and a cross-org request returns 404, not 403 (no existence leak).
- **X16** Account or org deletion (GDPR) while subscriptions or instances are active → block it until they are cancelled. Otherwise run an ordered teardown saga, keep invoices for the legal retention period, and anonymize the rest.

### A: Identity & Organizations
- **A1** OAuth sign-in with an email that already exists → link accounts only when the provider email is verified. Otherwise refuse and ask the user to sign in with the original method.
- **A2** GitHub returns no public email or an unverified one → fetch the primary verified email via the API. If there is none, block with a message.
- **A3** An OTP is expired, reused or brute-forced → single use, short TTL, at most 5 attempts, then a cooldown. **Existing bug:** [lib/auth.ts](lib/auth.ts) logs the OTP to the console on any send failure. It must be dev-only.
- **A4** The email provider is down during sign-up or reset → surface "we could not send the email, retry", alert, and allow a rate-limited resend. Reset never reveals whether an email exists.
- **A5** A password change or reset → revoke all other sessions, and notify by email.
- **A6** A member is removed or downgraded while active (including live in a canvas) → their next request is denied, open collab sockets are closed, and caches are invalidated.
- **A7** The last owner leaves, or deletes their account → block it until ownership is transferred.
- **A8** An invite is expired, revoked, already accepted, or accepted by a different signed-in email → reject with a specific message. Invite tokens are single use.
- **A9** A user belongs to many orgs → the active org lives in the session, and a URL with a different org switches explicitly. Individual customers get an implicit personal org.
- **A10** An API key leaks → hashed at rest, shown once, with a visible prefix, scopes, expiry, instant revoke and last-used tracking.
- **A11** Social provider env vars are missing → the provider is not registered, and its button is hidden. (Today they register with an empty string.)

### C: Catalog
- **C1** A project is unpublished or deprecated while customers are subscribed → hide it from the catalog, keep existing subscribers running, and give notice before end of life.
- **C2** A new major version breaks existing users → instances stay pinned to their version, and upgrades are opt-in with a changelog.
- **C3** A plan price changes → create a new Stripe price. Existing subscribers keep the old price until you migrate them.
- **C4** A slug is renamed → keep slug history with a 301 redirect.
- **C5** Media is missing or broken, or comes from an unapproved host → show a placeholder, and allow only remote image hosts from config.
- **C6** A search returns no results, contains special characters, or is very long → sanitize, cap the query length, and show an empty state with suggestions.

### B: Billing, metering & credits
- **B1** A card is declined, SCA/3DS is required, or payment is async → the subscription stays `incomplete`, gets no entitlements, and the user sees a retry path.
- **B2** Checkout is abandoned → no subscription, and the pending session expires.
- **B3** Checkout is completed twice (two tabs) → block it if an active subscription exists for that org and plan, and pass a Stripe idempotency key.
- **B4** The user returns to the success page before the webhook lands → the page polls the subscription state. It never grants access from the redirect alone.
- **B5** A renewal payment fails → dunning, a grace period of N days, then suspend (instances scale to zero, data kept). Delete only after the retention period, with emails before each step.
- **B6** A downgrade goes below current usage (seats, instances, storage) → block it, or require the user to pick what to deactivate first.
- **B7** Cancellation → at period end by default, with immediate cancel and refund done by an admin only. A dispute or chargeback suspends access.
- **B8** Concurrent jobs race for the last credits → reserve atomically with a conditional update (balance ≥ cost) before the job runs, settle on success, and release on failure. The balance can never go negative.
- **B9** A generation fails or is blocked by safety → the reserved credits are released in full and the ledger records why.
- **B10** Credits expire, a plan resets monthly, or the top-up purchase fails → the ledger is append-only, and the balance is derived. Expiry runs as a job.
- **B11** Tax, VAT ids, or enterprise invoices on net terms → Stripe Tax, tax id collection, and invoice billing for enterprise.
- **B12** Stripe and the DB drift apart (a dashboard edit, a deleted customer) → a nightly reconciliation job that alerts on mismatches.
- **B13** Test vs live mode mix-up → separate keys per environment, enforced by the env schema. Prod refuses `sk_test`.
- B14 to B32 are listed in spec 0006's rationale (owed here through `/scope`).
- **B33** A refund is requested after delivery or while a delivery runs → refused (`ALREADY_DELIVERED` or `DELIVERY_RUNNING`); a refund before delivery moves `paid` to `refund_pending` in one conditional update (spec 0007 AC-33).
- **B34** A Stripe webhook arrives before the purchase row commits, or twice → store it by event id first (X2), find the purchase by checkout session id, retry until it exists.
- **B35** An updates subscription renewal fails → Stripe dunning, `past_due`, then `canceled`; update PRs stop, critical fixes continue (D23).
- **B36** A charge is disputed after delivery → mark the purchase disputed, stop updates, alert the engineer; a won dispute clears it (spec 0007 AC-38).

### D: Project delivery & provisioning
- **D1** Provisioning fails midway (namespace created, DNS failed) → a state machine per step, with compensating teardown and a resumable retry. It never leaves orphans.
- **D2** A subscription is cancelled while provisioning runs → the workflow checks entitlement at each step and aborts cleanly.
- **D3** A duplicate provision request → one instance per (subscription, project), deduplicated by workflow id.
- **D4** The cluster is out of capacity, or a quota is hit → queue it, show a "provisioning delayed" status, alert ops, and let Karpenter scale.
- **D5** DNS or TLS is slow, or certificate rate limits hit → use a wildcard cert for `*.aft subdomain`, set a health gate timeout, then retry or alert.
- **D6** A custom domain fails verification, is later removed, or blocks CAA → verify by TXT record and re-check periodically. On loss, fall back to the AFT subdomain and notify.
- **D7** An upgrade causes a crash loop or a failed tenant DB migration → the health gate triggers automatic rollback to the previous version, and a backup is taken before every upgrade.
- **D8** A noisy neighbor in shared SaaS or a namespace → ResourceQuota, LimitRange, NetworkPolicy deny-by-default and per-tenant rate limits.
- **D9** Subdomain collisions, reserved or offensive names (`admin`, `api`, `www`) → a reserved list, a profanity filter, and uniqueness enforced.
- **D10** A showcase project breaks the integration contract → a contract conformance test suite must pass before a version can be published.
- **D11** Teardown on cancel or deletion → keep a final backup for N days, then hard delete. Report and log what was removed.
- **D12** A tenant secret is exposed → it is unique per tenant, stored only in Secrets Manager, and can be rotated per tenant.
- _Since spec 0007 (2026-10-24) AFT hosts no customer instances: D1, D2, D3, D7, D10, and D11 apply to delivery workflows and versions; D4, D5, D6, D8, D9, and D12 are retired. Delivery edge cases follow._
- **D13** The connected repo has commits at connect time, or gets one before the push → refuse with `REPO_NOT_EMPTY`.
- **D14** GitHub is down, rate limited, or times out → DBOS retries with backoff and jitter for up to 24 hours, then `failed`, emails, and a retry button.
- **D15** The app is uninstalled, the repo deleted, removed from the installation, or made public → the connection is `revoked` or `public`, owners are emailed, billing continues, updates arrive as zips.
- **D16** An update conflicts with the customer's edits → the PR is opened with conflict markers, listed files, and an email (`conflict_pr_open`).
- **D17** The options schema changes between versions → use the manifest default, else wait in `needs_answers` and email owners; removed options are ignored and noted.
- **D18** The customer squash merges, rebases, or edits `.aft/delivery.json` → updates read the base version from that file on the current head; fall back to the recorded delivered version and say so.
- **D19** The default branch rejects the initial push → push `aft/initial` and ask the owner to make it the default; else `DEFAULT_BRANCH_PROTECTED`.
- **D20** The chosen target can't host the project or isn't enabled → hidden in the picker; the API returns 422 `TARGET_NOT_SUPPORTED`.
- **D21** The secret scan finds something → block the push, alert with rule, path, and fingerprint (never the value), admin retry with that fingerprint allowed.
- **D22** A render exceeds 3 minutes, 50 MB, or 5,000 files → `RENDER_TOO_LARGE`; alert as a bug, since publishing renders the same project.
- **D23** The updates subscription lapses while an update PR is open → the PR stays; no new update PRs; critical fixes still arrive.
- **D24** An owner replaces the repo → the old connection is `replaced`; the new empty private repo gets a redelivery; only it gets updates.
- **D25** The project is unpublished or deprecated (C1) → buyers keep access to versions they own; updates continue until the end of life notice expires.
- **D26** A version is yanked → never offered, delivered, or used as an update target; open PRs for it are closed with a note.
- **D27** A forged installation id, repo id, or `state` reaches the GitHub setup callback → ownership and state checks fail, nothing is stored, 403.
- **D28** A git tag is moved after publishing → ignored; renders use the stored commit SHA.

### M: MCP & API gateway
- **M1** The OAuth token expires or is revoked mid-session → MCP returns a standard auth error, and the client refreshes or re-authorizes.
- **M2** Entitlement or credits run out during a tool call → a structured tool error with an upgrade link. No crash, no partial charge.
- **M3** An upstream project MCP server or API is down or slow → per-upstream timeout and circuit breaker, plus a clear error naming the project.
- **M4** A long-running tool (video, deploy) → return a job id immediately, with progress notifications and a status tool.
- **M5** Large outputs (images, video) → return resource links (signed URLs), never inline base64 blobs.
- **M6** Third-party tool descriptions or outputs carry injected instructions → only allowlisted and reviewed tools are exposed, descriptions are pinned per version, and outputs are labeled as untrusted.
- **M7** The MCP protocol version is unsupported → negotiate the version, and refuse cleanly with the supported list.
- **M8** Per-key bursts → token bucket rate limiting, with metering events written even when the request is rejected.

### G: AI Media Studio
- **G1** A provider job hangs or never calls back → a watchdog timeout per job kind, then fail, refund and notify.
- **G2** A prompt or output is blocked by safety (ours or the provider's) → explain it plainly, refund the credits, and log for review.
- **G3** Disallowed content (sexual content involving minors, real-person likeness without rights, explicit violence, trademark misuse) → moderate both the prompt and the output, hard block, and escalate per policy.
- **G4** Output resolution is below what was requested → check the real dimensions, upscale to the target (HD/4K), and fail if that is impossible.
- **G5** Video doesn't meet TikTok specs (ratio, codec, length, size) → always transcode to 1080x1920 H.264/AAC MP4 within the size and duration limits, and validate before export.
- **G6** The input upload is huge, corrupt, HEIC, carries EXIF rotation, or is animated → validate the type and size, normalize orientation, convert to a supported format, and reject animated input where unsupported.
- **G7** The user closes the tab during a job → the job continues, with an in-app and email notification and results in the library.
- **G8** Provider result URLs expire → copy the output to S3 immediately on completion, then serve it via CloudFront or signed URLs.
- **G9** Private vs public assets, storage quota exceeded, or an asset deleted while it is used → private by default, quota enforced before the job runs, and deletion blocked or warned when the asset is referenced.
- **G10** Provider terms forbid commercial use → only use adapters marked commercial-safe. Each asset records its provider, model, terms and a C2PA manifest.
- **G11** A 3D mesh is broken (non-manifold, huge polycount, missing textures), or the client has no WebGL → validate and decimate on the server, provide a fallback preview image and video.
- **G12** TikTok posting fails (token expired, account type not allowed, rate limit, rejected) → fall back to download, offer reconnect, and show the exact reason.

### S: App Studio
- **S1** Two users make conflicting semantic edits (one deletes a frame another is editing) → the CRDT converges, the deletion is shown to the editor, and undo restores it.
- **S2** Offline edits followed by a reconnect with large divergence → the CRDT merges them, and a version snapshot is taken before applying.
- **S3** The collab server restarts or a pod moves → state is persisted (debounced snapshots plus updates), clients auto-reconnect, and nothing is lost.
- **S4** The document grows without bound (CRDT history) → periodic compaction, with a size cap that warns the user.
- **S5** Model output doesn't match the Design IR schema → validate, run a bounded repair loop (at most N tries), and never persist invalid IR. Show what failed.
- **S6** An old document uses a previous IR version → versioned IR with forward migrations on load, and tests per migration.
- **S7** AI regeneration would overwrite manual edits → AI changes arrive as a proposal or diff that the user accepts, and are never applied silently.
- **S8** The idea input is empty, vague, hostile or not English → ask clarifying questions, moderate, and support multilingual input with output in the user's language.
- **S9** Generated code doesn't compile or fails tests → install, typecheck, build and test inside the sandbox, run a bounded auto-fix loop, then surface the errors to the user.
- **S10** Generated code pulls malicious or unknown dependencies or embeds secrets → a dependency allowlist, a locked registry mirror, a secret scanner, and no outbound network except the mirror.
- **S11** Sandbox runs away (infinite loop, fork bomb, crypto mining) → CPU, memory, disk, process and wall-clock limits, gVisor/Kata isolation, and kill-and-report.
- **S12** A preview deploy hits tenant quotas, or is abandoned → the preview has a TTL, after which it scales to zero and is deleted.
- **S13** GitHub export fails (repo exists, no permission, token revoked, branch protected) → explain the cause precisely, offer a new repo or branch, never force-push.
- **S14** Undo/redo in multiplayer → per-user undo stacks.
- **S15** A permission is revoked mid-session → handled by A6 (socket closed, edits rejected server-side).

### I: Infrastructure & CI/CD
- **I1** A canary fails health or SLO checks → automatic rollback (Argo Rollouts analysis).
- **I2** A migration fails in the pre-deploy job → the deploy halts and old pods keep serving (X9). The fix is forward-only.
- **I3** A mutable image tag is redeployed → deploy by digest only, with signature verification at admission.
- **I4** A PR preview environment is left behind → it is deleted when the PR closes, plus a TTL sweeper.
- **I5** Terraform drift or state lock → a scheduled drift detection plan, a state lock in DynamoDB/S3, and applies only through CI.
- **I6** A PR from a fork → no secrets and no deploy. It runs only the safe CI subset.
- **I7** A critical CVE in the base image → the scan blocks the release, and a scheduled rebuild picks up patches.
- **I8** A backup can't be restored → a monthly automated restore drill into a scratch DB, which alerts on failure.
- **I9** The EC2 instance fails a hardware status check → the CloudWatch alarm runs `recover` (same id, disk, and Elastic IP) and emails the engineer.
- **I10** The box runs out of memory → per container limits, automatic restarts, the memory alarm, then the pre decided `t4g.medium` fallback.
- **I11** The root disk fills → log rotation, image pruning, 5 releases kept, a render scratch quota, dumps streamed to S3, a disk alarm at 80 percent.
- **I12** The EBS volume or the AZ is lost → rebuild from CDK and restore globals, dumps, and Caddy data from S3 (rehearsed); up to 24 hours of data lost.
- **I13** Let's Encrypt fails or rate limits → Caddy retries and falls back to ZeroSSL; restored Caddy data avoids new issuance after a rebuild.
- **I14** The deploy job dies midway → the lock is released, the next run with the same release is idempotent, and migrations are expand only.
- **I15** The AWS credits are not reinstated → the card pays; the $28 budget alert warns first.
- **I16** The instance runs out of CPU credits → the `CPUCreditBalance` alarm fires; switch to `unlimited`, then resize if the surplus passes $5 a month.
- **I17** The migration dry run on `restore_check` fails → the deploy stops before touching `aft` or any container.
- **I18** A migration file changes bytes during the monorepo move → `git mv` only, LF line endings, exact rename check plus `prisma migrate status` (spec 0008).
- **I19** A workspace imports a package it does not declare → pnpm's isolated linker fails; declare it in that workspace, never hoist.
- **I20** A client component imports `@aft/db` or `@aft/auth/server` → `server-only` fails `next build`.
- **I21** A new dependency ships an install script → `pnpm install` fails until `allowBuilds` decides it.
- **I22** Turborepo replays a cache made under different env values → strict env mode, a declared variable list, and `.env` as a global dependency.
- **I23** The generated Prisma client is missing or stale → `db:generate` runs before every dependent task.
- **I24** A branch or another session predates a repo wide move → resolved before the move starts.
- **I25** Two versions of React or Next.js load in one app → `catalog:` and peer dependencies keep one.
- **I26** Tailwind skips classes that live in a package → `@source` in the shared ui CSS.
- **I27** A non Next.js Node runtime loads `server-only` and crashes → alias it to the empty stub in `@aft/config`.
- **I28** pnpm symlinks or long paths fail on Windows → junctions need no admin; enable long paths and reinstall.
- **I29** shadcn's registry imports `cn` from the npm `cn` package → rewrite the import to `@aft/ui/lib/utils` and remove the package (if added) after each `add`, with a lint guard, until a feature adopts `cn` (spec 0008).
- **I30** A dot in a parent folder name on Windows makes `shadcn add` write outside the repo → keep the checkout path free of dots (spec 0008).
- **I31** A build only tool lands in a workspace's runtime dependencies (declared there, like `shadcn`, or an unmirrored peer that `autoInstallPeers` records as runtime, like `eslint` in `@aft/config`) and drags its whole tree into `pnpm audit --prod`, failing the `audit` job → keep such tools in `devDependencies` and mirror every peer there; two `ci.test.ts` checks scan every workspace (spec 0008, AC-9).

## Core data model (seed for spec 0001 data child)

| Context | Entities |
|---|---|
| Identity (Better Auth plugins) | `User`, `Session`, `Account`, `Verification` (exist), plus `Organization`, `Member`, `Invitation` |
| Integrations | `ApiKey`, `AuditLog`, `McpConnection`/OAuth clients |
| Catalog | `Project`, `ProjectVersion` (image ref, Helm chart, changelog), `Category`, `ProjectMedia`, `Plan` (price ids, delivery mode, entitlements JSON) |
| Billing | `Subscription`, `Entitlement`, `CreditLedgerEntry`, `UsageEvent`, `WebhookEvent` (idempotency) |
| Delivery | `Instance` (mode, org, version, namespace, url, status), `Deployment` (pipeline run, logs ref) |
| Media | `GenerationJob` (kind, provider, params, status, cost, moderation), `Asset` |
| App Studio | `StudioProject`, `DesignDocument` (IR + CRDT snapshot), `StudioRun` (codegen/build) |
| Platform | `OutboxEvent` |

Every tenant table carries `organizationId`, and migrations are additive (expand, then contract).

## Critical files touched early

- [.github/workflows/webpack.yml](.github/workflows/webpack.yml): replaced by `ci.yml`, `release.yml` and `preview.yml`.
- [package.json](package.json): becomes the workspace root and gains test scripts.
- [lib/auth.ts](lib/auth.ts), [lib/auth-client.ts](lib/auth-client.ts): move to `packages/auth` and gain the organization, api-key, 2FA and OIDC-provider plugins (reusing Better Auth plugins, not custom code).
- [lib/prisma.ts](lib/prisma.ts), [prisma/schema.prisma](prisma/schema.prisma), [prisma.config.ts](prisma.config.ts): move to `packages/db`. The existing migration `20260320181902_init` is preserved.
- [lib/email.tsx](lib/email.tsx), [components/emails/](components/emails/): move to `packages/email`.
- [components/ui/](components/ui/): moves to `packages/ui`.
- [app/page.tsx](app/page.tsx), [app/projects/page.tsx](app/projects/page.tsx), [app/dashboard/page.tsx](app/dashboard/page.tsx): become catalog-backed and real-data-backed in features 14 and 17.
- [AGENTS.md](AGENTS.md): extended by `/audit`, and later nested `AGENTS.md` files per app/package.

## Verification

- **Edge-case traceability**: every catalog ID (X, A, C, B, D, M, G, S, I) appears in exactly one spec's Requirements, at least one `/check verify` result and at least one named test (`it("B8: …")`). `/sync` flags any ID with no test.
- **Planning step** (after approval): `docs/scope/index.md` and the epic files exist, and every feature has `Done when` and a status. `docs/specs/0001-*` and `0002-*` exist with status `Proposed` and become `Accepted` on your confirmation. `AGENTS.md` lists the stack, commands, tier, approach and git rules.
- **Per feature**:
  - `/check verify` drives the real app (dev server or a staging URL) against every acceptance criterion.
  - `/test` adds unit and integration tests, plus Playwright e2e for UI.
  - GA features also get `/check review` on a different model.
- **Global gates in CI on every PR**: `pnpm turbo lint typecheck test build`, Prisma migration diff, image scan and a Playwright smoke test against the PR preview namespace.
- **Infra**: `terraform plan` in CI and `apply` only via approved workflow. Argo CD must report healthy and in sync on staging before a prod promote.
- **Provisioning and payments**: Stripe test mode, plus an end-to-end test that subscribes, provisions a dedicated instance, checks the health gate, cancels, and confirms teardown.
- **AI**: the eval harness runs on fixed prompts, and the per-job cost is checked against the credit ledger.
- **Collaboration**: two-client CRDT convergence tests.
- **Isolation**: tenant isolation tests (cross-org reads must fail) and sandbox escape and network-egress tests.

## Risks to watch

- **Scale of v1 scope.** App Studio with live collaboration plus Kubernetes ops is very large for one team. The phase order means the earlier epics ship value on their own. If the timeline gets tight, run `/scope` (replan) rather than cut corners.
- **Running untrusted generated code.** It always runs in an isolated sandbox node pool with no cloud credentials and limited outbound network access.
- **AI cost overruns.** Credits are deducted before a job runs, with per-org caps and provider-level budgets.
- **Kubernetes ops burden.** Use managed EKS add-ons, Karpenter and GitOps, and document every runbook in `docs/`.
