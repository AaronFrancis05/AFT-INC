# 0011. Engineering standards and shared helpers: rationale

Back to the [build spec](index.md).

## Context

AFT is about to grow from one app with a sign in flow into many features that take money, deliver code, call AI models, and hold data for many workspaces (tenants). Every one of those features repeats the same handful of jobs: check input, check who is calling and for which workspace, make a retried request safe, report errors, write logs. If each feature solves them alone, the platform ends up with as many error shapes, log formats, and tenant checks as it has features, and the one that gets it wrong is usually the one that charges a card or leaks a record.

Earlier specs already decided the big shapes, but none of them built anything. Spec 0005 child 0003 requires `organizationId` on every tenant row, forced Postgres row level security, and repository helpers (`forOrg`, `withOrg`, `withSystem`); child 0005 requires adapters to validate provider output and to use idempotency keys for writes; child 0009 picks pino JSON logs, OpenTelemetry, and Sentry. Spec 0007 moved idempotency records and rate limit counters from Redis to Postgres. Spec 0006 fixes money as integer minor units. Spec 0004 child 0003 leaves its `Idempotency-Key` storage "per the engineering standards spec (feature 7)". The code has none of it: no organization table, no server actions, no logger, no `forOrg`.

The current code already drifts. `@aft/email` logs recipient addresses with `console.log` and prints the error three times, `@aft/auth` uses `console.error` with free text, and `profile.tsx` logs whole form submissions. There is no error type, no request id, and no limit on input size. The schema itself mixes conventions with the specs: Prisma models use camelCase columns and `cuid()` ids, while spec 0006 writes snake_case column names.

The forces are: GA tier for this feature (it sits under money, auth, and tenancy); a solo engineer working with AI agents, so the right way must also be the shortest way and must be checked by machines rather than memory; a small single server (spec 0007), so no Redis and no extra services; CI is the only place with a disposable Postgres, because the `dev` database lives on the server and Docker is kept off the engineer's machine; and EU personal data rules (GDPR), which make logs a liability if they hold emails or IPs. Not deciding means the first real features (29 organizations, 35 checkout, 142 delivery) each invent these rules under deadline.

## Options considered

The technology choices (pino, zod 4, Postgres, problem details) were walked one by one in the design conversation and are recorded in *Choices made in the design conversation* below. The options here are about how far the standard is built and enforced.

### Option 1: Helpers plus enforcement now, existing violations fixed in the same feature

Build every helper with tests, add the lint rules and the contract tests, and fix the six files that break the standard today, all in feature 7.

**Pros**:
- The standard is true on the day it merges: lint is green with no debt list.
- Every later feature starts from a tested `defineAction` or `defineRoute`; the right way is also the least code.
- Lint and CI catch the common slips (a `console.log`, a raw Prisma import, an unwrapped route, an unprotected tenant table) without relying on review.

**Cons**:
- The biggest feature in the foundation epic: one new package, one migration, CI changes, and edits in four existing packages.
- Some helpers (the `org` mode, the API key path) are built before the features that feed them, so they are proven only against stubs until features 29 and 75.

### Option 2: Helpers plus enforcement for new code, existing violations tracked as debt

The same helpers and rules, but existing files get lint disable comments or an ignore list and are fixed later.

**Pros**:
- A smaller first PR.
- No risk of touching working auth and email code now.

**Cons**:
- Six files is little work, and debt lists in a solo project rarely get paid.
- The email logging leaks personal data today; leaving it for later keeps a GDPR problem open.

### Option 3: Write the standard, build helpers as features need them

The spec defines the rules; each feature builds the helper it first needs (feature 29 builds tenant scoping, feature 35 builds idempotency, and so on).

**Pros**:
- No code ahead of need; each helper is shaped by a real caller.
- Feature 7 finishes quickly.

**Cons**:
- The helpers get built under the pressure of a product feature, by whichever feature comes first, and the scope row's done line (tested helpers for X1, X8, X10, X14, X15) is not met.
- Without the helpers there is nothing for lint to point at, so enforcement waits too.
- Tenant isolation is the one property spec 0005 says cannot be added later; proving it first is the point.

### Option 4: Document only, rely on review

Write the rules and let `/check review` look for them.

**Pros**:
- Almost no work now.

**Cons**:
- Review by an AI agent or a busy human misses the quiet failures (a missing filter, a float price) that this standard exists to stop.
- Does not meet the scope row.

## Rationale

Option 1 fits the forces best. The scope row asks for tested helpers, not a document, and the risky features (29, 35, 142) are next in line; each of them should spend its effort on its own domain, not on reinventing request handling. A solo engineer with agents needs the rules to live in code and CI, because an agent follows what the tests and lint enforce far more reliably than prose. The existing violations are few and one of them leaks personal data, so fixing them now costs less than tracking them.

Building tenant scoping and idempotency ahead of their first real tables is deliberate. Both are hard to retrofit (spec 0005 says so for tenancy; idempotency gets bolted on badly after the first double charge), and both can be proven honestly against CI's Postgres with a probe table and a non superuser role. The wrappers are factories with injected parts (context resolver, idempotency store, error mappers) so `@aft/core` depends on nothing above it, the package graph stays one way, and the `org` mode can be finished by feature 29 without touching the wrappers.

The design keeps operational weight low on purpose: no new service, one dependency (`pino`, already chosen by spec 0005), one table, one optional variable. The cost is a heavier CI `test` job and database tests that only run where a disposable Postgres exists; that is accepted because the alternative (Docker or an in process Postgres whose row level security behaviour might differ from production) either breaks the no Docker rule or weakens the proof.

### Choices made in the design conversation

Each was asked as its own question with a recommended pick; the engineer took the recommendation every time. Runner up in brackets.

| Choice | Picked | Runner up |
|---|---|---|
| Package home | new `@aft/core` plus database helpers in `@aft/db` | several small packages |
| Tenant scoping scope | build all now, prove on a test table | helpers now, row level security with feature 29 |
| Logging split | logger here, export in feature 22 | standard only |
| API style | server actions for the UI, `/api/v1` route handlers for machines | route handlers only; a typed RPC library |
| Error type | one `AppError` with a closed code list | a class per kind; result values |
| HTTP error body | RFC 9457 problem details | custom envelope |
| Action wrapper | own small wrapper | `next-safe-action` |
| Action failure | return `{ ok, data or error }` | throw to the error boundary |
| Crash text | generic, real text in development | generic everywhere |
| Request id | made by the app | accept a valid incoming one; made by Caddy |
| Log redaction | secrets and personal data | secrets only |
| Log level | optional `LOG_LEVEL` | fixed per tier |
| Unknown keys | reject, 400 | strip |
| Body limit | 100 KB, routes may go to 1 MB | 1 MB |
| Text fields | shared `text({ max })` builder | plain zod per field |
| Body format | JSON only | JSON and forms |
| Idempotency coverage | all API writes plus risky actions | every mutation; only where a spec says |
| Key reuse with other input | 422 | replay the first |
| Key in flight | 409 with `Retry-After` | wait for the first |
| Keep results | 24 hours | 7 days; 1 hour |
| What is saved | success and expected errors | everything |
| Key owner | caller (user or API key) plus workspace plus route (changed after the cross check; was workspace or user) | global |
| Stuck claim | none: one transaction with an advisory lock, a crash frees the key at once (changed after the cross check; was a 60 second takeover) | keep the claim row design |
| Cleanup | lazy now, feature 24's job required before go live, account deletion purges (tightened after the cross check) | delete on each write |
| Owner columns | `ownerKind` (`user`, `api_key`), `ownerId`, `organizationId` (`""` when none) | three nullable foreign keys |
| Saved reply | status plus JSON, 64 KB cap | no cap; status plus resource id |
| Test table | made by the test | a real migration |
| Row level security guard | catalog test in CI | review |
| Database naming | camelCase columns, snake_case tables | snake_case everywhere |
| Ids | UUID v7 | `cuid()`; cuid2 |
| Timestamps | `timestamptz(3)` | Prisma default `timestamp(3)` |
| Time library | `Intl` plus UTC math | date-fns with `@date-fns/tz`; Temporal polyfill |
| Money type | integer `number` with a safe integer guard | `bigint`; dinero.js |
| Currencies | `usd` only, list extendable | any ISO 4217 code |
| Rounding | always explicit | half even by default |
| Untrusted content | parse and fence | parse only |
| Workspace source | session's active workspace | in the URL path |
| JSON case | camelCase | snake_case |
| Pagination | cursor | offset |
| Success shape | bare resource, lists in `data` | always `{ data }` |
| Session cookies on `/api/v1` | allowed with an Origin check | API keys only |
| Roles | optional `authorize` hook | handlers check |
| Action size | 100 KB app wide | 1 MB plus a wrapper check |
| Key hook | `@aft/ui` | `@aft/core/react` |
| Database tests | CI Postgres, skipped locally without `TEST_DATABASE_URL` | PGlite; Testcontainers |
| `console` rule | ban in server code, fix existing | warn; none |
| Wrapper use | contract test | review |
| Raw Prisma | repositories only | no restriction |
| Thread proof | test fixtures | a shipped `/api/v1/ping` |
| Access log | one line per call | errors only |
| Row level security bypass | refuse in production, warn in development (added after the cross check) | review only |
| pino Agent Skill | `oakoss/agent-skills@pino-logging` installed | `andrelandgraf/fullstackrecipes@logging-best-practices` |

### Decisions made while writing (not asked)

- **Wrappers as factories in `@aft/core/server`**, wired once per app in `lib/server.ts`. Why: `@aft/auth` will import the logger from `@aft/core`, so `@aft/core` importing `@aft/auth` would make a cycle. Runner up: a new `@aft/server` package that imports core, db, and auth.
- **`type: "about:blank"` in problem replies**, with the AFT `code` member carrying the meaning. Why: no public error docs exist yet to point a URI at. Runner up: one URI per code once feature 75 publishes API docs.
- **`Idempotent-Replayed: true` header** on replays (the name Stripe uses). Runner up: no header.
- **An over 64 KB reply in production is sent but not saved**, with an `error` log. Why: refusing a reply the handler already committed would be worse. Runner up: fail in every tier.
- **Interactive transaction limits of 20 seconds and 5 seconds wait**, for every `user` and `org` call. Why: anything slower belongs in a workflow (X5). Runner up: Prisma's 5 second default, too tight for a handler plus its saved reply.
- **Redaction one level deep plus "never log whole objects"**, because pino redaction paths must be named in advance. Runner up: a deep scrubbing serializer, which costs time on every line.
- **`LOG_LEVEL` in `@aft/core/env` as `logEnvSlice` and `logEnv()`**, because `@aft/config/env` already exports a `coreEnv`. Runner up: put it in `@aft/config/env` next to `AFT_ENV`.
- **No `pino-pretty` and no transports.** Why: transports run in worker threads that fight Next.js bundling, and JSON in the terminal is readable enough. Runner up: `pino-pretty` piped by hand when wanted.
- **Strict object schemas everywhere, including query strings.** Runner up: lenient queries, which would hide misspelled filters.
- **Prisma `P2003` (foreign key) maps to `conflict`.** Runner up: `validation_failed`, which is right for some creates but wrong for deletes blocked by children.

## Changed after the cross check

A read only Sonnet review of the first draft found 34 gaps and 13 soundness notes. The engineer decided four that changed earlier answers:

- **Idempotency in one transaction with an advisory lock**, replacing the separate claim row, the 60 second takeover, and the `state`, `lockToken`, and `lockedAt` fields. The first design used three connections per request against a pool of 5 (a deadlock risk), and let a takeover run alongside a late original. Cost: a repeat with other input while the first runs gets 409 instead of 422.
- **The caller owns a key, plus the workspace**, because a workspace as owner let one member replay another member's stored reply. `organizationId` is a non null text with `""` for none, since Prisma cannot declare a unique index that treats nulls as equal.
- **Cleanup before go live**: lazy deletion alone meant stored replies (which may hold personal data) never left; feature 24's job now gates feature 148, and account deletion purges.
- **Refuse a login that bypasses row level security** (AC-22, X32): a superuser or `BYPASSRLS` login skips every policy silently.

The rest were filled with recommended answers the engineer accepted as a set: how `forOrg` works (one interactive transaction per call, `OrgDb` without `$transaction`), test roles and schemas, CI steps around the pinned test command, the wrapper's order of checks (auth and Origin before reading the body), the fingerprint basis, which errors are saved and how replays look, redirects in idempotent handlers, exact problem titles, text normalization order, body stream reading, `experimental.serverActions.bodySizeLimit` (checked in the bundled Next 16 docs), a lazily created logger, `name` and `code` taken off the redaction list (they clashed with the access line), Bearer versus cookie calls and Better Auth's `trustedOrigins`, written interfaces, exact untrusted fence and preamble text, money edge rules, the cursor format, a source text contract test, workspace relative ESLint globs, and `transpilePackages`.

## Current state sampled (what the standard replaces)

| File | Pattern today | Under the standard |
|---|---|---|
| `packages/email/src/send.tsx` | `console.log` of the recipient address, the error printed three times | `log.info({ template, messageId })`, `log.error({ err })` once |
| `packages/auth/src/server/auth.ts` | `console.error` with free text, error swallowed | `log.error({ err }, "reset password email failed")` |
| `packages/auth/src/server/auth-otp.ts` | `console.error` plus the A3 dev line | logger for the error; the A3 line stays with a disable comment |
| `apps/web/components/auth/profile.tsx` | `console.log` of whole form data | removed; `console.error` allowed in client folders until feature 23 |
| `packages/config/env/index.ts` | `console.error` for the start check | allowed: it runs before a logger can exist |
| `packages/db/prisma/schema.prisma` | `cuid()` ids, `timestamp(3)` | kept for Better Auth tables; new tables use `uuid(7)` and `timestamptz(3)` |

## New edge cases

For the PLAN.md X catalog:

- **X17** The same idempotency key arrives while the first request is still running, whatever its input → `idempotency_in_progress` (409) with `Retry-After: 1` (spec 0011).
- **X18** The same idempotency key arrives with different input after the first finished → `idempotency_mismatch` (422) (spec 0011).
- **X19** The server dies mid request holding an idempotency key → its transaction rolls back and the advisory lock frees itself, so a retry runs at once (spec 0011).
- **X20** Input carries a key the schema does not know → `validation_failed` (400) naming the key (spec 0011).
- **X21** Text with control characters, broken Unicode, or over its max → `validation_failed`; text is trimmed and NFC normalized first (spec 0011).
- **X22** A body over the cap, with or without `Content-Length` → `payload_too_large` (413) before parsing (spec 0011).
- **X23** A `/api/v1` body that is not JSON → `unsupported_media_type` (415) (spec 0011).
- **X24** A session cookie write to `/api/v1` from another origin, or with no `Origin` → `forbidden` (403) (spec 0011).
- **X25** An insert or update into another workspace trips the row level security check → `not_found` (404), no leak (spec 0011).
- **X26** `redirect()` or `notFound()` thrown inside a wrapped handler → passed through, not logged as an error (spec 0011).
- **X27** Money leaves the safe integer range or mixes currencies → throws; never rounds silently (spec 0011).
- **X28** Model output is too large, not JSON, or has extra keys, or user text tries to close its fence → `model_output_invalid` (502) with no raw text logged; fake fences escaped (spec 0011).
- **X29** A log call passes a secret or personal field → `[redacted]` at the top level and one level down (spec 0011).
- **X30** A new tenant table ships without forced row level security → the CI catalog test fails (spec 0011).
- **X31** An unexpected crash → `internal` with a generic message and the request id; the real message only in development; never a stack trace (spec 0011).
- **X32** The app's database login is a superuser or has `BYPASSRLS`, so every policy is skipped → production refuses scoped calls, development warns (spec 0011).
