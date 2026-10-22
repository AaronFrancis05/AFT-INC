# 0005.0003. Data and tenancy model

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

AFT's data lives in Aurora PostgreSQL Serverless v2 in Ireland. Shared SaaS tenants share tables, and every tenant row carries `organizationId`; the code filters by it, and Postgres row level security filters again, so a forgotten filter returns nothing. Background jobs that must see across tenants use a separate, narrow role. Dedicated instances get their own database in the tenants account. Redis (Valkey) holds short lived state, S3 holds files, everything is encrypted with keys we control, and backups allow restoring to any point in the last 5 minutes within the Region.

## Decision

Aurora PostgreSQL 17 Serverless v2; three database roles; repository layer plus forced row level security with explicit system access; ElastiCache Serverless for Valkey; S3; one customer managed KMS key per account and Region; EU only; RPO 5 minutes in Region and 24 hours for a Region loss; RTO 4 hours for a same Region rebuild.

## Clusters and databases

| Cluster | Account | Capacity | Databases | Network |
|---|---|---|---|---|
| `staging` | staging | 0 to 1 ACU, auto pause after 10 minutes | `aft`, `dbos`, `dev` | public subnets, writer publicly accessible, security group allows 5432 only from staging tasks and the engineer's current IP |
| `platform` | production | 0.5 to 4 ACU, one writer at launch, a reader in a second AZ at the trigger (index Follow-up) | `aft`, `dbos` | isolated subnets |
| `tenants` | tenants | 0.5 to 4 ACU, created with the first dedicated customer | `tenant_<slug>` per instance, each with its own user | isolated subnets |

- The `dev` database replaces the `aft-dev` cluster in the management account: dump with `pg_dump` from `aft-dev`, restore into `dev`, point `.env` at it, then delete `aft-dev`, its secret, subnet group, and security group (snapshot sharing is not used because `aft-dev` uses the default `aws/rds` key). AC-3 is checked after the deletion.
- The staging cluster pauses only while nothing holds a connection: the staging worker does not run before feature 24, and from then on the staging worker is scaled to zero outside working hours by a scheduled action.
- Previews (after launch) get one database each on the `staging` cluster, dropped when the preview ends.
- Every Prisma client uses `connection_limit=5` per task; DBOS's own pool is 3 per worker task.

## Roles

| Role | Used by | Rights |
|---|---|---|
| `aft_migrator` | the one off `migrate` task only | owns every table, runs all DDL, including DBOS's system database and its transaction output table |
| `aft_app` | `web`, `auth`, `mcp`, `gateway`, `collab` | read and write on tenant and platform tables through RLS; no DDL; no `BYPASSRLS` |
| `aft_system` | `worker` only | like `aft_app`, plus the system policies below; no DDL; no `BYPASSRLS` |

## Tenant isolation

- Every tenant table has `organizationId` (text, not null, indexed, foreign key to `organization`).
- Every query goes through a repository in the owning package that takes the organization as an argument; a cross organization request returns `404` (X15).
- Every tenant table has `ENABLE` and `FORCE ROW LEVEL SECURITY` and this policy for `aft_app` and `aft_system`:
  `USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')) WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), ''))`.
  An unset or empty setting compares with null and returns zero rows, never an error (AC-4).
- A second policy, for `aft_system` only: `USING (current_setting('app.system', true) = 'on')`, so system work sees across tenants only inside a transaction that set `app.system` on purpose.
- `packages/db` exports:
  - `forOrg(orgId)`: a Prisma client extension whose operations run in a transaction that first calls `SELECT set_config('app.org_id', $1, true)`; `forOrg(orgId).$transaction(fn)` runs a multi statement unit under one setting.
  - `withOrg(tx, orgId)` and `withSystem(tx, reason)`: set the scope on a transaction someone else opened (a DBOS transaction step or an outer Prisma transaction), so a step and its checkpoint commit together.
  - Tests prove zero rows without a scope, no cross organization reads, rejected cross organization inserts, and that batch calls and nested writes keep the scope.
- Tables without row level security: Better Auth's tables (`user`, `session`, `account`, `verification`, `organization`, `member` and spec 0004's OAuth tables) and the catalog, reached only through their repositories; the outbox and webhook event tables, granted only to `aft_system` and `aft_migrator`.

## Cache, files, encryption, and residency

- **Valkey**: ElastiCache Serverless per environment, TLS, in isolated subnets, created at path step 5b (staging) and step 11 (production). Keys are prefixed by app (`auth:`, `web:`, `collab:`); nothing in Valkey is the only copy of anything.
- **S3**: buckets `aft-<env>-assets` (public through CloudFront origin access control), `aft-<env>-private` (signed URLs), `aft-<env>-backups`; block public access on; versioning on private and backups.
- **Encryption**: one customer managed KMS key per account and Region (`alias/aft-<env>`), used by Aurora, Secrets Manager, S3, snapshots, and their copies; the `eu-central-1` copy uses that Region's key (AC-20).
- **Residency**: data stores only in `eu-west-1`, backup copies only in `eu-central-1` (AC-2). Third party processors must offer EU processing or be listed as sub processors for the legal pages (feature 124).

## Backups and recovery

- Aurora automated backups: 7 days in staging, 14 days in production and tenants; point in time restore gives an RPO of about 5 minutes inside `eu-west-1`.
- AWS Backup copies a daily snapshot of `platform` and `tenants` to `eu-central-1`, kept 14 days; a Region loss can therefore lose up to 24 hours.
- **Same Region rebuild (RTO 4 hours, AC-6)**: restore the cluster to a point in time, redeploy CDK, point the app at it; drilled in feature 131.
- **Cross Region rebuild (no time promise)**: needs, prepared in advance: ECR replication of production images to `eu-central-1`, Secrets Manager replica secrets in `eu-central-1`, S3 replication of `private` and `backups`, the `eu-central-1` KMS key, CDK bootstrap and ACM certificates there. The runbook (feature 131) lists every secret and where its source of truth lives outside the account (Stripe, Resend, Google and GitHub OAuth, Grafana Cloud, Sentry, LLM keys).
- Production data is never copied into staging, dev, or previews.

## Consequences

- Row level security costs a transaction per scoped operation and two helpers to maintain; in exchange a missing filter is not a breach.
- One writer at launch means a writer failure is a few minutes of downtime until the reader exists.
- The staging cluster is reachable from the internet on 5432 for one IP, the price of local development without a bastion; production and tenants clusters never are.
- The `tenants` cluster adds about $44 a month from the first dedicated customer, priced into dedicated plans.

## Rationale (short)

Aurora Serverless v2 is already in use and pauses when idle, which is what makes staging affordable. Tenant isolation is the one thing that cannot be added later without rewriting every query, so it is enforced twice from day one, and the only door around it is a separate role that must announce itself per transaction. Stating the 24 hour Region loss figure plainly beats promising a 5 minute RPO the daily copy cannot keep.
