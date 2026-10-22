# 0005.0006. Environments, infrastructure as code, and releases

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

All infrastructure is written in AWS CDK (TypeScript) and deployed by GitHub Actions without stored keys. Every merge to `main` builds ARM images, records exactly which image digests it built, runs migrations, and deploys staging. Production runs the exact same digests and the same infrastructure code after you approve them in GitHub, and the pipeline refuses anything that never ran on staging. Until feature flags exist, production sign up is limited to an allow list so the site can go live early.

## Decision

AWS CDK in `infra/cdk`; GitHub Actions with OIDC per account; a digest manifest per commit; staging on merge; production by GitHub environment approval of a commit already deployed to staging; rolling ECS deploys with circuit breaker; migrations as a one off ECS task from a `migrate` image; a sign up allow list until feature 21.

## Environments

`local` (apps on the engineer's machine, `dev` database on the staging cluster), `staging` (always on, smallest sizes), `production` (path step 11), `tenants` (slice 5), and `preview` per pull request after launch (feature 20, time to live, its own database on the staging cluster).

## Infrastructure as code

- `infra/cdk` is a workspace with one CDK app: a `Shared` stack in the management account (the imported `remwa.tech` zone, records, the cross account record role, the organization SCPs) and per account stacks `Security` (KMS, GuardDuty, budgets), `Network`, `Data`, `Edge`, `Services`, plus `Tenants` in the tenants account.
- Environment differences live in one typed config file per environment (`infra/cdk/env/staging.ts`, `production.ts`, `tenants.ts`); stacks never branch on strings.
- The zone and its five records (spec 0003) enter the `Shared` stack with `cdk import`, using `infra/dns/remwa.tech.records.json` as the source, so CDK becomes the only writer.
- CDK assertion tests run in CI (security groups and egress, encryption, tags, internal ALB, ECS Exec off).
- `cdk diff` runs on every pull request touching `infra/` and is posted to the pull request; a scheduled CloudFormation drift detection run alerts on drift (I5, AC-8).
- **Bootstrap steps done once by hand** (and recorded in MEMORY.md): creating the member accounts, `cdk bootstrap` in each account in `eu-west-1`, `us-east-1` (CloudFront certificates), and `eu-central-1` (backup copies), the GitHub OIDC provider and the first deploy role in each account, and raising the AWS budget.

## Images

- One Dockerfile per app with targets `runtime` (the app) and, for `apps/web`, `migrate` (Node, the Prisma CLI, the schema, and migrations, running as `aft_migrator`).
- Prisma uses the `@prisma/adapter-pg` driver adapter as today; for the ARM images `binaryTargets` includes `linux-arm64-openssl-3.0.x` where an engine is still needed.
- ECR repositories per app in the staging account; a replication rule copies repositories with the `aft/` prefix to the production account (and later `eu-central-1`); the tenants account may only pull from production.
- ECR lifecycle: keep the last 30 images and every image tagged `deployed-<env>`; scanning on push (blocking critical findings comes with feature 16, I7).

## Pipeline

1. **Pull request**: lint, typecheck, test, build, CDK synth and assertions, `cdk diff` (the existing six required checks plus `infra`; the commands move to pnpm and Turborepo in feature 4).
2. **Merge to `main`**: build changed apps as ARM64 images (Buildx on GitHub hosted ARM runners), push them tagged with the git SHA, and write `digests.json` (app to digest, for every app, reusing the previous digest for unchanged apps) as a workflow artifact and a GitHub deployment payload.
3. **Migrate staging**: run the `migrate` task definition (defined in CDK, same subnets and a security group allowed to the database) with `prisma migrate deploy`; stop on failure (feature 17, X9).
4. **Deploy staging**: CDK deploy of the `Services` stack from that SHA with the digests from `digests.json`; ECS rolling update with circuit breaker and rollback; smoke tests against `staging.remwa.tech` (feature 18); tag the images `deployed-staging`; record the GitHub deployment as successful.
5. **Promote to production**: the `promote` workflow takes a SHA, refuses it unless GitHub records a successful staging deployment for it, checks out the infrastructure code at that same SHA, waits for approval on the GitHub `production` environment, migrates, deploys with the same `digests.json`, runs smoke tests, and tags the images `deployed-production` (feature 19, AC-7). Canary shifting is added once production has real traffic.
6. **Rollback**: run `promote` with the previous SHA; infrastructure returns to that SHA's code as well; migrations are expand then contract, so the previous release still works with the newer schema.

CI never commits to `main` (it is protected); the deployed digests live in GitHub deployments and image tags.

## Sign up gate (until feature 21)

- `SIGNUP_MODE` is `open` or `allowlist` (production starts at `allowlist`); `SIGNUP_ALLOWLIST` is a comma list of emails and `@domain` entries, stored in Secrets Manager and changed by updating the secret and restarting the `auth` and `web` tasks.
- Enforced in Better Auth `databaseHooks.user.create.before`, so email, OTP, social, and SSO just in time sign ups are all covered (AC-15).
- Matching: the email is lowercased and trimmed; an email entry must match exactly (no plus alias folding); an `@domain` entry matches only that exact domain, not subdomains; a provider email that is not verified is refused. Existing users still sign in.
- Replaced by a feature flag when feature 21 ships.

## Consequences

- One tool and language for infrastructure; CloudFormation removes state management but deploys are slower than direct API calls.
- Promotion by approval of a recorded digest set is simple and auditable; canary is deferred, so a bad release reaches all production users until rollback.
- Bootstrap steps outside CDK are few but must be written down to rebuild an account within the RTO.

## Rationale (short)

With ECS there is no Kubernetes cluster for Argo CD to reconcile, and a separate gitops repo would be machinery without a payoff at this size. CDK plus Actions keeps everything in one repo and one language, deploys by immutable digest, keeps `main` protected, and makes "production only runs what staging ran" a check the pipeline enforces rather than a habit. The sign up gate lets `remwa.tech` go live on the thin path before the feature flag service exists.
