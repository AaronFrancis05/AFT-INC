# 0005.0001. Monorepo layout and tooling

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

> **Amended 2026-10-24 by spec [0008](../0008-monorepo-migration/index.md).** pnpm 12 replaced `onlyBuiltDependencies` with `allowBuilds` in `pnpm-workspace.yaml`, and CI installs pnpm with `pnpm/action-setup` instead of Corepack (deprecated, leaving Node after 24). The generated Prisma client is no longer committed. Everything else here stands.

## Summary

All AFT code lives in one repository managed by pnpm workspaces and Turborepo. Apps are things that deploy; packages are shared code with a public entry point, and nothing reaches into another package's insides. Packages are plain TypeScript source that each app compiles, so there is no separate build step for them. Apps and packages are created only when a feature needs them.

## Decision

pnpm workspaces plus Turborepo, Node 24, TypeScript strict, internal packages consumed as TypeScript source (just in time packages), one `pnpm-lock.yaml`, infrastructure in `infra/cdk` as its own workspace.

## Layout

```
apps/
  web          Next.js: marketing, catalog, dashboard, studios UI, admin
  auth         Next.js: OIDC provider at auth.<domain> (spec 0004)
  worker       Node: DBOS workflows (child 0004)
  mcp          Node: MCP server (feature 77)
  collab       Node: Hocuspocus (child 0008)
  gateway      Node: API gateway for project APIs (feature 75)
  sso-example  Next.js: reference OIDC client (spec 0004)
packages/
  config       tsconfig bases, eslint config, zod env helpers
  db           Prisma schema, client, migrations, repository helpers, RLS extension (child 0003)
  auth         Better Auth server config and client (spec 0004)
  contracts    zod schemas, event types, Design IR, the instance manifest schema
  ui           shadcn components
  email        react-email templates and the email adapter
  observability OpenTelemetry setup, logger, Sentry init (child 0009)
  ai           LLM and media ports and adapters (child 0005)
  billing      Stripe adapter, entitlements, credit ledger
  provisioning instance workflows and AWS calls (child 0002)
  sandbox      the untrusted code engine port and adapters (child 0007)
infra/
  cdk          CDK app: shared, network, data, services stacks per environment (child 0006)
docs/          scope, specs, reviews, releases
```

Only the folders a feature needs are created; the monorepo migration (feature 4) creates `apps/web`, `packages/config`, `packages/db`, `packages/auth`, `packages/ui`, `packages/email`.

## Rules

- **Package names**: `@aft/<name>`; apps are `@aft/app-<name>` and are never imported.
- **Public API**: each package exports only from `src/index.ts` (and named subpaths declared in its `exports` field, such as `@aft/db/rls`). Deep imports are a lint error.
- **Dependency direction**: apps → domain packages (`billing`, `provisioning`, `ai`, `sandbox`) → shared packages (`db`, `contracts`, `observability`, `config`). Shared packages never import domain packages; domain packages never import each other's tables (bounded contexts from PLAN.md).
- **Just in time packages**: packages ship `.ts` source; Next.js apps list them in `transpilePackages`; Node apps bundle with `tsup` at build. Only `packages/db` has a build step (`prisma generate`).
- **Turborepo tasks**: `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, with `dependsOn: ["^build"]` where needed and outputs declared so the cache works; remote cache off until it is worth paying for.
- **pnpm**: version pinned in `packageManager`; Corepack enabled in CI; install script approvals move from npm `allowScripts` to pnpm `onlyBuiltDependencies`; `node-linker` default (isolated), so phantom imports fail.
- **Versions**: one version of React, Next.js, TypeScript, zod, and Prisma across the repo (pnpm `catalog:` entries).
- **Prisma in images**: `packages/db` keeps the `@prisma/adapter-pg` driver adapter; any engine binary needed is generated for `linux-arm64-openssl-3.0.x`, and Node apps bundled by `tsup` mark `@prisma/client` and the generated client as external so the generated files ship beside the bundle.
- **CI**: the six required checks keep their names and switch from `npm run` to `pnpm turbo run` in feature 4; `AGENTS.md` is updated by `/sync` then.
- **Tests stay beside code** (`*.test.ts`), as today; Playwright e2e lives per app (`apps/web/e2e`).

## Consequences

- One install and one CI pipeline for everything; Turborepo's cache keeps CI fast as apps grow.
- Moving from npm to pnpm changes the CI setup action, the lockfile, and install script approvals in feature 4.
- Just in time packages mean a type error in a package shows up in every app that uses it, which is the point, but builds compile more code.

## Rationale (short)

pnpm and Turborepo were locked on 2026-10-18 and fit a TypeScript monorepo with several Next.js and Node apps. Just in time packages remove a build step per package, which matters more to one engineer than build speed at this size. Creating apps only when their feature starts keeps the repo honest about what exists.
