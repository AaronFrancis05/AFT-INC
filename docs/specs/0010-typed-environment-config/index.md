# 0010. Typed environment config: one validated schema per app, checked at server start

**Date**: 2026-10-28
**Status**: In Progress

## Summary

Every app gets one validated list of the environment variables it needs, built from small slices that each package owns (database, auth, email). When a variable is missing or wrong, the server prints every problem at once, by name only, and stops before it serves a single request. A new `AFT_ENV` variable says whether this is real production, so production can demand live keys, https, and a real sender address. The same list also produces `.env.example` checks, the `turbo.json` variable list check, and the `env-schema.json` that the deploy (spec 0007) uses to check Parameter Store.

## Requirements

**User stories**:
- As the engineer, I want a bad or missing secret to stop the app at start with a clear message, so that it never fails later in live traffic.
- As the engineer, I want production to refuse test keys and development settings, so that a copy and paste mistake can't reach customers.
- As the deploy job (spec 0007), I want a machine readable list of every variable an app needs, so that I can check Parameter Store before touching containers.

**Acceptance criteria**:
- **AC-1**: When any variable in the web app's schema is missing or malformed, `next start` prints one message to stderr that lists every bad variable by name with the rule it broke, sorted by name, then exits with code 1 before serving any request. `next dev` prints the same message and serves no request (it exits too if Next.js lets the start hook end the dev process; build step 1 records which). With a valid environment the server starts as before.
- **AC-2**: The failure message never contains a variable's value, or any part of it, for any rule (I49).
- **AC-3**: `AFT_ENV` is required in every tier and must be `development`, `test`, or `production`; missing or any other value is refused, with no default (I46). `AFT_ENV=production` while `NODE_ENV` is not `production` (for example under `next dev`) is refused (I47).
- **AC-4**: An empty or whitespace only value counts as unset, in every tier (so the Windows single space trick from `AGENTS.md` keeps working). Other values are trimmed before validation (I48).
- **AC-5**: Each variable follows its rule in the *Variable rules* table below, and each refused case in that table fails start with its own message.
- **AC-6**: A social provider with only one of its two values set is refused in every tier. The problem is reported under the missing half, and its text names both variables: "set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither" (A12). With neither set, the provider stays off and its button stays hidden (A11 unchanged).
- **AC-7**: Outside production, the app starts without `RESEND_API_KEY`. The email functions then skip the Resend call, log a warning that names `RESEND_API_KEY` (never a value), and return `null`. `sendVerificationOTP` treats `null` like a failed send, so under `NODE_ENV=development` it still prints the `[DEV FALLBACK] OTP` line, and nowhere else (A3 unchanged). The sender defaults to `onboarding@resend.dev` outside production only.
- **AC-8**: A reusable rule `liveKeyInProduction(prefixes)` in `@aft/config/env` refuses, when `AFT_ENV=production`, any value that starts with one of the given prefixes, with the message "test mode key, not allowed in production". Outside production it allows them. A test proves it with a fixture schema using `sk_test_`, `rk_test_`, `pk_test_` (refused in production, allowed in development) and `sk_live_` (allowed in production) (B13).
- **AC-9**: Each package declares its own variables in one module at `@aft/<pkg>/env` and reads them only through that module's accessor. The web app's schema is exactly the composition of the slices it uses. Every accessor validates `coreEnv` plus its own slice on every call (no cache) and throws the same names only error, inside or outside Next.js (Vitest, scripts, a future worker) (I51).
- **AC-10**: `next build` never runs the whole app check: `register()` returns at once when `NEXT_PHASE` is `phase-production-build`. The CI `build-smoke` job passes with the existing placeholder values plus `AFT_ENV=test` (I50).
- **AC-11**: `pnpm --silent --filter @aft/app-web env:schema` (and `node apps/web/scripts/env-schema.mts`) prints the web app's `env-schema.json` (format below) to stdout and nothing else. It needs no variable to be set, runs on Node 24 with no TypeScript runner, sorts variables by name, and never contains a value.
- **AC-12**: A contract test fails when a schema variable is missing from `.env.example` or from `turbo.json` `globalEnv`, or when either one lists a variable that no app schema declares (`globalEnv` may also list `NODE_ENV`) (I52, I22).
- **AC-13**: `pnpm lint` fails on a direct `process.env` read outside the allowed files (see *Key invariants*). `process.env.NODE_ENV` and `process.env.NEXT_RUNTIME` stay allowed everywhere (I53).
- **AC-14**: CI stays keyless: every job gets `AFT_ENV=test` and placeholder values only, and the six required gates are unchanged (I6).

## Decision

**Chosen option**: plain zod 4 slices owned by each package, composed per app, checked at server start by Next.js `instrumentation.ts`.

A small helper in `@aft/config/env` defines variables with zod rules plus metadata (description, secret, when required). Each package exports its slice from `@aft/<pkg>/env`, `apps/web/env.ts` composes them, and `apps/web/instrumentation.ts` runs the whole check once at start.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no database change. The "model" is the variable registry.

`@aft/config/env` (file `packages/config/env/index.ts`, exports key `./env`) exports:
- `type Tier = "development" | "test" | "production"` and `type Check = (value: string, tier: Tier) => string | null` (rule text when refused, else `null`).
- `defineEnv({ NAME: { description, secret, required, schema, message, checks?, default?, pair? } })` returns a slice.
  - `required`: `"always"`, `"production"`, or `"optional"`.
  - `schema`: a zod string schema for a present, trimmed value; `message` is the fixed rule text shown when it fails.
  - `checks`: extra `Check`s that see the tier (the production only rules).
  - `default`: `{ nonProduction: string }`, used only when unset outside production.
  - `pair`: the other half of a both or neither pair (declared on both halves).
- `coreEnv`: the slice holding `AFT_ENV` (every app composes it), and `aftEnv()`, its accessor.
- `composeEnv(name, slices)` returns an app schema. Two slices declaring the same name is a thrown error at import, so a clash fails every test.
- `parseEnv(schema, source, nodeEnv)`: a pure function. It parses `AFT_ENV` from `source` first to get the tier, then every other variable, and returns `{ ok: true, env }` with typed values or `{ ok: false, problems: { name, rule }[] }` with every problem, sorted by name. It reads only its arguments, so tests pass plain objects and never change `process.env`.
- `checkEnvOrExit(schema)`: `parseEnv(schema, process.env, process.env.NODE_ENV)`. On failure it writes the message to stderr and calls `process.exit(1)`.
- `createEnvAccessor(slice)`: returns `() => env`, which parses `coreEnv` plus the slice from `process.env` on every call (no cache; about ten variables cost nothing). On failure it throws `EnvError`, whose message is the same names only list.
- `toEnvSchemaJson(schema)`: the exporter's data (format below).
- `liveKeyInProduction(prefixes): Check`: the B13 rule (AC-8).

Each package exports its slice and accessor from `src/env.ts` under the exports key `./env`: `dbEnv`/`dbEnvSlice` (`@aft/db/env`), `authEnv`/`authEnvSlice` (`@aft/auth/env`), `emailEnv`/`emailEnvSlice` (`@aft/email/env`). `apps/web/env.ts` exports `webEnv = composeEnv("web", [coreEnv, dbEnvSlice, authEnvSlice, emailEnvSlice])`. `zod` (catalog) becomes a runtime dependency of `@aft/config`, `@aft/db`, and `@aft/email` (`@aft/auth` already has it), and `@aft/config` becomes a runtime dependency of db, auth, email, and the app. Add `@aft/config` to `transpilePackages` in `next.config.ts` (and its test, if it asserts the list).

**Variable rules** (every app slice today; the web app composes all four):

| Variable | Slice | Secret | Required | Refused case → exact rule text |
|---|---|---|---|---|
| `AFT_ENV` | `@aft/config/env` (`coreEnv`) | no | always | unset or other value → `required, one of development, test, production` (I46) · `production` with `NODE_ENV` not `production` → `production needs NODE_ENV=production (use next start, not next dev)` (I47) |
| `DATABASE_URL` | `@aft/db/env` | yes | always | unset → `required` · not a `postgres:` or `postgresql:` URL → `must be a postgres:// or postgresql:// URL` |
| `BETTER_AUTH_SECRET` | `@aft/auth/env` | yes | always | unset → `required` · under 32 characters → `must be at least 32 characters` |
| `BETTER_AUTH_URL` | `@aft/auth/env` | no | always | unset → `required` · not an absolute `http:`/`https:` URL → `must be an absolute http:// or https:// URL` · production and not `https:` → `must use https:// in production` · production and host `localhost` or `127.0.0.1` → `must not point at localhost in production` |
| `GOOGLE_CLIENT_ID` | `@aft/auth/env` | no | optional, pair | set without its pair → reported under `GOOGLE_CLIENT_SECRET` (A12) |
| `GOOGLE_CLIENT_SECRET` | `@aft/auth/env` | yes | optional, pair | missing half → `set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither` (A12) |
| `GITHUB_CLIENT_ID` | `@aft/auth/env` | no | optional, pair | same as Google, names `GITHUB_*` (A12) |
| `GITHUB_CLIENT_SECRET` | `@aft/auth/env` | yes | optional, pair | same as Google, names `GITHUB_*` (A12) |
| `RESEND_API_KEY` | `@aft/email/env` | yes | production | production and unset → `required when AFT_ENV is production` · not starting `re_` → `must start with re_` |
| `RESEND_FROM_EMAIL` | `@aft/email/env` | no | production (default `onboarding@resend.dev` elsewhere) | production and unset → `required when AFT_ENV is production` · not `name@domain` or `Name <name@domain>` → `must be name@domain or Name <name@domain>` · production and domain `resend.dev` → `must not use the resend.dev sandbox sender in production` |

A pair's problem is reported under whichever half is missing (both texts name both variables). When `AFT_ENV` itself is invalid, the checks that need the tier and the production requirements are skipped, and only the `AFT_ENV` problem plus the tier independent problems are listed. Each variable's `description` (for `env-schema.json`) is lifted from its current `.env.example` comment, shortened to one sentence.

**Failure message** (stderr, then exit code 1):

```
[env] The web app can't start. Fix these variables (.env locally, Parameter Store /aft/prod/web/ in production):
  - BETTER_AUTH_SECRET: must be at least 32 characters
  - BETTER_AUTH_URL: must use https:// in production
  - GOOGLE_CLIENT_SECRET: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither
  - RESEND_API_KEY: required when AFT_ENV is production
```

Rule messages are the fixed strings in the table. Never pass zod's own issue text through, because some zod issues include the received value (AC-2).

**`env-schema.json` format** (AC-11; the deploy in spec 0007 child 0001 reads it):

```json
{
  "app": "web",
  "variables": [
    { "name": "AFT_ENV", "description": "…", "secret": false, "required": "always" },
    { "name": "GOOGLE_CLIENT_ID", "description": "…", "secret": false, "required": "optional", "pair": "GOOGLE_CLIENT_SECRET" },
    { "name": "GOOGLE_CLIENT_SECRET", "description": "…", "secret": true, "required": "optional", "pair": "GOOGLE_CLIENT_ID" }
  ]
}
```

Meaning for the production deploy: `always` and `production` names must both exist in Parameter Store; an `optional` name may be absent, but a `pair` must be both present or both absent. `default` values are not exported (they never apply in production).

**API surface** (code interfaces; there are no HTTP endpoints):

| Interface | Kind | Key inputs | Key outputs | Who calls it | Key errors |
|---|---|---|---|---|---|
| `register()` in `apps/web/instrumentation.ts` | Next.js start hook | `process.env` | none | Next.js, once per server start | returns at once unless `NEXT_RUNTIME` is `nodejs`, and when `NEXT_PHASE` is `phase-production-build`; otherwise `await import("@aft/config/env")` and `await import("./env")` inside that branch (no static import, so the Edge bundle never sees `process.exit`) and `checkEnvOrExit(webEnv)`: bad env prints the message and exits 1 |
| `dbEnv()` from `@aft/db/env` | accessor | `process.env` | `{ DATABASE_URL }` | `packages/db/src/index.ts` | `EnvError` |
| `authEnv()` from `@aft/auth/env` | accessor | `process.env` | `{ BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID?, GOOGLE_CLIENT_SECRET?, GITHUB_CLIENT_ID?, GITHUB_CLIENT_SECRET? }` (unset is `undefined`) | `auth.ts` passes `secret` and `baseURL` to `betterAuth()` explicitly, so Better Auth uses the trimmed, validated values; `resolveSocialProviders()` | `EnvError` |
| `resolveSocialProviders(env)` from `@aft/auth/providers` | function | the `authEnv()` result (required parameter, no default) | `{ config, enabled }`; the `missing` field and `warnMissingSocialProviders` are removed | `auth.ts`, the sign in and sign up pages (`resolveSocialProviders(authEnv())`) | none (a half pair can't reach it) |
| `emailEnv()` from `@aft/email/env` | accessor | `process.env` | `{ RESEND_API_KEY?, RESEND_FROM_EMAIL }` (default applied) | `packages/email/src/send.tsx` | `EnvError` |
| `sendVerificationEmail`, `sendPasswordResetEmail` from `@aft/email` | functions | email, code or link | Resend result, or `null` when skipped (no key outside production) | `@aft/auth` | Resend errors, as today |
| `aftEnv()` from `@aft/config/env` | accessor | `process.env` | `"development" \| "test" \| "production"` | future feature flags and tier aware code | `EnvError` |
| `pnpm --silent --filter @aft/app-web env:schema` (runs `node scripts/env-schema.mts`) | CLI | none | JSON on stdout (Node may write an ExperimentalWarning to stderr, which is fine) | the deploy feature (18); the AC-12 test calls `node apps/web/scripts/env-schema.mts` directly | non zero exit only on a code error |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Start check | the tier | `AFT_ENV`: `.env` locally (`.env.example` says `development`), `test` in the CI workflow `env` block, `/opt/aft/env/web.env` in production (rendered from Parameter Store `/aft/prod/web/AFT_ENV` by the spec 0007 deploy) |
| Start check | whether this is a Next.js production build of the server | `process.env.NODE_ENV`, set by Next.js (`next start` sets `production`, `next dev` sets `development`) |
| Start check | which runtime is starting | `process.env.NEXT_RUNTIME`, set by Next.js |
| Start check | whether this is `next build` | `process.env.NEXT_PHASE`, set by Next.js (`phase-production-build`) |
| Start check | each variable's value | `process.env`, filled by `loadEnvConfig` from the root `.env` in `next.config.ts` (spec 0008) locally, and by the Compose env file in production |
| Failure message | the app name ("web") | the `name` argument of `composeEnv` in `apps/web/env.ts` |
| Failure message | each variable name and rule text | the slice definitions (fixed strings) |
| `env-schema.json` | name, description, secret, required, pair | the slice definitions (descriptions lifted from `.env.example` comments) |
| Vitest runs | the tier | `process.env.AFT_ENV = "test"` assigned directly (not `vi.stubEnv`, which the existing `vi.unstubAllEnvs()` calls undo) in a setup file loaded by all six Vitest configs: the five workspaces and the root `vitest.config.mts` (db, email, and the root load no setup file today, so add one) |
| Email send | sender address outside production with none set | the fixed default `onboarding@resend.dev` in `@aft/email/env` |
| Social provider buttons | enabled providers | `resolveSocialProviders(authEnv())`, unchanged logic (A11) |
| AC-12 test | every schema variable | the exporter's JSON output |
| AC-12 test | every `.env.example` variable | lines matching `^NAME=` in `.env.example` |
| AC-12 test | every `globalEnv` variable | `turbo.json` |
| B13 rule | test key prefixes | the `prefixes` argument, chosen by the slice that uses it (feature 35 picks the Stripe ones) |

**Key invariants**:
- **Lint ban** (in `@aft/config/eslint`, which each workspace loads with its own folder as the base, so globs are relative to the workspace): allowed files are `env.ts`, `src/env.ts`, `env/**`, `scripts/**`, `**/*.config.{ts,mts,mjs}`, `**/*.test.{ts,tsx}`, `e2e/**`. The root ESLint config (which lints `ci.test.ts` and root `scripts/**`) allows the same. Everywhere else `pnpm lint` fails on:
  - `process.env.X` and `process.env["X"]` for any name other than `NODE_ENV`, `NEXT_RUNTIME`, `NEXT_PHASE` (`no-restricted-syntax`, using a `:not()` selector on the property);
  - a bare `process.env` not followed by a property (for example a default parameter or `const { env } = process` style use of the object);
  - `import { env } from "node:process"` (and `"process"`), added as entries inside the existing `no-restricted-imports` block, because flat config keeps only the last setting of a rule per file.
  Not covered, and accepted: `globalThis.process.env` and aliasing `process` to another name. `no-restricted-syntax` is set once in `@aft/config/eslint`; a workspace that needs its own entries extends that list rather than replacing it.
- Env modules (`@aft/config/env`, every `@aft/<pkg>/env`, `apps/web/env.ts`) hold rules, never values, and do not import `server-only`. This lets the exporter load them in plain Node 24 type stripping, which needs: one file per module with no relative imports; only erasable TypeScript (no `enum`, `namespace`, or parameter properties); `import type` for every type only import. The script `apps/web/scripts/env-schema.mts` imports `../env.ts` with its extension, so `apps/web/tsconfig.json` sets `allowImportingTsExtensions` (allowed because `noEmit` is on). `apps/web` has no `"type": "module"`, so Node must detect `env.ts` as ESM by its syntax; build step 5 proves it.
- A variable is declared in exactly one slice.
- No value ever appears in a log line, an error message, or `env-schema.json`.
- `turbo.json` `globalEnv`, `.env.example`, and the union of app schemas list the same names (AC-12).

**Security model**: the schema handles secrets but stores none. Values come from the gitignored root `.env` locally and from Parameter Store `SecureString` values rendered into mode `0600` env files in production (spec 0007 AC-9). The `secret` flag in the exporter output tells the deploy and the seed script which names to treat as secret. Client code still reads no non `NEXT_PUBLIC_` variable (spec 0002 AC-1 tests stay), and there is no client schema until a `NEXT_PUBLIC_` variable exists.

**Configuration required**:
- `AFT_ENV`: the tier, `development` | `test` | `production`. New in `.env.example` (value `development`), the CI workflow `env` block (`test`), `turbo.json` `globalEnv`, and the shared Vitest setup (`test`). Production gets it from Parameter Store through the spec 0007 deploy.

**Critical test scenarios**:
- Happy path: `parseEnv` with a full valid development source returns typed values; the Playwright `build-smoke` run (`next start` with the CI placeholders plus `AFT_ENV=test`) serves `/`, verifies **AC-1**, **AC-10**, **AC-14**
- Failure case: `apps/web/instrumentation.test.ts` calls `register()` with `NEXT_RUNTIME=nodejs`, `process.exit` mocked, `BETTER_AUTH_SECRET` too short and `GOOGLE_CLIENT_ID` alone: stderr lists `BETTER_AUTH_SECRET` and `GOOGLE_CLIENT_SECRET` sorted, and exit is called with 1. With `NEXT_RUNTIME=edge` or `NEXT_PHASE=phase-production-build` it does nothing. A real `next start` and `next dev` run with a bad `.env` is a manual proof in build step 1 and `/check verify`, verifies **AC-1**, **AC-6**, **AC-10**
- A3: with no `RESEND_API_KEY` and `NODE_ENV=development`, `sendVerificationOTP` prints the OTP line; with `NODE_ENV=production` it does not, verifies **AC-7**
- Failure case: a sentinel value (`zz-sentinel-value-zz`) fed through every refusing rule never appears in the message, verifies **AC-2**
- Failure case: missing or unknown `AFT_ENV`, and `AFT_ENV=production` with `NODE_ENV=development`, are refused, verifies **AC-3**
- Edge case: `" "` and `""` count as unset; `" re_abc "` is trimmed, verifies **AC-4**
- Rule table: one test per refused case in *Variable rules*, named with its edge case ID where it has one, verifies **AC-5**
- Production rules: `http://` or `localhost` auth URL, missing Resend values, and a `resend.dev` sender are refused only when `AFT_ENV=production`, verifies **AC-5**, **AC-7**
- B13 fixture: `sk_test_` refused in production, allowed in development; `sk_live_` allowed in production, verifies **AC-8**
- Outside Next.js: calling `dbEnv()` with no `DATABASE_URL` throws `EnvError` naming it, verifies **AC-9**
- Exporter: runs with an empty environment, stdout parses as JSON matching the format, sorted, with no value from the test source, verifies **AC-11**
- Drift: removing one name from a copy of `.env.example` or `globalEnv` fails the contract check, as does adding an undeclared one, verifies **AC-12**
- Lint: in `apps/web/eslint.config.test.ts`, a virtual probe file `components/probe.tsx` with each banned form fails, and `process.env.NODE_ENV` passes; the existing `restricted()` helper also collects `no-restricted-syntax` findings, verifies **AC-13**
- Auth/permission: not applicable (no user facing surface; the rule that client code reads no secret is covered by the existing spec 0002 tests)

## Build plan

Tracer Bullet: the first step proves one variable end to end (rule, accessor, app schema, start check, CI); each later step thickens one strand.

1. **Thread.** `@aft/config/env` (`defineEnv`, `composeEnv`, `parseEnv` with blank handling, trimming, tier, checks, defaults, sorted names only messages, `checkEnvOrExit`, `createEnvAccessor`, `coreEnv`) with its `./env` exports key and `zod` as a runtime dependency; `@aft/db/env` with `DATABASE_URL` (plus the `./env` key and the `zod` and `@aft/config` dependencies), used by `packages/db/src/index.ts`; `apps/web/env.ts` composing `coreEnv` and the db slice; `@aft/config` in `transpilePackages`; `apps/web/instrumentation.ts` with its unit test. Add `AFT_ENV` to `.env.example`, `turbo.json` `globalEnv`, the CI top level `env` block (`AFT_ENV: test`, with a `ci.test.ts` check that it is there and no `secrets.` appears in that block), and the Vitest setup in all six configs. By hand, prove that `next start` exits 1 with the message when `DATABASE_URL` is unset and starts when it is set, record what `next dev` does (AC-1), and confirm `next build` passes with the CI placeholders. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-9**, **AC-10**, **AC-14**.
2. **Auth slice.** `@aft/auth/env` with the two auth variables and both provider pairs (`./env` key, `@aft/config` dependency). `auth.ts` passes `secret` and `baseURL` from `authEnv()` to `betterAuth()`. `resolveSocialProviders(env)` takes the `authEnv()` result as a required parameter; drop `missing` and `warnMissingSocialProviders`; the sign in and sign up pages call `resolveSocialProviders(authEnv())`. Rewrite the trim and half pair cases in `auth.test.ts` and `auth-providers.test.ts` for the new contract (half pairs now fail in `authEnv()`). Compose the slice into `apps/web/env.ts`. Satisfies **AC-5**, **AC-6**.
3. **Email slice.** `@aft/email/env` with the Resend rules and the sender default (`./env` key, `zod` and `@aft/config` dependencies). `send.tsx` creates the Resend client inside each send function from `emailEnv()`; without a key (outside production) it logs the warning and returns `null`. `auth-otp.ts` prints the dev fallback line when the result is `null` or the send throws, still only under `NODE_ENV=development`, with its tests updated. Compose the slice. Satisfies **AC-5**, **AC-7**.
4. **Production rules and B13.** The production only rules in the table, plus `liveKeyInProduction` with its fixture test. Satisfies **AC-5**, **AC-8**.
5. **Exporter.** `apps/web/scripts/env-schema.mts` (the app has no `"type": "module"`, so the script uses `.mts`), `toEnvSchemaJson`, and the `env:schema` script in `apps/web/package.json`, with a test that runs it under plain `node` with an empty environment. If Node 24 can't load `apps/web/env.ts` this way, keep the composition in a file Node can load and return here only if that needs a new tool. Satisfies **AC-11**.
6. **Drift contract.** A `Typed environment (spec 0010)` block in root `ci.test.ts` that runs `node apps/web/scripts/env-schema.mts` and compares its names with `.env.example` and `globalEnv`. Add `.env.example`, `apps/web/env.ts`, and `apps/web/scripts/**` (the `packages/**` globs already cover the package env modules) to the inputs of both `//#test:root` and `//#test:root:coverage` in `turbo.json`. Rewrite the `.env.example` header comment (it still promises this feature) and add the `AFT_ENV` section. Satisfies **AC-12**.
7. **Lint ban.** The rules in *Key invariants* in `@aft/config/eslint` and the root ESLint config, tested in `apps/web/eslint.config.test.ts` with a probe per banned form. Fix any read the ban finds that this plan has not already moved. Satisfies **AC-13**.

## Consequences

**Positive**:
- A wrong secret fails in seconds at start, with every problem listed, instead of at the first sign in or email.
- One registry feeds the start check, the drift test, and the deploy's Parameter Store check, so the three can't disagree.
- Packages keep their own rules, so a future `apps/auth` or `apps/worker` composes only what it uses.
- Spec 0002's deferred follow up (a half configured provider) is closed.

**Negative / tradeoffs**:
- One more required variable (`AFT_ENV`) on every machine, CI job, and the production box; a fresh clone that skips `.env.example` won't start.
- A typo in an optional provider pair now takes the whole app down instead of turning one button off. That is deliberate, but a production deploy with a half pair fails its health check.
- The helper is our own code (about 150 lines plus tests) instead of a maintained library.
- Env modules must stay single file and erasable only for the Node exporter, a constraint a future editor can trip over (the exporter test catches it).
- `next build` imports `@aft/db` and `@aft/auth/server` while collecting page data, so `dbEnv()` and `authEnv()` run at build time. A build without `AFT_ENV`, `DATABASE_URL`, or the auth values, which works today for `DATABASE_URL`, now fails, locally and in the future image build. This is accepted; CI already provides placeholders, and feature 9 must too.
- Every existing local `.env` lacks `AFT_ENV`, so the first start after merge fails until it is added (call this out in the PR).
- `AFT_ENV=development` on the production box would quietly turn off the production rules. Seeding `/aft/prod/web/AFT_ENV` correctly (feature 10) is the only guard.

**Neutral**:
- The Resend client is now created per send call instead of once at import.
- `prisma.config.ts` keeps reading `DATABASE_URL` directly; it is CLI configuration, and `prisma generate` runs without it (spec 0009).
- `AGENTS.md` *Environment* needs `AFT_ENV` and the new rule (left to `/sync`).

## Follow-up

- [ ] Feature 35 (Stripe customer and checkout): declare the Stripe variables in their own slice with `liveKeyInProduction(["sk_test_", "rk_test_", "pk_test_"])` for keys, and the matching rule for the webhook secret.
- [ ] Feature 10 / 18 (AWS foundation, deploy): `infra/scripts/seed-parameters.ts` and the deploy's name check read `env-schema.json` from `pnpm --silent --filter @aft/app-web env:schema`, using the `required` and `pair` meaning above; `/aft/prod/web/AFT_ENV` must be seeded as `production`.
- [ ] Feature 9 (container images): the image build runs `next build`, so give it build time placeholder values (or make the Prisma client and auth config lazy, a separate decision) since this spec does not support a build with no environment.
- [ ] Each future app (`apps/auth`, `apps/worker`) gets its own `env.ts`, start check, and exporter; a worker calls `checkEnvOrExit` first thing in its entry point.
- [ ] X12 (secret rotation with old and new keys valid together) is not covered; decide it with the auth secret rotation work.
- [ ] `/sync`: add `AFT_ENV`, the env module rule, and the lint ban to `AGENTS.md` *Environment* and *Rules*.
