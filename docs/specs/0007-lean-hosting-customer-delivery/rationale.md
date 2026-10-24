# 0007. Rationale: lean hosting and customer hosted delivery

Decision record for [index.md](index.md). `/develop` does not read this file.

## Context

Spec 0005 (accepted 2026-10-22) put AFT on ECS Fargate across staging, production, and tenants accounts, at about $82 to $92 a month for staging before launch and $175 to $200 for production, about $260 to $290 with both. AFT would also host customer projects in three ways: shared SaaS tenants, dedicated instances in `aft-tenants`, and API plus MCP resale. A draft child 0010 added AWS only "bring your own cloud" through CloudFormation roles in the customer's account.

The money changed. The AWS account's $140 of credits all expired on 2026-10-21, one day after the Free to Paid upgrade (a billing case asks for them back), so the engineer pays hosting from their own card and wants an EC2 setup cheap enough to run for at least six months: about $23 a month or less. There is one engineer and no paying customer yet.

The product changed too. The engineer no longer wants AFT to run customers' projects. A buyer should run the project on their own hosting (AWS or any other platform), adjusted to what they want. Hosting customer code is also the most expensive and riskiest part of spec 0005: per tenant compute, isolation, suspend, upgrade, teardown, backups, custom domains, and an untrusted domain. Without a decision, the scope keeps features 39 and 62 to 74 that no longer match the product, and the AWS foundation work (features 10 to 14) would build a Fargate estate the credits can't pay for.

Constraints carried forward: TypeScript, Next.js 16, Prisma on Postgres with forced row level security (spec 0005 child 0003), DBOS for durable work (child 0004), Better Auth and spec 0004's identity provider, Stripe for payments, EU data in `eu-west-1`, CI without stored keys.

## Options considered

### Option 1: One EC2 server for AFT, customers host purchased projects themselves (chosen)

AFT runs on one t4g.small with Docker Compose and Postgres on the box. A purchase renders a customized copy into the customer's GitHub repo with deploy recipes for many hosts.

**Pros**: about $23.50 a month (basis: AWS on demand and VPC pricing pages); no customer code on AFT's server; no instance lifecycle to build; works with any host.
**Cons**: single server and AZ; up to 24 hours of data loss; brief deploy downtime; no recurring hosting revenue; code can't be revoked after sale.

### Option 2: Keep spec 0005 Fargate, drop customer hosting

Same delivery model, but AFT itself on Fargate with Aurora.

**Pros**: managed scaling and failover; already designed.
**Cons**: about $82 or more a month even with production only (Fargate, ALB, Aurora at its 0.5 ACU floor, since DBOS polling keeps Aurora awake); six months would cost about $500 or more.

### Option 3: Lightsail 2 GB instance

The same single server design on Lightsail at a flat $12 a month.

**Pros**: cheapest; IPv4, disk, and transfer included.
**Cons**: outside the VPC, IAM role, and CDK model; weaker SSM and CloudWatch integration; migrating later to EC2 or Fargate is a rebuild.

### Option 4: AFT deploys into the customer's cloud with their API key

The customer pastes a provider token; AFT runs per provider deploy adapters (the generalization of draft 0010).

**Pros**: hands off for the customer; AFT can manage upgrades.
**Cons**: AFT stores powerful credentials for every customer; one adapter per provider to build and maintain; deploy jobs run on the small server; AFT owns failures in accounts it doesn't control.

## Rationale

The budget is the deciding force: only the single server options fit $23 a month, and EC2 beats Lightsail because it keeps the IAM, VPC, SSM, and CDK model that spec 0005's fitness checks (keyless CI, everything in code) rely on, at a cost the credits still cover. Postgres on the box costs nothing extra, while Aurora would never pause under DBOS and RDS adds about $15 a month (basis: database backed queue first; DBOS polls its tables).

On delivery, git push plus recipes moves the hard, risky work (running code, holding credentials) out of AFT entirely, which the engineer explicitly wanted. Option 4 would recreate the most expensive parts of draft 0010 for every provider. Logic free rendering with encodings, a customer created private repo with per repo tokens, and patch based updates that read their base from `.aft/delivery.json` are the smallest designs that keep AFT from executing project code, limit what a leaked key reaches, and still let updates merge with customer edits whatever merge style they use (basis: never force push, S13; idempotent workflows, X1 and X4; the Copier project template update model).

The engineer accepted the single server's downtime and 24 hour RPO for the pre launch stage. Child 0001 names the triggers to move up (a bigger instance, WAL archiving, RDS, then Fargate) so the cheap stage doesn't become permanent by accident.

## Landscape check (2026-10-24)

A cheap model checked current facts once (cache: `docs/.agent-cache/research/lean-ec2-customer-delivery.md`).
- Confirmed on the page: public IPv4 costs $0.005 an hour in use or idle; T4g unlimited CPU credits cost $0.04 per vCPU hour (child 0001 uses `standard` credits to avoid them); Caddy issues Let's Encrypt certificates automatically with a ZeroSSL fallback; Caddy v2.11.7 and gitleaks v8.30.1 are the latest releases.
- From search summaries only (to check): t4g.small about $0.018 an hour in `eu-west-1`; Amazon Linux 2023 supported to 2029-06-30; AWS App Runner closed to new customers on 2026-04-30; ECS Express Mode creates Fargate, a load balancer, and a certificate in one call; gitleaks is MIT licensed.
- Not verified: gp3 price in `eu-west-1`, the SSM agent being preinstalled on Amazon Linux 2023, each host's deploy button URL and config format, and the GitHub rule on creating repos with installation tokens. Build steps that use these check them first.

## Cross check record (2026-10-24)

A read only cross check on a different model (Sonnet) returned 30 items. The credits premise was already corrected. The engineer decided eight of them:
- patch based updates instead of a long lived `aft/base` branch
- Postgres instead of Valkey for specs 0004 and 0006
- two GitHub Apps
- Stripe Tax
- `dev` kept on the box behind its own role
- `compose` plus one PaaS at launch
- repeat purchases allowed
- private repos required

The engineer had every other fix applied:
- a memory budget of 1,150 MB with a load test and the `t4g.medium` fallback
- split CI roles and a custom SSM document
- release bundles with locks
- metadata access limited to the worker
- a seeded Parameter Store, with a deploy time check
- `git` binary pushes and no workflow files
- `refund_pending` and `draft` purchases
- automatic initial delivery and retries
- commit SHA pinning and yanking
- placeholder encodings and validators
- image slot limits
- backups of globals, `dbos`, and Caddy data, with a heartbeat and a rebuild rehearsal
- a pre migration dump, a dry run, and a migration lint
- health checks and 30 second deploy downtime
- a CPU credit alarm
- gitleaks allowlists and an admin retry
- update PR states and webhooks
- corrected feature references (catalog 31 and 32, admin 127)
- the widened SCP exception
- an IPv4 only security group
- a $28 budget ceiling with contingency

## Agent skills and MCP (2026-10-24)

Discovery cache: `docs/.agent-cache/tool-discovery/lean-ec2-customer-delivery.md`. Installed `docker/skills@docker-compose-patterns`. The engineer chose to connect the official Stripe MCP and the GitHub MCP. Third party Caddy and gitleaks skills, and Docker daemon MCP servers, were offered or found and not taken.

## References

**Project sources**:
- Spec 0005 (umbrella, children 0001, 0003, 0004, 0009), spec 0006 (usage billing), spec 0004 (SSO)
- `AGENTS.md`: stack, Tracer Bullet build approach, keyless AWS rule
- PLAN.md edge case catalog (X1, X2, X4, X6, X8, X13, X15, B1 to B4, B7, B13, C1, D1, D3, D10, S13, I3, I8)
- Installed skills `docker-compose-patterns`, `dbos-typescript`, `stripe-best-practices`

**Practices & standards**:
- Monolith first; boring technology
- Database backed queue first
- Expand then contract migrations
- Deploy by digest; keyless CI through OIDC
- Never force push to a customer's branch
- Idempotency keys and storing webhooks by event id
- Template update by diffing the old and new render (as the Copier tool does)
- Least privilege tokens scoped to one repository

**Links** (web verified 2026-10-24):
- Amazon EC2 On Demand pricing: https://aws.amazon.com/ec2/pricing/on-demand/
- Amazon VPC pricing (public IPv4): https://aws.amazon.com/vpc/pricing/
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Caddy releases: https://github.com/caddyserver/caddy/releases/latest
- gitleaks releases: https://github.com/gitleaks/gitleaks/releases/latest
