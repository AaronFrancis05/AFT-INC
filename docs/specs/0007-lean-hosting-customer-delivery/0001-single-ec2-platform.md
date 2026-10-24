# 0007.0001. The AFT platform on one EC2 server

Part of [0007](index.md). Shared rules are in the index *Cross child contract*; fitness checks are AC-1 to AC-19 and edge cases I9 to I17 in the index.

## Summary

The whole AFT platform runs on one small ARM server in AWS Ireland. A config file describes the containers (Caddy for HTTPS, the web app, the auth app, the background worker, and Postgres). GitHub builds the images and a release bundle, and after you approve, a fixed deploy command reaches the server through AWS Systems Manager (no SSH). Nightly backups go to S3, and alarms email you when something breaks.

## Decision

One EC2 t4g.small, Amazon Linux 2023, in a new `aft-production` member account, defined in CDK, running Docker Compose behind Caddy, with Postgres 17 on the box, secrets in Parameter Store, images in ECR, release bundles in S3, and deploys by a custom SSM document after a GitHub approval. No staging server.

## Account and CI roles

- New member account `aft-production` under the existing Organization. The management account keeps Organizations, IAM Identity Center, billing, the CloudTrail trail, and the `remwa.tech` zone (spec 0003). No `aft-staging` or `aft-tenants` account.
- SCP on `aft-production`: Region allow list (AC-2), deny leaving the Organization, deny stopping CloudTrail.
- People use an Identity Center permission set.
- CI uses two GitHub OIDC roles, both trusting only `token.actions.githubusercontent.com` with audience `sts.amazonaws.com` (AC-8):
  - `aft-ci-push`: subject `repo:AaronFrancis05/AFT-INC:ref:refs/heads/main`. ECR push to `aft/*`, `s3:PutObject` on `aft-production-releases-<account>/releases/*`. Nothing else.
  - `aft-ci-deploy`: subject `repo:AaronFrancis05/AFT-INC:environment:production`. `ssm:SendCommand` only with the custom document `aft-deploy` and only on instances tagged `app=aft`, plus `ssm:GetCommandInvocation`. It can't run arbitrary shell, read parameters, or push images.
- The `remwa.tech` records for the server (apex, `www`, `auth`) are A records to the Elastic IP, written by a narrow cross account role in the management account's `Shared` stack that may change only those named records.

## Network

- CDK VPC `10.30.0.0/16`, one public subnet in `eu-west-1a`, an internet gateway, no NAT, a free S3 gateway endpoint. IPv4 only (no AAAA records).
- Security group `aft-web`: inbound TCP 80 and 443 from `0.0.0.0/0`; outbound all (OS updates, ECR, providers). No SSH (AC-3).

## Instance

| Setting | Value |
|---|---|
| Type | `t4g.small` (2 vCPU ARM, 2 GB), credit mode `standard`; a `CPUCreditBalance` alarm below 50 (AC-12); fallback is `unlimited` at $0.04 per vCPU hour of surplus |
| AMI | latest Amazon Linux 2023 ARM64 from the SSM public parameter, resolved at CDK deploy and pinned; replaced only on purpose. Build step 4 checks the SSM agent is present (not confirmed in the landscape check) |
| Disk | 30 GB gp3, encrypted with the AWS managed EBS key, `DeleteOnTermination` false |
| Address | one Elastic IP |
| Metadata | IMDSv2 required, hop limit 2; a `DOCKER-USER` iptables rule (installed by user data, kept by a systemd unit) drops traffic to `169.254.169.254` from every container except the `worker` container's fixed address on the `aws` network |
| Role | `aft-instance`: `AmazonSSMManagedInstanceCore`, CloudWatch agent put, ECR pull on `aft/*`, `ssm:GetParametersByPath` on `/aft/prod/*` (used only by host deploy scripts and the worker), S3 get on `releases/*`, S3 put and get (no delete) on the backup bucket, S3 put, get, delete on the delivery bucket |
| Termination | API termination protection on |

User data (also kept as `infra/host/bootstrap.sh`) installs Docker and the Compose plugin, the `git` binary, creates a 2 GB swap file, turns on `dnf-automatic` for security updates (kernel reboots by hand in a quiet hour), installs the CloudWatch agent (memory, disk, and the backup heartbeat), installs the iptables rule, and creates `/opt/aft/{releases,env}` and `/var/lib/aft/render` (render scratch, 500 MB quota by a dedicated loop mounted filesystem).

## Containers (`infra/compose/compose.yml`, shipped in the release bundle)

| Service | Memory limit | Swap | Node heap | Notes |
|---|---|---|---|---|
| `caddy` | 50 MB | none | | ports 80 and 443; Caddyfile in the bundle with `email` set; certificates on volume `caddy_data`; `www` to apex `301`; overwrites `X-Forwarded-For` (AC-14); blocks `/readyz` and `/internal/*` from outside |
| `web` | 320 MB | none (`memswap_limit` = `mem_limit`) | `--max-old-space-size=240` | Next.js standalone |
| `auth` | 256 MB | none | `--max-old-space-size=192` | from spec 0004 T1 |
| `worker` | 272 MB | up to 2x | `--max-old-space-size=200` | DBOS; renders and pushes (child 0002); bundles `git` and `gitleaks`; the only container on the `aws` network; serves `/internal/presign` to `web` on the Compose network only |
| `postgres` | 252 MB | none | | `shared_buffers` 64 MB, `max_connections` 30, volume `pgdata`, published on `127.0.0.1:5432` only (for the SSM port forward) |

Steady total: 1,150 MB (AC-6). Tool containers (profile `tools`) run one at a time under the deploy lock: `migrate` (192 MB, the worker is stopped while it runs) and `backup` (128 MB, `postgres:17` client image). The worst case peak is 1,278 MB, checked by the pre go live load test (AC-6).

Every service: `restart: unless-stopped`, `json-file` logging (`max-size` 10 MB, 3 files), an env file from `/opt/aft/env/`, and a health check: `caddy` on its admin endpoint, `web` and `auth` on internal `/readyz` (runs `SELECT 1`), `worker` on its DBOS status, `postgres` with `pg_isready`. The public `/healthz` on web and auth is shallow (process up, no database call) so the Route 53 probe doesn't flap on short database blips.

## Data and backups

- Databases on one server: `aft` (platform), `dbos` (DBOS system database), `dev`. Roles as spec 0005 child 0003 (`aft_migrator`, `aft_app`, `aft_system`), spec 0006's `aft_admin_read`, and `aft_dev` (CONNECT on `dev` only, connection limit 5). `REVOKE CONNECT ON DATABASE aft, dbos FROM PUBLIC`. `infra/postgres/bootstrap-roles.sql` creates roles and grants idempotently and runs on every deploy (init scripts only run on an empty data directory).
- `aft-backup` systemd timer at 02:30 UTC, under the deploy lock, in the `backup` tool container:
  - `pg_dumpall --globals-only` and `pg_dump --format=custom` of `aft`, `dbos`, `dev`, streamed to `s3://aft-production-backups-<account>/pg/<db>/<date>.dump`
  - a tar of the `caddy_data` volume to `caddy/<date>.tar`
  - on success, a CloudWatch heartbeat metric `aft/backup/success`, alarmed when missing for 26 hours (missing data counts as breaching).
- The backup bucket is versioned, encrypted (SSE S3), blocks public access, expires current objects after 30 days, and expires noncurrent versions after 7 days.
- Data Lifecycle Manager takes a daily snapshot of the root volume at 03:00 UTC and keeps 7.
- Restore drill, on the first of each month: restore the newest `aft` dump into `restore_check`, compare row counts of `User`, `Organization`, and `Purchase` with the source (within 1 percent), drop it, and push a metric that alarms on failure (AC-11).
- Rebuild rehearsal, once before go live (path step 11) and after any change to `bootstrap.sh`: deploy a second copy of the stack to a temporary instance, restore globals, dumps, and Caddy data, deploy the current release, check `/readyz`, then destroy it. Must finish within 2 hours (AC-11).
- Moving off Aurora (AC-13):
  1. `pg_dump` from `aft-dev` through the engineer's IP rule.
  2. Restore into `dev` through an SSM port forward to `127.0.0.1:5432`, as `aft_dev`.
  3. Check counts.
  4. Delete `aft-dev`: turn off deletion protection, keep a final snapshot 7 days, then remove it with its security group, subnet group, and Secrets Manager secret.

## Secrets

- Values live in Parameter Store `SecureString` under `/aft/prod/<app>/<NAME>`. CloudFormation can't create `SecureString` parameters, so CDK creates none; `infra/scripts/seed-parameters.ts` lists every parameter name with its description and prompts the engineer for missing values (run by hand, never in CI).
- Each app's zod env schema is exported as `env-schema.json` into the release bundle; the deploy fails before touching containers if any required name is missing under `/aft/prod/<app>/` (AC-9).

## Deploys

1. **On merge to `main`** (role `aft-ci-push`):
   - CI builds ARM64 images (native ARM runner where available, else Buildx with QEMU) and pushes `aft/<app>` to ECR by digest.
   - It uploads the release bundle to `s3://aft-production-releases-<account>/releases/<sha>/`: `compose.yml`, `Caddyfile`, `deploy.sh`, `bootstrap-roles.sql`, `digests.env`, `env-schema.json`.
   - CI also runs the migration lint: any migration containing `DROP COLUMN`, `DROP TABLE`, `RENAME`, `ALTER COLUMN ... TYPE`, or `SET NOT NULL` fails unless it carries a `-- contract: <reason>` line, and contract migrations ship only in a release whose previous release was expand only (X9).
2. **The `deploy` job** waits for the `production` environment approval and uses GitHub `concurrency: deploy-production` (no overlap). With role `aft-ci-deploy` it sends the SSM document `aft-deploy` with one parameter, `releaseSha` (pattern `^[0-9a-f]{40}$`).
3. **On the box**, `aft-deploy` takes `flock /opt/aft/deploy.lock` (shared with backups) and runs these steps in order:
   1. Download the bundle to `/opt/aft/releases/<sha>/`.
   2. Check the env names against Parameter Store, then render the env files (mode `0600`, root).
   3. `docker compose pull`.
   4. Take a pre migration dump of `aft` and `dbos` to `s3://…/releases/<sha>/pre-migrate/`.
   5. Restore that dump into `restore_check` and run `migrate` against it (a cheap staging substitute); stop on failure.
   6. Run `bootstrap-roles.sql`.
   7. Stop `worker`, run `migrate` against `aft` and `dbos`.
   8. Point the symlink `/opt/aft/current` at the new release, then `docker compose up -d --wait --remove-orphans`.
   9. Smoke test `https://remwa.tech/healthz` and `https://auth.remwa.tech/healthz` (when auth exists) through Caddy, within 120 seconds.
4. **On smoke test failure** the script re-points `current` to the previous release, runs `up -d --wait`, and exits non zero (AC-7). Automatic rollback is safe because the lint keeps every release's migrations expand only against the previous release.
5. **After a rollback**, DBOS workflows started by the newer application version (version = release sha) stay pending until that version is deployed again or the engineer cancels them. Render workflows set `maxRecoveryAttempts` to 3, so a render that runs out of memory doesn't loop.
6. **On success** the script prunes images except the current and previous sets and keeps the last 5 release folders.
7. **Downtime:** each container restart causes up to about 30 seconds of failed requests (AC-15).

## Alerts

SNS topic `aft-alerts` emails the engineer:
- `StatusCheckFailed_System`, with the EC2 `recover` action, and `StatusCheckFailed_Instance` (I9).
- `mem_used_percent` above 85 for 15 minutes; `disk_used_percent` on `/` above 80; `CPUCreditBalance` below 50 (I10, I11, I16).
- The backup heartbeat missing for 26 hours, and a restore drill failure (AC-10, AC-11).
- A Route 53 HTTPS health check on `https://remwa.tech/healthz` every 30 seconds, alarmed in `us-east-1` through a small CDK stack there (AC-2 allows it).
- An external free uptime monitor on the same URL, set up by the engineer (AC-12).
- Grafana Cloud alerts on the OpenTelemetry error rate (spec 0005 child 0009).
- Budget alerts at 50, 80, and 100 percent of $28 (AC-1).

## Cost (`aft-production`, eu-west-1, on demand)

| Item | Monthly |
|---|---|
| t4g.small, 730 hours (about $0.0184 an hour; check in the Pricing Calculator) | about $13.40 |
| 30 GB gp3 (about $0.088 per GB; check) | about $2.60 |
| Elastic IP in use ($0.005 an hour, verified) | $3.65 |
| EBS snapshots (incremental), S3 backups and releases | about $1.20 |
| Route 53 health check with HTTPS | about $1.50 |
| CloudWatch agent metrics, alarms, SNS, ECR storage, S3 egress for zips | about $1.20 |
| **Planned total** | **about $23.50** |
| Contingency (about 15 percent) | about $4.50 |
| **Budget ceiling (AC-1)** | **$28** |

The `remwa.tech` hosted zone ($0.50) is billed to the management account, outside this table. Six months cost about $140 to $170 on the card (the credits expired on 2026-10-21; see the index Follow-up). A 1 year Compute Savings Plan saves about $4 a month on the instance; decide after one month of real usage, and not while credits pay if they are reinstated. A CI check runs `cdk synth` and fails when a resource type outside an allow list appears, so a new paid resource can't slip in unnoticed.

## Scale up triggers

| Signal | First action |
|---|---|
| The pre go live load test fails AC-6, the memory alarm fires on 3 days in a week, or any OOM kill | Resize to `t4g.medium` (4 GB; about $27 for the instance, about $37 total a month); stop, change type, start, about 2 minutes down. This is the pre decided fallback |
| `CPUCreditBalance` alarm fires twice in a week | Switch credit mode to `unlimited` and watch the surplus charge; if it passes $5 a month, resize |
| A paying customer needs better than 24 hours RPO | Add WAL archiving to S3 (wal-g) before the next feature |
| Database load, or a need for managed failover | Move Postgres to RDS `db.t4g.micro` |
| App Studio, media, collab, or MCP ship, or sustained load exceeds `t4g.medium` | `/architect` a return to spec 0005's Fargate design |

## Consequences

- Cheap and simple, with nothing to patch except one OS and one Postgres.
- One server, one AZ: downtime on hardware faults and deploys; data loss up to 24 hours on a total loss.
- Deploys take several minutes because of the pre migration dump and the dry run, which is the price of having no staging.
- The worker holds the instance role's power (parameters, buckets); the other containers hold none.
- `dnf-automatic` applies updates, but kernel updates need a planned reboot (a few minutes down).

## Rationale (short)

The engineer funds hosting personally (the $140 of credits expired), and spec 0005's Fargate plan needed $82 to $92 a month for staging alone. One t4g.small with everything on it is the cheapest AWS setup that still fits the apps and a real Postgres in memory, with a measured fallback to `t4g.medium`. Postgres stays on the box because DBOS polls constantly, which would keep Aurora awake, and RDS would add about $15 a month. Caddy handles certificates by itself. A custom SSM document and split CI roles keep the approver from getting a root shell. Release bundles make the compose file and Caddyfile versioned and rollback safe. The pre migration dump and dry run stand in for the missing staging. CDK keeps the box rebuildable within two hours. Runner up: Lightsail 2 GB at $12 a month, rejected because it sits outside the VPC, CDK, and IAM model the rest of the platform uses.
