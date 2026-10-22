# 0005. Rationale: platform architecture

Back to the [build spec](index.md).

## Context

> ⚠️ Premise note: the plan approved on 2026-10-18 locked Kubernetes on EKS with Karpenter, Argo CD GitOps, Helm, and Terraform. For a solo engineer with a budget of about $100 a month until revenue, that stack fails on cost before it fails on effort: an EKS control plane, one NAT gateway, and one load balancer cost about $122 a month before a single app runs, and Kubernetes upgrades, add ons, and node security become a standing job for the only engineer. The right framing is the cheapest proven AWS setup that keeps every product promise (shared SaaS, dedicated instances, untrusted code isolation, live collaboration, GA reliability) and leaves a path back to Kubernetes when a team or the dedicated instance count justifies it. This spec supersedes those locked decisions with the engineer's agreement. It also spans nine decisions, so it is an umbrella with nine children.

AFT is a platform with many moving parts: a marketing and catalog site, a dashboard, an identity provider (spec 0004), an MCP server, an API gateway, a realtime collaboration server, background workflows for AI generation and provisioning, per customer dedicated deployments, and an App Studio that builds untrusted generated code. Every later spec needs to know where code lives, where it runs, how data is isolated, how slow work survives crashes, how providers are wrapped, how releases ship, and how it is observed. Without one decision, each feature would invent its own answer.

The forces: one engineer working with AI agents; a hard budget of about $100 a month before launch; first paying customers in 3 to 6 months and under 1,000 in year one; GA rigor for auth, billing, provisioning, infrastructure, and MCP; EU only data residency (GDPR); recovery targets of 5 minutes of data loss and 4 hours to recover; and an AWS account that already holds an Organization, Identity Center, the `remwa.tech` zone, and an Aurora dev cluster. The edge case catalog adds X4 (no dual writes), X9 (expand then contract), X13 (survive an AZ or node loss), X15 (no cross tenant reads), S10 (untrusted code), and I3, I5 (deploy by digest, drift detection).

Not deciding now means the monorepo migration (feature 4), the AWS foundation (feature 10), and the SSO build (spec 0004) would each guess at compute, accounts, and data, and the guesses would conflict.

## Options considered

Compared as whole platform stacks.

### Option 1: Lean AWS on ECS Fargate

pnpm and Turborepo monorepo; ECS Fargate on ARM behind one ALB and CloudFront with no NAT; Aurora Serverless v2 with row level security; Valkey Serverless; DBOS Transact for workflows on our Postgres; AWS CDK in TypeScript; GitHub Actions; separate staging and production accounts; a hosted sandbox on a separate domain for untrusted code; self hosted Hocuspocus; OpenTelemetry with Grafana Cloud and Sentry.

**Pros**:
- Staging fits in about $82 to $92 a month before launch; no control plane, nodes, or NAT.
- Little to operate: AWS runs compute; CloudFormation holds infrastructure state; DBOS needs no server.
- One language for app, workflows, and infrastructure.
- Dedicated instances map cleanly to one ECS service per customer, paid by their plan.

**Cons**:
- Gives up the Kubernetes ecosystem (charts, operators) and the locked GitOps model.
- Tasks with public IPs rely on strict security groups.
- DBOS is younger than Temporal.
- Production still costs about $175 to $200 a month at launch.

### Option 2: The original plan (EKS, Karpenter, Argo CD, Helm, Terraform, self hosted Temporal)

Kubernetes on EKS with Karpenter, namespaces per tenant with quotas and network policies, Argo CD pulling from git, Helm charts for platform and tenants, Terraform for AWS, Temporal for workflows, gVisor nodes for untrusted code.

**Pros**:
- The industry standard for multi tenant platforms; namespaces, NetworkPolicy, and quotas are strong isolation tools.
- Huge ecosystem; GitOps gives a clear audit trail of desired state.
- Temporal is the most proven durable workflow engine.

**Cons**:
- About $122 a month before any workload, over budget; Temporal self hosted adds its own database and services.
- Kubernetes upgrades, add ons, and node security are a standing job for one engineer.
- Three new languages and tools (Helm templates, HCL, Kubernetes YAML) beside TypeScript.

### Option 3: One EC2 instance running k3s

A single Graviton instance with k3s (lightweight Kubernetes), Argo CD, and the same charts as Option 2, with managed Aurora.

**Pros**:
- Keeps Kubernetes and GitOps at about $15 to $30 a month of compute.
- Close to the original plan's tooling.

**Cons**:
- No high availability; one instance failure takes everything down (fails X13 at GA).
- We patch the OS, k3s, and every add on ourselves.
- Moving to EKS later is a migration anyway.

### Option 4: Managed platforms outside AWS (Vercel, Neon, Inngest)

Next.js apps on Vercel, Postgres on Neon, workflows on Inngest, with AWS only for dedicated instances.

**Pros**:
- Fastest to ship for the web apps; previews and CDN built in.
- Generous free tiers for a pre launch product.

**Cons**:
- Contradicts the locked AWS hosting decision and the deletion of the old Vercel project.
- Long lived WebSocket servers (collaboration), workers, and dedicated instances still need AWS, so two platforms to run.
- Per seat and usage pricing grows with customers; EU residency depends on several vendors.

## Rationale

Option 1 is chosen because it is the only option that meets the budget force without failing the GA forces. Option 2 is the right shape for a team, but at about $122 a month before any workload it breaks the $100 budget, and its operating load lands on one person; that is the failure pattern of full container orchestration without a platform team (basis: AWS EKS, NAT, and ALB pricing pages; the managed application platform guidance for small teams). Option 3 meets the budget but fails X13 at GA. Option 4 is fast but splits the platform across vendors and contradicts the AWS decision. ECS on Fargate keeps every product promise: dedicated instances become ECS services with their own database, secrets, role, and security group; untrusted code goes to a hosted sandbox, so the isolation problem leaves our accounts; collaboration is one more small service.

Inside Option 1, the smaller picks follow the same forces. DBOS Transact over Temporal Cloud ($100 a month or more) and Inngest (steps leave AWS) because it runs as a library on the Postgres we already pay for (basis: workflow engine landscape, unconfirmed third party pricing). CDK over OpenTofu because the team writes TypeScript, CloudFormation removes state management, and the AWS rules in `AGENTS.md` already prefer it (basis: `AGENTS.md` AWS guidance). A hosted sandbox over self hosted gVisor because self hosting needs dedicated nodes we cannot afford and hardening we cannot staff; the boundary and the separate domain are fixed now, and the engine (E2B leading) is chosen in slice 9 when the needs are known. Separate staging and production accounts because Organizations is free and a staging mistake must never reach production. Row level security on top of the repository layer because tenant isolation is load bearing and one forgotten filter must return nothing (basis: X15, org isolation designed up front).

The engineer accepted every recommendation in the design conversation, including the supersede of the locked EKS decision after seeing the numbers.

### Decisions made by the architect (RECOMMEND items)

- **No NAT gateway**: tasks in public subnets with public IPs (for outbound calls only) and security groups that allow inbound only from the internal ALB or Service Connect peers; data stores in isolated subnets with no internet route. Runner up: one NAT instance (`fck-nat` style), rejected as one more thing to patch.
- **Internal ALB behind a CloudFront VPC origin**: the ALB has no public address (AC-16) and needs no public IPv4 charges. Runner up: a public ALB that only accepts CloudFront's managed prefix list, rejected as weaker.
- **OTLP straight from each service** to Grafana Cloud rather than a Grafana Alloy collector sidecar, to save a container per task. Runner up: one shared collector service, reconsidered if volume needs sampling or batching.
- **Service Connect** for internal calls once a second internal caller exists, rather than Cloud Map alone or the public URL. Runner up: an internal ALB per caller, rejected for cost.
- **Delegated `staging.remwa.tech` zone** in the staging account; the apex zone stays in the management account (spec 0003), and the production stack writes its records through a narrowly scoped cross account role. Runner up: move the apex zone to production, rejected because spec 0003 just placed it.
- **Backup copies in `eu-central-1`** (Frankfurt) to keep data in the EU. Runner up: `eu-west-2` (London), rejected because it is outside the EU.
- **Migrations as a one off ECS task** (same image, `prisma migrate deploy`) before service updates. Runner up: migrate on app boot, rejected because parallel tasks race.
- **ARM64 only images**, built with Docker Buildx on GitHub hosted ARM runners. Runner up: multi architecture, rejected as wasted build time.
- **Just in time internal packages** (TypeScript source consumed directly, transpiled by each app) rather than building every package. Runner up: compiled packages, rejected for slower feedback.
- **pnpm install script approvals** move from npm `allowScripts` to pnpm `onlyBuiltDependencies` during the monorepo migration.

## Merge record (2026-10-22)

Two Claude sessions interviewed the engineer for this spec at the same time and got conflicting answers. The engineer chose a merge: one session writes, the other's draft becomes review notes. The engineer then settled each conflict:

| Topic | Other session's draft | Settled |
|---|---|---|
| Budget before revenue | $150 to $300 a month | up to $100 a month |
| Compute | EKS Auto Mode, one NAT, VPC endpoints | ECS Fargate on ARM, no NAT |
| Infrastructure as code | OpenTofu with S3 state | AWS CDK |
| Accounts | management plus one workloads account | separate staging and production accounts |
| Deploys | Argo CD from a separate gitops repo, Argo Rollouts canary | GitHub Actions plus CDK, production by approval, canary later |
| Secrets | External Secrets Operator | ECS task definition `secrets` |
| Previews | per pull request from the start | after launch |
| Dedicated instance databases | in the production platform cluster | a separate `tenants` cluster |
| Untrusted code | boundary now, engine in slice 9 | adopted (E2B leading) |

Adopted from the other draft: the path to live plan with sign up gated in production, a separate registrable domain for untrusted content, the hostname and naming rules, CloudFront with a VPC origin to an internal ALB, the sign up gate mechanism (`SIGNUP_MODE` and `SIGNUP_ALLOWLIST` in a Better Auth `user.create.before` hook), the Prisma row level security mechanics (`SET LOCAL app.org_id` in a transaction, `FORCE ROW LEVEL SECURITY`, separate owner and app roles, Better Auth tables excluded), DBOS system tables in their own database, and the Vercel AI SDK inside the LLM adapter.

## Cross check record (2026-10-22)

A read only review on another model (Sonnet) found 36 issues. The engineer decided three directly and chose to apply the recommended fixes for the rest:

- **Budget**: $100 a month for staging before launch; about $300 a month for everything from the first production promotion (AC-1).
- **Tenants**: a third member account `aft-tenants` holds dedicated instances, the `tenants` cluster, and the untrusted domain, so customer code never shares a network or credentials with AFT (AC-12, AC-19).
- **Load balancer**: keep the internal ALB behind CloudFront VPC origins, prove WebSockets and SSE with 20 second heartbeats at feature 13 (AC-17), and fall back to a public ALB limited to CloudFront's prefix list plus a secret header if that fails.
- **Applied fixes**: staging without a worker before feature 24 and a `dev` database on the staging cluster (no extra cluster), with a line item cost table; three database roles with `NULLIF` and `WITH CHECK` policies, a system policy for the worker, and `withOrg` on DBOS's own transaction; one worker task with an explicit executor id and app version, and AC-10 reworded for at least once external steps; permission boundaries for provisioning; egress limited to 443 and data ports; ECS Exec off in production; one customer managed KMS key per account and Region and GuardDuty; honest recovery figures (5 minutes in Region, 24 hours for a Region loss) and a cross Region runbook; digest manifests with a promotion check, infrastructure from the promoted commit, ECR replication and retention; origin hostnames, certificates, the `Host` forwarding policy, and client IP from `CloudFront-Viewer-Address`; testable AC-2, AC-14, AC-16; dump and restore for the dev database; `cdk import` for the zone and a management account deploy role; larger task sizes for Service Connect; an EU only sandbox; normalization rules for the sign up gate; Prisma's ARM engine setting; connection pool limits.

## Landscape evidence (fetched 2026-10-22)

Full notes in `docs/.agent-cache/research/platform-architecture.md`. AWS prices were found for US East; Ireland figures were not confirmed and are usually a few percent higher.

- EKS standard support: $0.10 per cluster hour (about $73 a month). Auto Mode adds a per instance management fee on top of EC2.
- Fargate ARM: about $0.0324 per vCPU hour and $0.00356 per GB hour (derived); about 20 percent below x86.
- NAT gateway: $0.045 per hour plus $0.045 per GB (about $33 a month per AZ). ALB: $0.0225 per hour plus LCUs (about $16 a month).
- ElastiCache Serverless for Valkey: $0.084 per GB hour, 100 MB minimum (about $6 a month at minimum).
- Aurora Serverless v2: $0.12 per ACU hour; 0 ACU auto pause is supported (storage still billed, resume usually under 15 seconds).
- AWS App Runner is closed to new customers; AWS recommends ECS Express Mode.
- Workflow engines (third party sources, unconfirmed): Temporal Cloud from $100 a month; Inngest 50k steps a month free; DBOS Transact open source on Postgres.
- Sandboxes (third party sources, unconfirmed): E2B about $0.05 per vCPU hour; Vercel Sandbox about $0.13; Modal about $0.07.
- OpenTofu is MPL 2.0 under the Linux Foundation; Terraform is BSL since 2023.
- Not researched: Hocuspocus, Liveblocks, Y-Sweet status; Grafana Cloud and Sentry free tier limits; Turborepo and pnpm versions; RDS `db.t4g.micro` price.

## References

**Project sources** (verifiable, in this repo):
- `PLAN.md`: locked decisions table and target architecture (superseded in part), edge case catalog X, D, S, I
- `AGENTS.md`: stack, Tracer Bullet, AWS rules (prefer CDK or CloudFormation)
- `MEMORY.md`: the `aft-dev` Aurora cluster, the Organization and Identity Center setup, the $10 budget
- Spec 0003 (Route 53 zone in the management account); spec 0004 (`apps/auth`, `apps/sso-example`, Redis use)
- `docs/scope/foundation.md`, `delivery.md`, `studio.md`: features 4, 10 to 26, 62 to 67, 107, 114, 131

**Practices & standards**:
- Monolith first and managed platforms for small teams; boring technology
- Multi account AWS environments (separate staging and production)
- Tenant isolation designed up front with defense in depth (row level security)
- Transactional outbox and durable execution (X4); expand then contract migrations (X9)
- Deploy by immutable digest (I3); infrastructure as code with drift detection (I5); keyless CI with OIDC
- RPO and RTO targets with point in time recovery and cross region backup copies

**Links** (web verified during the design conversation):
- AWS EKS pricing: https://aws.amazon.com/eks/pricing/
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- Amazon VPC pricing (NAT gateway): https://aws.amazon.com/vpc/pricing/
- Elastic Load Balancing pricing: https://aws.amazon.com/elasticloadbalancing/pricing/
- Amazon ElastiCache pricing: https://aws.amazon.com/elasticache/pricing/
- Amazon Aurora pricing: https://aws.amazon.com/rds/aurora/pricing/
- Aurora Serverless v2 auto pause: https://docs.aws.eu/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html
- AWS App Runner availability change: https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html
