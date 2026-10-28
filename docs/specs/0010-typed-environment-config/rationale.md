# 0010. Typed environment config: rationale

## Context

Scope feature 6 (Foundation, Beta workflow). This is a repo wide decision: today only `apps/web` exists, but `apps/auth` and `apps/worker` are planned (spec 0007), and three packages read variables.

Today the app reads nine variables directly from `process.env` in five places (`packages/db/src/index.ts`, `packages/email/src/send.tsx`, `packages/auth/src/server/auth-providers.ts`, `packages/auth/src/server/auth-otp.ts`, `apps/web/next.config.ts`) with no validation. A missing `RESEND_API_KEY` only shows up when the first sign in code fails to send. An unset `DATABASE_URL` only shows up on the first query. A half configured OAuth pair only logs a warning, which spec 0002 deferred to this feature.

Forces:
- **One image, runtime env.** Spec 0002 and spec 0007 build one image and inject values at runtime from Parameter Store, through a mode `0600` env file. So validation has to happen when the server starts, not when the code is built.
- **No staging.** Spec 0007 runs only production, and a local `next start` also sets `NODE_ENV=production`. So `NODE_ENV` can't tell real production apart. Production only rules (B13: no test payment keys) need another signal.
- **The deploy needs the list.** Spec 0007 AC-9 has the deploy check every name in an app's env schema against Parameter Store before touching containers, using `env-schema.json` from the release bundle. Something has to produce that file.
- **Strict Turborepo env.** A variable missing from `turbo.json` `globalEnv` is invisible to tasks (I22). `.env.example` must list every variable (the scope's Done when).
- **Keyless CI.** CI uses placeholder values, never secrets (I6), and the `build-smoke` job runs `next build` and Playwright against `next start`.
- **Stack.** zod 4.6.7 is already in the catalog, used by `@aft/auth` and the app. Node 24 strips TypeScript types natively. The repo has no TypeScript script runner.

Without a decision, every new package or feature (Stripe at 35, the GitHub Apps in spec 0007) adds more unchecked reads, and the deploy's name check has nothing to read.

## Options considered

### Option 1: Plain zod 4 slices per package, composed per app (chosen)

A small helper in `@aft/config/env` wraps zod rules with metadata (description, secret, when required). Each package owns its slice, each app composes its slices, and `instrumentation.ts` checks at start.

**Pros**:
- No new dependency; zod is already in the stack.
- The metadata we need (secret flag, required in production, pairs) lives next to the rule, so the exporter, the drift test, and the start check share one source.
- Packages declare exactly what they read, so future apps compose only their part.

**Cons**:
- About 150 lines of our own helper to maintain and test.
- The both or neither and production only rules are ours to write; no library gives them for free.

### Option 2: `@t3-oss/env-core` / `@t3-oss/env-nextjs`

The popular wrapper over zod (and other standard schema libraries), with a client and server split, `runtimeEnv` mapping, and checks at build time.

**Pros**:
- Maintained and widely used, with a well known API for the client and server split.
- Supports extending one env object from others, which fits package slices.

**Cons**:
- Adds a dependency for features we don't use today (there is no `NEXT_PUBLIC_` variable).
- Its validation runs when the module is imported, so its default timing is build time unless skipped; we want start time.
- No place for the secret and required in production metadata, so the exporter would need a second registry beside it.

### Option 3: `envalid`

A small, dedicated env validator with its own validator functions (`str`, `url`, `port`) and a clean error report.

**Pros**:
- Purpose built, tiny, and prints a readable report out of the box.

**Cons**:
- Its own validator types, a second validation vocabulary beside zod.
- No JSON export, and the same missing metadata problem as option 2.

### Option 4: One schema per app, no package slices

`apps/web/env.ts` lists every variable with zod; packages keep reading `process.env`, or receive values from the app.

**Pros**:
- The simplest start: one file, no composition.

**Cons**:
- Packages can't validate their own inputs, so `@aft/db` used from a script or worker is unchecked.
- Each new app copies the rules, and copies drift.

## Rationale

The deploy's Parameter Store check (spec 0007 AC-9) is what tips this. It needs more than validation: it needs each variable's name, whether it is a secret, and when it is required. Only option 1 keeps that metadata in the same place as the rule. Options 2 and 3 would need a second registry beside the library, and that is the drift the feature exists to remove. zod is already in the stack, so the cost is a small helper, not a new tool.

Package slices (over option 4) follow from spec 0007's plan for `apps/auth` and `apps/worker`. A worker that imports `@aft/db` should get `DATABASE_URL` checked without copying the web app's rules.

The other calls follow from the forces above. The check runs at start through `instrumentation.ts` because of the one image with runtime env. `AFT_ENV` exists because there is no staging and `NODE_ENV` is `production` under a local `next start`. It has no default, because a missing value in production would silently turn off every production only check. Errors list every problem by name and never a value: the error text goes to logs, and fixing all problems in one pass beats one restart per variable.

Smaller calls made while writing (the engineer did not weigh in):
- **`process.exit(1)` in `register()`, not a thrown error.** The Next.js 16.4.2 docs say `register()` must finish before serving, but not what happens when it throws, so an explicit exit is the only certain outcome. Runner up: throw and rely on Next.js, checked at build step 1.
- **`register()` skips `next build` by checking `NEXT_PHASE`.** The docs don't say whether build workers call it, so a guard decided now beats stopping the build to find out. Runner up: verify first and add the guard only if needed.
- **Accessors parse on every call, no cache.** About ten variables cost nothing to parse, and a cache would serve stale values to tests that change the environment and after a dev hot reload. Runner up: a cache with a reset hook for tests.
- **`auth.ts` passes `secret` and `baseURL` to Better Auth explicitly.** Otherwise Better Auth reads the raw, untrimmed variables itself, and the validated values would go unused.
- **The keyless email path returns `null` rather than throwing.** Skipping is expected outside production, not an error, and `sendVerificationOTP` keeps the A3 dev fallback by treating `null` like a failed send. Runner up: a typed `EmailSkipped` error.
- **Fixed rule messages instead of zod issue text.** Some zod issues echo the received value, which would break AC-2. Runner up: zod's `error` map with custom text, still one place to forget.
- **Production refuses a `resend.dev` sender instead of requiring `aft.remwa.tech`.** This blocks the sandbox sender without hard coding a domain that may change. Runner up: an allow list of verified domains, which belongs with the email domain work.
- **Production refuses `localhost` and `http:` in `BETTER_AUTH_URL`.** OAuth callbacks and secure cookies break silently otherwise.
- **Values are trimmed.** Hand edited `.env` files on Windows pick up stray spaces, and no real secret ends in a space.
- **The Resend client is created per call.** Without a key outside production, constructing it at import would throw, and the SDK costs nothing to construct.
- **`prisma.config.ts` stays outside the schema.** It is Prisma CLI configuration, and `prisma generate` must run with no database URL (spec 0009).
- **The contract test reads names through the exporter.** The root workspace can't import `@aft/*` packages (no hoisting, I19), and running the exporter also proves it works under plain Node.
