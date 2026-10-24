# 0005. Platform architecture: a lean AWS monorepo on ECS Fargate

**Date**: 2026-10-22
**Status**: Partially superseded by [0007](../0007-lean-hosting-customer-delivery/index.md) (2026-10-24). Children 0001, 0004, 0005, 0009, the roles and row level security of 0003, child 0007 for App Studio code only, and AC-9, AC-10, AC-11, AC-13, AC-15 stay in force; the rest is replaced, see spec 0007 *What this supersedes*.

## Summary

This is the umbrella decision for how the whole AFT platform is built and run, so later specs point here instead of deciding it again. The code lives in one pnpm and Turborepo monorepo; the services run as small containers on Amazon ECS with Fargate (AWS runs the servers, we run no cluster), defined in AWS CDK, in separate staging, production, and tenants AWS accounts in Ireland. It replaces the original plan's Kubernetes (EKS), Argo CD, Helm, and Terraform, because an EKS cluster alone costs more than the $100 a month pre launch budget; from launch the budget becomes about $300 a month. It also sets the order of work that gets `remwa.tech` live on a thin real path first, with sign up gated, before the rest of the features fill in.

## Structure

| Child | What it is | Decision it supports |
|---|---|---|
| [0001-monorepo-layout-tooling.md](0001-monorepo-layout-tooling.md) | Apps, packages, boundaries, and the build toolchain | pnpm plus Turborepo, internal packages as TypeScript source, apps added as features land |
| [0002-aws-accounts-compute-topology.md](0002-aws-accounts-compute-topology.md) | Accounts, network, edge, ECS services, hostnames, dedicated instances | ECS Fargate on ARM, no NAT, internal ALB behind CloudFront, separate staging, production, and tenants accounts |
| [0003-data-tenancy-model.md](0003-data-tenancy-model.md) | Postgres clusters, roles, row level security, Redis, object storage, encryption, residency, backups | Aurora Serverless v2, repository layer plus RLS, EU only, RPO 5 minutes in Region |
| [0004-durable-workflow-engine.md](0004-durable-workflow-engine.md) | Where multi step and slow work runs | DBOS Transact in one `apps/worker` task on our Postgres |
| [0005-provider-adapter-pattern.md](0005-provider-adapter-pattern.md) | How every external provider is wrapped | Ports in the owning package, one adapter per provider, contract tests; the LLM adapter uses the Vercel AI SDK |
| [0006-environments-releases.md](0006-environments-releases.md) | Environments, CI/CD, infrastructure as code, migrations, rollback, the sign up gate | GitHub Actions plus AWS CDK, staging on merge, production by approval of a recorded digest set |
| [0007-untrusted-code-boundary.md](0007-untrusted-code-boundary.md) | Where App Studio's generated code and customer instances may run, and on which domain | A separate domain and a separate account; engine chosen in slice 9, EU only, E2B the leading candidate |
| [0008-realtime-collaboration-host.md](0008-realtime-collaboration-host.md) | The live canvas server | Self hosted Hocuspocus (Yjs) on Fargate |
| [0009-observability-stack.md](0009-observability-stack.md) | Traces, metrics, logs, errors | OpenTelemetry to Grafana Cloud, errors to Sentry, EU regions |

## Requirements

This is a decision spec, so it has no implementation build plan. These acceptance criteria are fitness checks: properties the platform must keep, proven by the features that build each part (named in brackets). AC-17 to AC-20 were added by the cross check on 2026-10-22.

- **AC-1**: Before launch, the staging account costs at most $100 a month (Cost Explorer for that account, every full month), with an AWS Budgets alert at $80. From the first production promotion, all accounts together cost at most $300 a month before customer load, with a consolidated budget alerting at 50, 80, and 100 percent. [10, 11, 12, path step 11]
- **AC-2**: A service control policy on the staging, production, and tenants accounts denies every action outside `eu-west-1`, `eu-central-1` (backups), and `us-east-1` (only CloudFront certificates, CloudFront scoped WAF, and the CDK bootstrap there), with global services exempted. A scheduled AWS Resource Explorer query finds no Aurora, S3, ElastiCache, Secrets Manager, or EBS resource outside `eu-west-1` and `eu-central-1`. [10, 12]
- **AC-3**: Once `aft-dev` is deleted (path step 5), the management account holds only Organizations, IAM Identity Center, billing, CloudTrail, the `remwa.tech` Route 53 zone, and the `Shared` CDK stack; no compute or database runs there. [10, 12]
- **AC-4**: Through the `aft_app` role, a query on a tenant table with no organization set returns zero rows (no error), one with organization A never returns organization B's rows, and an insert with another organization's id is rejected (X15). [12, 29]
- **AC-5**: `aft_app` and `aft_system` own no tables and have no `BYPASSRLS`; tenant tables use `FORCE ROW LEVEL SECURITY`; only `aft_migrator` owns tables and runs DDL, including DBOS's own schema. [12, 24]
- **AC-6**: The production platform database can be restored in `eu-west-1` to a point 5 minutes before a chosen time (RPO 5 minutes in Region), and a same Region rebuild from CDK plus that restore completes within 4 hours in the disaster recovery drill. A loss of the whole Region has an RPO of 24 hours (daily copy to `eu-central-1`) and follows the cross Region runbook without a time promise. [12, 131]
- **AC-7**: Every deploy runs images by digest (I3). The pipeline writes a digest manifest per commit; staging deploys on every merge to `main`; `promote` refuses any commit whose digest manifest is not recorded as deployed to staging, deploys the infrastructure code from that same commit, and requires a GitHub `production` environment approval. [16, 18, 19]
- **AC-8**: Every AWS resource in staging, production, tenants, and the management account's `Shared` stack is defined in CDK (the existing zone enters through `cdk import`); `cdk diff` after a deploy is empty, and a scheduled CloudFormation drift check alerts on drift (I5). [10, 13]
- **AC-9**: CI reaches AWS only through GitHub OIDC roles (one per account, including a management account role limited to the `Shared` stack); no account contains IAM users with access keys. [10, 16]
- **AC-10**: A sample workflow interrupted by stopping the worker task mid run resumes on the next worker start: its database transaction steps commit exactly once, and its external steps, which may run more than once, are idempotent so the outcome is the same as one run (X4). [24]
- **AC-11**: No code outside a provider's adapter folder imports that provider's SDK (lint rule), and every adapter passes its port's shared contract test. [7, 83, 86]
- **AC-12**: Code generated by App Studio and customer instance code run only in the sandbox provider or in the `aft-tenants` account, never in the staging or production accounts and never with their credentials, and are served only from the untrusted domain, never from `remwa.tech` or its subdomains (S10). [62, 114]
- **AC-13**: Every service sends traces with `service.name` and `deployment.environment`, and errors to Sentry; a test error and a test trace from staging appear in both tools; a service starts and serves normally when Grafana Cloud or Sentry is unreachable. [22, 23]
- **AC-14**: In production, each user facing service runs at least 2 tasks across 2 Availability Zones; the ALB deregistration delay is 30 seconds and the stop timeout 30 seconds; a request in flight during a deploy completes successfully (X13). Staging may run 1 task. [11, 19]
- **AC-15**: While `SIGNUP_MODE=allowlist`, a sign up (email, OTP, social, or SSO just in time) whose verified email, lowercased, is not exactly in `SIGNUP_ALLOWLIST` and whose domain does not exactly match an `@domain` entry is refused before the user row is created; an unverified provider email is refused; existing users still sign in. [first production promotion; replaced by feature 21 flags]
- **AC-16**: A CDK assertion confirms each platform ALB is internal and its security group accepts only the CloudFront VPC origin security group; an external HTTPS probe to the ALB's DNS name times out. If the fallback in child 0002 is used instead, AC-16 becomes: the public ALB accepts only CloudFront's origin facing prefix list and rejects requests without the secret origin header. [13]
- **AC-17**: A WebSocket to `collab` and SSE streams from `web` and `mcp` stay open through CloudFront for 10 minutes with a heartbeat every 20 seconds; this spike runs in feature 13 before the internal ALB design is kept. [13]
- **AC-18**: Task security groups allow outbound only on 443 and to the database and Valkey ports inside the VPC (a CDK assertion test); ECS Exec is disabled in production and tenants. [11]
- **AC-19**: Every IAM role the provisioning workflow creates carries the `aft-tenant-boundary` permission boundary and the `aft-tenant-` name prefix; the provisioning role cannot create or change any other role or policy. [62, 66]
- **AC-20**: Each account and Region in use has one customer managed KMS key used by Aurora, Secrets Manager, S3, and snapshots, and GuardDuty is enabled in every account. [10, 12]

## Decision

**Chosen option**: Option 1: Lean AWS on ECS Fargate (see [rationale.md](rationale.md)).

One pnpm and Turborepo monorepo; services as ARM containers on ECS Fargate behind one internal Application Load Balancer per account reached through CloudFront, with no NAT gateway; Aurora PostgreSQL Serverless v2 with row level security; ElastiCache Serverless for Valkey; DBOS Transact for durable workflows; AWS CDK in TypeScript for all infrastructure; GitHub Actions for CI/CD; a separate domain and a separate `aft-tenants` account for untrusted code; self hosted Hocuspocus for collaboration; OpenTelemetry with Grafana Cloud and Sentry; everything in `eu-west-1`.

**Supersedes** these locked decisions from PLAN.md (2026-10-18): Kubernetes on EKS with Karpenter, namespaces per tenant, Argo CD GitOps, Helm charts as the deploy package, Terraform, External Secrets Operator, and a self hosted gVisor sandbox node pool.

**Implementation skills**: `turborepo` (`vercel/turborepo`, `.claude/skills/turborepo/`) · `pnpm` (`antfu/skills`, `.claude/skills/pnpm/`) · `dbos-typescript` (`dbos-inc/agent-skills`, `.claude/skills/dbos-typescript/`) · `opentelemetry` (`grafana/skills`, `.claude/skills/opentelemetry/`) · `sentry-nextjs-sdk` (`getsentry/sentry-agent-skills`, `.claude/skills/sentry-nextjs-sdk/`) · user level AWS skills `aws-cdk`, `aws-containers`, `aws-database`, `aws-networking`, `aws-iam`, `aws-observability`, `aws-security`

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | A modular monolith per app (`apps/web` holds marketing, catalog, dashboard, studios UI, admin), plus separate processes only where the runtime or blast radius differs (`auth`, `worker`, `mcp`, `collab`, `gateway`) | One engineer; split by runtime need, never by taste. |
| Repository | pnpm workspaces plus Turborepo, Node 24 | Locked on 2026-10-18; cached builds and one lockfile for many apps. |
| Language and framework | TypeScript strict; Next.js 16 standalone output for web facing apps; plain Node for `worker`, `collab`, `mcp`, `gateway` | Matches the existing app and spec 0004. |
| Compute | Amazon ECS on Fargate, ARM64 (Graviton) | No control plane fee or nodes to patch; about 20 percent cheaper than x86. |
| Network | One VPC per workload account, 2 AZs, public subnets for tasks (public IPs, outbound 443 only), private subnets for the internal ALB, isolated subnets for data, no NAT gateway, free S3 gateway endpoint | NAT alone would cost about $33 a month per AZ. |
| Edge | Route 53, ACM (CloudFront certificates in `us-east-1`), CloudFront with a VPC origin to one internal ALB per account (fallback: public ALB limited to CloudFront, child 0002); AWS WAF in production and tenants from their first day | The ALB is never public (AC-16). |
| Primary database | Aurora PostgreSQL 17 Serverless v2: `staging` cluster (0 to 1 ACU, auto pause, also holds the `dev` database), production `platform` cluster (0.5 to 4 ACU), `tenants` cluster in the tenants account with the first dedicated customer | Same engine as today; scales with load; pauses when idle. |
| Database roles | `aft_migrator` (owner, DDL), `aft_app` (apps, RLS bound to one organization), `aft_system` (worker only, RLS bound to system work) | Least privilege; no role bypasses RLS. |
| Tenant isolation | `organizationId` on every tenant row, repository layer plus forced row level security | A missed filter returns nothing instead of leaking (X15). |
| Cache and ephemeral state | ElastiCache Serverless for Valkey, per environment, created at a fixed path step (Path to live) | No node sizing; about $6 a month minimum. |
| Object storage | S3 per environment (assets, private, backups), CloudFront with origin access control for public assets | Never store files in the database. |
| Encryption and detection | One customer managed KMS key per account and Region; GuardDuty in every account | Keys we control for data and snapshots; threat detection for a few dollars a month. |
| Durable workflows | DBOS Transact (TypeScript library) in one `apps/worker` task | No new server or bill; steps survive restarts. |
| Provider access | Ports and adapters; the LLM adapter is built on the Vercel AI SDK | Swap any provider by touching one adapter. |
| Infrastructure as code | AWS CDK in TypeScript (`infra/cdk`), state held by CloudFormation | Same language as the app; no state bucket or locks; built in drift detection. |
| CI/CD | GitHub Actions, GitHub OIDC to per account IAM roles, ECR, digest manifests, production by approval | Keyless (AC-9); `main` stays protected and is never written by CI. |
| Secrets | AWS Secrets Manager per account, injected through ECS task definition `secrets`, validated by a zod env schema at boot | Native to ECS; replaces External Secrets Operator. |
| Untrusted code | A separate registrable domain and the `aft-tenants` account; generated code only in an EU sandbox chosen in slice 9 (E2B leading) | Boundary now, product when the needs are known. |
| Realtime collaboration | Yjs with a self hosted Hocuspocus service on Fargate, snapshots in Postgres | No per user fees; data stays in AWS. |
| Observability | OpenTelemetry SDK in every service, OTLP straight to Grafana Cloud (EU stack), errors to Sentry (EU region), CloudWatch Logs with 3 day retention as a fallback | $0 within free tiers; vendor neutral; no collector to run. |
| Region and residency | `eu-west-1`; backup copies in `eu-central-1`; only CloudFront related pieces in `us-east-1` | EU only data promise. |

## Cross child contract

### Accounts and environments
| Account | Holds | Environments |
|---|---|---|
| Management `355103369250` | Organizations, IAM Identity Center, billing, CloudTrail organization trail, `remwa.tech` hosted zone (spec 0003, imported into the `Shared` CDK stack) | none |
| `aft-staging` (feature 10) | VPC, internal ALB, CloudFront, ECS cluster `aft-staging`, Aurora `staging` cluster (databases `aft`, `dbos`, `dev`), Valkey, S3, ECR, delegated zone `staging.remwa.tech` | `staging`, plus `local` dev data |
| `aft-production` (path step 11) | VPC, internal ALB, CloudFront, WAF, ECS cluster `aft-production`, Aurora `platform` cluster, Valkey, S3, ECR (replica) | `production` |
| `aft-tenants` (slice 5) | VPC, internal ALB, CloudFront and WAF for the untrusted domain, ECS cluster `aft-tenants`, Aurora `tenants` cluster, tenant secrets, the untrusted domain's hosted zone | dedicated instances and generated app previews proxied from the sandbox |

Local development runs apps on the engineer's machine against the `dev` database on the staging cluster (public endpoint locked to the engineer's IP, child 0003). Per pull request previews come after launch (feature 20), each with a time to live (S12), its own database on the staging cluster, and hostname `pr-<number>.preview.staging.remwa.tech`.

### Names and hostnames
- **Production**: `remwa.tech` (web), `www.remwa.tech` (a CloudFront Function answers `301` to the apex), `auth.remwa.tech`, `mcp.remwa.tech`, `api.remwa.tech` (gateway: AFT code that proxies project APIs and returns their JSON with `Content-Security-Policy: sandbox` and no cookies), `collab.remwa.tech`.
- **Staging**: `staging.remwa.tech`, `auth.staging.remwa.tech`, `mcp.staging.remwa.tech`, `api.staging.remwa.tech`, `collab.staging.remwa.tech`, `sso-example.staging.remwa.tech`.
- **Origins** (CloudFront to ALB only, never public): `origin.staging.remwa.tech`, `origin.remwa.tech`, `origin.<untrusted-domain>`, each a Route 53 alias to the internal ALB with an ACM certificate (DNS validated) on the ALB that covers every viewer hostname of that environment.
- **Certificates**: staging `staging.remwa.tech`, `*.staging.remwa.tech`, and later `*.preview.staging.remwa.tech`; production `remwa.tech`, `*.remwa.tech`; tenants `*.<untrusted-domain>`.
- **Customer controlled hostnames**: only `<slug>.<untrusted-domain>` (and customer custom domains pointed at it, feature 67). No `remwa.tech` hostname serves customer controlled content.
- **Secrets Manager paths**: `aft/<env>/<app>/<NAME>`; OAuth client secrets `aft/<env>/oauth-clients/<clientId>` (spec 0004); tenant secrets `aft/tenants/<slug>/<NAME>` in the tenants account, including a copy of the instance's OIDC client secret written by the provisioning workflow.
- **Tags** on every AWS resource: `project=aft`, `env=<env>`, `owner=platform`, `managed-by=cdk` (or `managed-by=provisioning` and `tenant=<slug>` for resources a tenant workflow creates).
- **ECS**: cluster `aft-<env>`; services named after the app; Service Connect names `<app>.internal`, enabled only once a second internal caller exists.

### Client IP
Behind CloudFront and the ALB, apps read the viewer IP only from the `CloudFront-Viewer-Address` header, which the origin request policy forwards and CloudFront sets itself; `X-Forwarded-For` is not trusted. Rate limits (X7), the sign up gate, and spec 0004's `SignInEvent` use this value.

### Apps and deployables
| App | Runtime | Deployed as | Size to start | When |
|---|---|---|---|---|
| `apps/web` | Next.js | ECS service | 0.5 vCPU, 1 GB | path step 2 onward |
| `apps/auth` | Next.js | ECS service | 0.5 vCPU, 1 GB | spec 0004 T1 |
| `apps/worker` | Node, DBOS | ECS service, exactly 1 task, no load balancer | 0.25 vCPU, 0.5 GB | feature 24 (not in staging before it) |
| `apps/mcp` | Node | ECS service | 0.25 vCPU, 0.5 GB | feature 77 |
| `apps/collab` | Node, Hocuspocus | ECS service, WebSockets | 0.5 vCPU, 1 GB | feature 107 |
| `apps/gateway` | Node | ECS service | 0.25 vCPU, 0.5 GB | feature 75 |
| `apps/sso-example` | Next.js | ECS service in staging only | 0.25 vCPU, 0.5 GB | spec 0004 T1 |

A deployable is added only when its feature ships (cost). Stateless services deploy with minimum healthy 100 percent and maximum 200 percent; the worker with 0 and 100 (child 0004).

### Shared rules every later spec follows
- Internal only routes are not exposed by any ALB listener rule; service to service calls use Service Connect names once enabled.
- Every service: ARM64 image, runs as non root, health check path `/healthz`, graceful `SIGTERM` within 30 seconds, structured JSON logs, OpenTelemetry on, starts even when telemetry backends are down.
- Every WebSocket and SSE stream sends a heartbeat at least every 20 seconds (AC-17).
- Every app validates its environment with a zod schema at boot and refuses to start on a missing or malformed value (scope feature 6). Secrets reach tasks only through ECS `secrets`, never the repo or image layers.
- Every Prisma client uses a pool of at most 5 connections per task (`connection_limit=5`); a CloudWatch alarm fires at 80 percent of the cluster's `max_connections`; RDS Proxy is added only when that alarm fires twice in a month.
- Every external provider is called only through its adapter (child 0005).
- Every multi step or slow job is a DBOS workflow in `apps/worker` (child 0004). Webhooks are stored with a unique event id before they are processed.
- Every tenant table has `organizationId`, a forced row level security policy, and goes through a repository (child 0003).
- Every AWS resource is in CDK; nothing is created by hand except the bootstrap steps listed in child 0006.
- Database migrations are expand then contract (X9), run as a one off ECS task from the `migrate` image target before services update. Production data is never copied into another environment.

### Cost envelope (US East rates; Ireland a few percent higher; recheck against the first bill)
| Line item | Staging before launch | Production at launch |
|---|---|---|
| Fargate tasks (ARM) | web and auth at 0.5 vCPU, 1 GB, 1 task each: about $29 | web and auth 2 tasks each, worker 1: about $64 |
| Public IPv4 ($3.65 each, tasks plus rolling deploy overlap) | about $8 | about $20 |
| Internal ALB plus LCUs | about $18 | about $20 |
| CloudFront (free tier), CloudFront Functions | about $0 | about $0 to $5 |
| WAF (web ACL plus managed rules) | none | about $10 |
| Aurora Serverless v2 | staging at 0 to 1 ACU, paused most of the day: about $10 to $20 | platform at 0.5 ACU minimum: about $45 to $55 |
| Valkey Serverless (from its path step) | about $7 | about $7 |
| Secrets Manager ($0.40 each), KMS key ($1), CloudWatch Logs, ECR, Route 53, GuardDuty | about $10 | about $15 |
| Cross Region snapshot copy | none | about $2 |
| **Total** | **about $82 to $92** | **about $175 to $200** |

With staging and production both running, the total is about $260 to $290, inside the $300 launch budget (AC-1). The `aft-tenants` account costs nothing until the first dedicated customer, whose plan then carries its cost.

## Path to live

The agreed order for getting `remwa.tech` serving the current app (Tracer Bullet: one thin real strand through each feature, thickened after go live). Each step is the thinnest version of its scope feature that the next step needs. `/scope` owns the actual reorder (Follow-up).

| Step | Scope feature | Thin strand needed for go live | Thickened later |
|---|---|---|---|
| 1 | 4 Monorepo migration | pnpm and Turborepo, the app moved to `apps/web`, `packages/db` extracted, CI green | the other packages |
| 2 | 9 Container images | `apps/web` standalone ARM image, non root, `/healthz`, clean `SIGTERM`; a `migrate` image target with the Prisma CLI | images for other apps |
| 3 | 10 AWS foundation | staging account, SCP, KMS key, GuardDuty, CDK bootstrap, GitHub OIDC roles, $100 budget alert at 80 percent | drift detection schedule (I5) |
| 4 | 11 Network and ECS | VPC over 2 AZs, ECS cluster `aft-staging`, internal ALB, egress restricted security groups | Service Connect when a second internal caller exists |
| 5 | 12 Data services | staging Aurora cluster with the three roles and the `dev` database (dump and restore from `aft-dev`, then delete `aft-dev`), backups on | restore drill (I8) |
| 5b | 12 Data services, second slice | Valkey Serverless in staging, before spec 0004 T2 or any second task of `auth` or `collab` | |
| 6 | 14 Secrets delivery | `aft/staging/web/*` injected into the web task | rotation without downtime (X12) |
| 7 | 13 Edge, DNS, certificates | `cdk import` of the zone, ACM certificates, CloudFront with VPC origin, `staging.remwa.tech` delegated, the AC-17 heartbeat spike | CAA, DNSSEC, query logs |
| 8 | 16 Image pipeline | build on merge, push to ECR by digest, write the digest manifest | scan, SBOM, signing (I7) |
| 9 | 17 Migration gate | one off ECS task running `prisma migrate deploy` before the service update | destructive change check (X9) |
| 10 | 18 Deploy to staging | merge to `main` reaches `staging.remwa.tech` with a smoke test | |
| 11 | first production promotion (thin 10, 11, 12, 13, 19 in the production account) | budget raised to $300 total, production account, `platform` cluster, Valkey, WAF, sign up gate on (AC-15), the staging digest manifest promoted by approval; `remwa.tech` live | feature 19 canary later |

Feature 15 (GitOps and environments) no longer has its own engine: environment definitions live in CDK (steps 3 to 7) and promotion lives in steps 10 and 11.

## Consequences

**Positive**:
- Fits the pre launch budget, with no cluster, node, or NAT costs, and the launch budget with both environments running.
- One language (TypeScript) for app code, workflows, and infrastructure.
- Far less to operate than Kubernetes: AWS runs the compute, CloudFormation holds infrastructure state, DBOS needs no server.
- `remwa.tech` goes live after about 11 thin steps instead of after the whole foundation epic.
- Customer code is separated from AFT by an account boundary, not just a cluster name.

**Negative / tradeoffs**:
- Supersedes several locked decisions; PLAN.md, scope features 11, 15, 62, 65, 66, and 67, and spec 0004 use Kubernetes words (namespaces, NetworkPolicy, ingress, Helm, Argo CD) that must be updated (Follow-up).
- ECS has no Kubernetes ecosystem (operators, Helm charts); anything we would have installed from a chart we build or buy.
- Tasks have public IPs for outbound calls; security groups are the only inbound barrier, so they are tested in CDK.
- Production at launch needs about $175 to $200 a month, and the platform database starts with one writer (Aurora storage is replicated across 3 AZs, but a writer failure takes a few minutes to recover) until a reader is added.
- One worker task means workflow throughput is limited to what one task can run until DBOS Conductor or multiple executors are adopted.
- A whole Region loss can lose up to 24 hours of data and has no time promise.
- DBOS is younger than Temporal; if it falls short at feature 24, moving workflows is real work.
- A second domain and a third account to manage.

**Neutral**:
- A move to EKS later stays possible: images, health checks, and the instance manifest are portable.
- `AGENTS.md` still says npm; it changes when feature 4 ships (`/sync`).

## Follow-up

- [ ] Update PLAN.md's locked decisions table and target architecture to this spec (EKS, Argo CD, Helm, Terraform, External Secrets Operator, gVisor pool replaced), with a dated line in MEMORY.md.
- [ ] Spec 0004 update: replace Kubernetes terms (ingress, NetworkPolicy, pipeline namespaces) with ALB listener rules, security groups, and Service Connect; read the client IP from `CloudFront-Viewer-Address` (replacing `AUTH_TRUSTED_PROXY_DEPTH`); logo storage in S3; dedicated instance clients live in the tenants account; size `auth` at 0.5 vCPU and 1 GB.
- [ ] Spec 0003 note: the zone moves into the `Shared` CDK stack with `cdk import` (not Terraform).
- [ ] `/scope`: reorder Foundation per *Path to live* and add the sign up gate to the first production promotion; reword features 11 (network and ECS), 15 (folded into CDK environments and promotion), 62 (image plus `aft-instance.json`, not a Helm chart), 65 (tenant isolation in the tenants account), 66 (instance deploy through a DBOS workflow), 67 (DNS on the untrusted domain).
- [ ] Engineer: raise the AWS budget from `aft-monthly-10usd` to a $100 staging alert before feature 10 creates resources; raise it to $300 total at the first production promotion.
- [ ] Engineer: buy the untrusted domain before slice 5 (dedicated instances) or slice 9 (App Studio previews), whichever comes first.
- [ ] Engineer: pick the root email addresses for the staging, production, and tenants accounts (for example plus addressing) before feature 10.
- [ ] Feature 10 records that the Identity Center admin is assigned a permission set in each new member account.
- [ ] Verify at feature 24: DBOS Transact maturity (version, Prisma coexistence, transaction steps with `forOrg`, `setEvent` streaming for X5, executor ID and app version on Fargate); if it falls short, route back here.
- [ ] Verify at feature 13 (AC-17): WebSockets and SSE through CloudFront VPC origins; if they fail, switch to the public ALB fallback in child 0002 and reword AC-16.
- [ ] Trigger to add the Aurora reader in a second AZ: the first paying dedicated customer or 100 paying workspaces, whichever comes first.
- [ ] Trigger to adopt DBOS Conductor or several worker executors: the worker's queue backlog alarm firing on 3 days in a week.
- [ ] `/sync`: scope feature 13 slice 1 (Route 53) is live in reality but its boxes are unticked; reconcile after the 48 hour check (around 2026-10-23).
- [ ] Agent Skills: `aws/agent-toolkit-for-aws@amazon-elasticache` failed to install on this machine (the repository clone fails); the user level `aws-database` skill covers ElastiCache meanwhile. `vercel/ai@ai-sdk` (official) fits the LLM adapter; offer it at feature 83. MCP servers recommended for you to connect when their features ship: Sentry (hosted, `https://mcp.sentry.dev/mcp`), Grafana (`uvx mcp-grafana`), Valkey (AWS Labs `awslabs.valkey-mcp-server`).
- [ ] Research caches in `docs/.agent-cache/` are not gitignored; decide whether they are committed.

## Rationale

Reasoning, options, landscape evidence, the merge record, the cross check record, and references: see [rationale.md](rationale.md).
