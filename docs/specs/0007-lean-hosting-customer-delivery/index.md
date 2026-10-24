# 0007. Lean hosting on one EC2 server, and projects delivered to the customer's own hosting

**Date**: 2026-10-24
**Status**: Accepted

## Summary

AFT itself now runs on one small AWS server (an EC2 t4g.small, about $23.50 a month), with its database on the same server, so six months cost about $140 to $170 on the card. (The $140 of AWS credits expired on 2026-10-21 and are being disputed.) AFT no longer hosts anything for customers. When a customer buys a project, they fill in a short form (name, colours, logo, switches), and AFT renders a customized copy and pushes it into the customer's own private GitHub repo with ready deploy files for their host, starting with Docker on any server plus one hosting platform. An optional updates subscription sends each new version of the project as a pull request that keeps the customer's own edits.

## Structure

| Child | What it is | Decision it supports |
|---|---|---|
| [0001-single-ec2-platform.md](0001-single-ec2-platform.md) | Where and how the AFT platform runs: account, server, network, containers, database, backups, deploys, secrets, alerts, cost | One EC2 t4g.small in a new `aft-production` account running Docker Compose behind Caddy, Postgres on the box, release bundles deployed by a custom SSM document, no staging server |
| [0002-customer-hosted-delivery.md](0002-customer-hosted-delivery.md) | How a purchased project reaches the customer: manifest, form, render, GitHub Apps, zip, recipes, updates, checkout, refunds | Logic free rendering pinned to a commit, pushed into a customer created empty private repo, patch based update pull requests, one Stripe Checkout with Stripe Tax |

## What this supersedes

Spec [0005](../0005-platform-architecture/index.md) is **partly superseded** (its status line says so once this spec is accepted).

| Spec 0005 part | Now |
|---|---|
| Child 0001 monorepo, child 0004 DBOS, child 0005 adapters, child 0009 observability | **Still in force** |
| Child 0003 data and tenancy: roles `aft_migrator`, `aft_app`, `aft_system`, forced row level security, the repository layer, the `aft` and `dbos` databases, AC-4, AC-5 | **Still in force**; Aurora, ElastiCache Valkey, the RPO 5 minute target, and the per account KMS key are replaced by child 0001 here |
| Child 0007 untrusted code boundary | **Still in force for App Studio sandbox code only**; there are no customer instances anymore |
| Child 0002 accounts and compute, child 0006 environments and releases, child 0008 collab host (it will run as a Compose service when feature 107 ships) | **Superseded** by child 0001 |
| Umbrella AC-1, AC-2 (partly), AC-3, AC-6, AC-7, AC-8, AC-12 (instances part), AC-14, AC-16, AC-17, AC-18, AC-19, AC-20, the cost envelope, the path to live | **Superseded** by the ACs and path to live below |
| Umbrella AC-9, AC-10, AC-11, AC-13, AC-15 | **Still in force** |

**Valkey is dropped; Postgres takes its jobs** (engineer's pick): rate limit counters and idempotency records become tables, per session refresh locks become `pg_advisory_xact_lock`, and spec 0006's "may spend" flag is read from Postgres with a 30 second in process cache. The ACs in specs 0004 and 0006 that name Redis or Valkey are listed in Follow-up for amendment.

The never committed draft 0005 child 0010 (bring your own AWS cloud) was discarded on 2026-10-24; its manifest idea lives on in child 0002.

From PLAN.md these locks change: subscription modes (shared SaaS, dedicated hosted instance, API plus MCP access) become **one time purchase plus optional updates, delivered to the customer's hosting**; orchestration becomes **Docker Compose on one EC2**.

## Requirements

Fitness checks for the platform (child 0001), proven by the path to live steps in brackets. Child 0002 continues the numbering at AC-20.

**User stories**:
- As the AFT engineer, I want the platform to cost about $23.50 a month so that I can fund at least six months myself.
- As the AFT engineer, I want one approved click to deploy a tested build so that releases are safe without a staging server.

**Acceptance criteria**:
- **AC-1**: The `aft-production` account costs at most $28 in every full month (Cost Explorer), with an AWS Budget emailing at 50, 80, and 100 percent; a CI `cdk synth` check fails when a resource type outside the allow list appears. [step 3]
- **AC-2**: A service control policy on `aft-production` denies actions outside `eu-west-1`, except global services and, in `us-east-1`, the CDK bootstrap, billing, the Route 53 health check alarm, its SNS topic, and CloudWatch alarms. [step 3]
- **AC-3**: The instance accepts inbound traffic only on TCP 80 and 443 from `0.0.0.0/0`; there is no SSH key pair and port 22 is closed; access works only through SSM Session Manager. A CDK assertion test fails on any other inbound rule. [step 4]
- **AC-4**: IMDSv2 is required, with hop limit 2, and no container except `worker` can reach `169.254.169.254` (iptables `DOCKER-USER` rule, tested by `curl` from `web`). The root volume is encrypted. No container port is bound to a non loopback address except Caddy's 80 and 443 (`docker compose config` check). [steps 4, 5]
- **AC-5**: `https://remwa.tech` and `https://www.remwa.tech` serve with valid Let's Encrypt certificates from Caddy (`email` set in the Caddyfile); `www` answers `301` to the apex; HTTP answers `308` to HTTPS. [step 7]
- **AC-6**: Every long running container has a `mem_limit`, and the limits add up to at most 1,150 MB. Postgres, web, and auth can't swap. Tool containers run one at a time under the deploy lock, and the worker is stopped during `migrate`. Before go live, a 10 minute load test (20 requests a second across web pages) run together with one 50 MB render keeps used memory under 85 percent with no OOM kill; failing it triggers the pre decided `t4g.medium` fallback. [steps 4, 11]
- **AC-7**: Every deploy runs images by digest (I3) from a release bundle in S3 named by commit SHA. The deploy job:
  - runs only after the GitHub `production` environment approval, and never overlaps another deploy or a backup (GitHub `concurrency`, plus `flock` on the box)
  - takes a pre migration dump and dry runs `migrate` against `restore_check` before migrating `aft` and `dbos`
  - passes the web and auth smoke tests

  On a failed smoke test it re-points `current` to the previous release and fails. A CI lint keeps every release's migrations expand only against the previous release (X9). [steps 8 to 10]
- **AC-8**: CI reaches AWS only through two GitHub OIDC roles:
  - `aft-ci-push`, trusted for `main` only: ECR push and S3 put of release bundles.
  - `aft-ci-deploy`, trusted for the `production` environment only: `ssm:SendCommand` with the custom document `aft-deploy` on instances tagged `app=aft`.

  No IAM user with access keys exists (spec 0005 AC-9 stays). [step 3]
- **AC-9**: Secrets live only in SSM Parameter Store as `SecureString` under `/aft/prod/<app>/<NAME>`, seeded by `infra/scripts/seed-parameters.ts`. The deploy fails before touching containers when a name in an app's env schema is missing. It renders values into `/opt/aft/env/<app>.env` (mode `0600`, root). No secret is in the repo, an image layer, the compose file, or an SSM command parameter. [step 6]
- **AC-10**: Every night these reach the versioned S3 bucket `aft-production-backups-<account>`: `pg_dumpall --globals-only`, a `pg_dump` of `aft`, `dbos`, and `dev`, and a tar of the Caddy data volume. Current objects expire after 30 days and noncurrent versions after 7. A heartbeat alarm fires when no successful backup has been reported for 26 hours. Data Lifecycle Manager keeps 7 daily EBS snapshots. RPO is 24 hours. [step 5]
- **AC-11**: A monthly restore drill restores the latest dump into `restore_check` and checks row counts on the core tables; a failure alerts (I8). A full rebuild rehearsal (CDK deploy to a temporary instance, restore globals, dumps and Caddy data, deploy the current release, `/readyz` passes) finishes within 2 hours, once before go live and after any change to the host bootstrap. [steps 5, 11]
- **AC-12**: Alerts reach the engineer by email when:
  - the EC2 status check fails (the alarm also runs `recover`)
  - memory use stays above 85 percent for 15 minutes
  - root disk use passes 80 percent
  - `CPUCreditBalance` falls below 50
  - the backup heartbeat or the restore drill fails
  - the Route 53 HTTPS health check on `https://remwa.tech/healthz` fails
  - the external uptime monitor fails

  [step 4, feature 22]
- **AC-13**: The `aft-dev` Aurora cluster is deleted after its data is restored into the `dev` database on the box. `dev` is reachable only through an SSM port forward to `127.0.0.1:5432` and only as `aft_dev`, which can't connect to `aft` or `dbos`. [step 5]
- **AC-14**: Apps read the client IP only from the `X-Forwarded-For` value that Caddy sets, trusting exactly one proxy hop; Caddy overwrites any `X-Forwarded-For` a client sends. Rate limits (X7), the sign up gate, and spec 0004's `SignInEvent` use this value. [step 7]
- **AC-15**: A deploy causes at most 30 seconds of failed requests to `/healthz` when probed every second; this replaces X13 for this stage and is measured at step 10. [step 10]
- **AC-16**: All AWS resources in `aft-production` are defined in CDK (`infra/cdk`) except Parameter Store values, which CloudFormation can't create as `SecureString`; `cdk diff` after a deploy is empty. [step 3]
- **AC-17**: Every service image is ARM64, runs as a non root user, exposes a shallow public `/healthz` and an internal `/readyz` (blocked at Caddy), shuts down within 30 seconds of `SIGTERM`, and logs JSON to stdout (Docker `json-file` driver with `max-size` 10 MB and 3 files). [step 2]
- **AC-18**: While `SIGNUP_MODE=allowlist`, spec 0005 AC-15 holds unchanged. [step 11]
- **AC-19**: The platform never runs code from a project or a purchase. The delivery code may start only `git` and `gitleaks`, through one wrapper module, and a lint rule enforces this. The only customer controlled data on the box is form answers, uploaded images (stored in S3), and GitHub installation and repo ids. [child 0002 build step 1]

### Edge cases (new, added to the PLAN.md catalog)

- **I9** The instance fails a hardware status check → the CloudWatch alarm runs `recover` (same instance id, same EBS and Elastic IP); the engineer is emailed.
- **I10** The box runs out of memory → container limits stop one container from taking the others down; Docker restarts the killed container (`restart: unless-stopped`); the memory alarm fires; the `t4g.medium` fallback in child 0001 applies.
- **I11** The root disk fills (logs, images, render scratch) → Docker log rotation, `docker image prune` after each deploy keeping the previous set, the last 5 releases kept, render scratch on a 500 MB quota, dumps streamed to S3; the disk alarm fires at 80 percent.
- **I12** The EBS volume or the whole AZ is lost → rebuild from CDK in another AZ and restore globals, dumps, and Caddy data from S3 (the rehearsed path, AC-11); up to 24 hours of data lost.
- **I13** A Let's Encrypt issuance fails or hits a rate limit → Caddy retries with backoff and falls back to ZeroSSL; restored Caddy data avoids new issuance after a rebuild; the uptime check alerts if HTTPS breaks.
- **I14** The deploy job dies midway (SSM command times out) → the lock is released when the process exits; the next run is idempotent (same release SHA, `up -d --wait`); migrations are expand only (X9), so old containers keep working against the new schema.
- **I15** The AWS credits are not reinstated → the card pays; the $28 budget alert warns before any surprise.
- **I16** The instance runs out of CPU credits (renders, dumps, migrations) → the `CPUCreditBalance` alarm fires; switch to `unlimited` mode, then resize if the surplus passes $5 a month.
- **I17** The migration dry run against `restore_check` fails → the deploy stops before touching `aft` or any container; the running release keeps serving.

## Decision

**Chosen option**: Option 1, one EC2 server plus customer hosted delivery (see [rationale.md](rationale.md)).

AFT runs only its own platform: one EC2 t4g.small (Amazon Linux 2023, ARM64) in a new `aft-production` member account in `eu-west-1`, running Docker Compose (Caddy, web, auth, worker, Postgres 17). It is defined in AWS CDK and deployed from GitHub Actions as release bundles through a custom SSM document. Purchased projects are rendered from your private GitHub repos with the customer's form answers and pushed into an empty private repo the customer owns through the AFT Delivery GitHub App, with deploy recipes for the enabled hosts. AFT stores no cloud keys and hosts no customer code.

**Implementation skills**: `docker-compose-patterns` (`docker/skills`, `.claude/skills/docker-compose-patterns/`) · user level AWS skills `aws-cdk`, `aws-compute`, `aws-iam`, `aws-observability`, `aws-billing-and-cost-management`, `aws-storage` · `dbos-typescript` (`dbos-inc/agent-skills`, `.claude/skills/dbos-typescript/`) · `stripe-best-practices` (`stripe/ai`, `.claude/skills/stripe-best-practices/`) · `turborepo` and `pnpm` (`.claude/skills/`) for the monorepo layout

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | Modular monolith per app (`apps/web`, `apps/auth`, `apps/worker`), as in spec 0005 | One engineer; split only by runtime need. |
| Language and framework | TypeScript strict, Next.js 16 standalone for web apps, plain Node for the worker | Unchanged from today's app and spec 0005. |
| Hosting | One EC2 t4g.small, Amazon Linux 2023 ARM64, 30 GB gp3, Elastic IP, `eu-west-1`; measured fallback `t4g.medium` | About $23.50 a month; fits the apps and Postgres when the limits are kept. |
| Container runtime | Docker Engine plus Docker Compose v2, release bundles from S3 | One versioned file describes the whole box; no orchestration platform to run. |
| Edge and TLS | Caddy 2 on the box, automatic Let's Encrypt with a ZeroSSL fallback | Free certificates and renewals, WebSockets and SSE work without tuning, about 50 MB RAM. |
| Primary database | PostgreSQL 17 in a container on the box: databases `aft`, `dbos`, `dev`, with spec 0005's roles and forced row level security | $0 extra; DBOS keeps polling, which would keep Aurora awake and costly. |
| Cache and ephemeral state | None; Postgres tables and advisory locks | No measured need; saves RAM and a service. |
| Background jobs | DBOS Transact in `apps/worker` (spec 0005 child 0004) | Unchanged; runs renders and pushes as durable workflows. |
| File storage | S3 (backups, releases, uploads and zips) | Never store files in the database or on the box. |
| Images | Amazon ECR, keep last 10 per repo | The instance role pulls; no registry password on the box. |
| Secrets | SSM Parameter Store `SecureString`, seeded by script, checked at deploy | Free standard tier; Secrets Manager would cost dollars a month. |
| Infrastructure as code | AWS CDK in TypeScript (`infra/cdk`) | Already chosen in spec 0005; same language; CloudFormation holds state. |
| CI/CD | GitHub Actions, two OIDC roles, ECR by digest, release bundles, custom SSM document after `production` approval | Keyless, no SSH port, no root shell for the approver. |
| Observability | OpenTelemetry to Grafana Cloud and errors to Sentry (spec 0005 child 0009), CloudWatch agent, Route 53 health check, a free external uptime monitor | Free tiers plus about $3 a month. |
| Delivery | Two GitHub Apps (Octokit), logic free placeholder renderer with encodings, `git` binary pushes, gitleaks, Stripe Checkout with Stripe Tax | Details in child 0002. |

## Cross child contract

- **Hostnames**: `remwa.tech` (web), `www.remwa.tech` (redirect), `auth.remwa.tech` (from spec 0004 T1). The `mcp`, `api`, and `collab` hostnames are parked with their features. No hostname serves customer code.
- **Parameter paths**: `/aft/prod/<app>/<NAME>`; GitHub App keys under `/aft/prod/worker/`.
- **Tags** on every AWS resource: `project=aft`, `env=prod`, `managed-by=cdk`; the instance also has `app=aft` (the SSM target).
- **Database**: one Postgres server with databases `aft` (platform), `dbos` (DBOS system database), and `dev`. Roles: `aft_migrator`, `aft_app`, `aft_system`, `aft_admin_read` (spec 0006), `aft_dev`. Prisma uses `connection_limit=5` per process and DBOS's pool is 3; `max_connections` is 30.
- **Every multi step job** (render, push, zip, update fan out) is a DBOS workflow in `apps/worker`; renders use queue concurrency 1, and updates are partitioned by purchase.
- **Only the worker container** can reach the instance metadata endpoint, and with it AWS credentials; `web` asks the worker's internal `/internal/presign` for upload URLs.

## Path to live

The order to get `remwa.tech` live on this design (Tracer Bullet: one thin real path, then thicken). `/scope` owns the actual feature rows.

| Step | Scope feature | Thin strand |
|---|---|---|
| 1 | 4 Monorepo migration | pnpm and Turborepo, the app in `apps/web`, CI green |
| 2 | 9 Container images | `apps/web` ARM64 standalone image, non root, `/healthz` and `/readyz`, clean `SIGTERM`; a `migrate` target with the Prisma CLI (AC-17) |
| 3 | 10 AWS foundation | `aft-production` account, SCP, CDK bootstrap, both OIDC roles, the $28 budget, the `cdk synth` cost check (AC-1, AC-2, AC-8, AC-16) |
| 4 | 11 Server and Compose | VPC, security group, instance, Elastic IP and its A records, Docker, swap, iptables rule, alarms (AC-3, AC-4, AC-6, AC-12) |
| 5 | 12 Data services | Postgres container, roles bootstrap, backups to S3 with heartbeat, DLM, restore drill; move `aft-dev` data into `dev`, then delete `aft-dev` (AC-10, AC-11, AC-13) |
| 6 | 14 Secrets delivery | the seed script, deploy time env check and rendering (AC-9) |
| 7 | 13 Edge, DNS, certificates | Caddy certificates once the A records resolve, `www` redirect, the client IP rule (AC-5, AC-14) |
| 8 | 16 Image pipeline | build on merge, push to ECR by digest, upload the release bundle, migration lint |
| 9 | 17 Migration gate | pre migration dump, dry run on `restore_check`, then `migrate` |
| 10 | 18 Deploy | approval, the `aft-deploy` SSM document, smoke tests, automatic rollback; measure deploy downtime (AC-7, AC-15) |
| 11 | first production go live | load test (AC-6), rebuild rehearsal (AC-11), sign up gate on (AC-18); `remwa.tech` serves the app |

Feature 15 (GitOps) is folded into steps 3 to 10, and feature 19 (canary) and feature 20 (PR previews) are dropped at this size.

## Consequences

**Positive**:
- About $23.50 a month instead of about $260 to $290, so six months cost about $140 to $170 rather than about $1,600.
- No customer code ever runs on AFT's server, so a customer's bug or attack can't take AFT down or reach its data.
- AFT needs no per host integrations, no stored cloud keys, and no instance lifecycle (suspend, upgrade, teardown); a large part of the delivery epic disappears.
- Customers own their code and hosting, which many buyers prefer.

**Negative / tradeoffs**:
- One server is a single point of failure: a hardware fault means minutes of downtime, an AZ loss means hours, and up to 24 hours of data can be lost.
- Up to 30 seconds of downtime on every deploy, and deploys take minutes (dump and dry run); with no staging, a bug found in production is fixed forward or rolled back.
- Postgres on the box is AFT's job to patch, back up, and restore; there is no point in time restore.
- The 2 GB box caps what runs at once; App Studio, media, collab, and MCP will need a bigger box or a return to spec 0005 when they ship.
- Dropping Valkey means specs 0004 and 0006 need amendments before their features build.
- Delivered code can't be taken back, so refunds end at delivery and piracy can only be discouraged by terms and the private repo rule.
- No recurring hosting revenue; income is purchases plus updates subscriptions.

**Neutral**:
- A move back to Fargate later stays possible: images, health checks, and env schemas are the same.
- The untrusted domain is no longer needed until App Studio previews (slice 9).

## Follow-up

- [x] On acceptance: set spec 0005's status line to `Partially superseded by [0007](../0007-lean-hosting-customer-delivery/index.md) (2026-10-24)`, pointing to the table above.
- [ ] Spec 0004 amendments (dated note now, rework through `/architect sso architecture`):
  - drop dedicated instance clients; "customers' apps" stays optional for delivered projects
  - client IP from AC-14 here (replaces `CloudFront-Viewer-Address`)
  - `auth` runs as a Compose service
  - AC-9 rate limits on Postgres, with no `REDIS_URL`
  - child 0005 AC-46 and AC-47 (sessions and the per session refresh lock, "Redis down fails closed"): Postgres rows and `pg_advisory_xact_lock`
  - child 0003's 24 hour idempotency cache becomes a table
  - child 0003 AC-23 to AC-26 (runtime writes of client secrets to Secrets Manager): store client secrets hashed in Postgres
  - AC-11 and the `auth.staging` hostname are reworded for local versus production only
- [ ] Spec 0006 amendments (dated note now, rework through `/architect usage billing`):
  - remove AC-15 and the `instance.<size>.minute` unit
  - AC-19 and B18 (Valkey `billing:may_spend`): read from Postgres with a 30 second cache
  - credits remain for AI and media usage
  - purchases and updates subscriptions are plain Stripe Checkout (child 0002)
- [x] PLAN.md: update the locked decisions table, subscription modes, and target architecture, and add edge cases I9 to I17, D13 to D28, B33 to B36.
- [x] Dated amendment notes added at the top of specs 0004 and 0006 (the reworks themselves stay owed, items above).
- [ ] `/scope`: apply the path to live and child 0002's features.
- [ ] Engineer: create the `aft-production` member account (root email with plus addressing) and replace the `aft-monthly-10usd` budget with the $28 one before path step 3.
- [ ] Engineer: all three credits ($100 Free Tier, two $20 Explore AWS) show Expired on 2026-10-21, one day after the Free to Paid upgrade. Keep the billing support case open to ask for reinstatement, and consider AWS Activate. If credits come back, skip a Savings Plan while they pay (credits usually don't cover Savings Plan purchases); otherwise consider a 1 year Compute Savings Plan after one month of real usage.
- [ ] Engineer: create a free external uptime monitor account at path step 4.
- [ ] Engineer: connect the official Stripe MCP (`claude mcp add stripe --transport http https://mcp.stripe.com`) before child 0002 build step 2, and the GitHub MCP before build step 1.
- [ ] Scale up triggers (child 0001) are reviewed when App Studio, media, collab, or MCP work starts.
- [ ] Prices marked "check" in child 0001, the SSM agent on Amazon Linux 2023, and each PaaS's deploy file format are confirmed at the build step that uses them.
- [ ] `AGENTS.md` (`/sync`): add the `docker-compose-patterns` skill bullet, the Stripe and GitHub MCP servers, and the declined third party Caddy and gitleaks skills.

## Rationale

Reasoning, options, and references: see [rationale.md](rationale.md).
