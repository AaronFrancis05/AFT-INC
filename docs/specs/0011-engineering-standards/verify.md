# Verify: Engineering standards and shared helpers · spec 0011 · updated 2026-10-29
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Database steps need `TEST_DATABASE_URL` pointing at a Postgres you may create roles and schemas on (CI uses `postgres:17`; locally PGlite works for everything but the X17 race). Migrate it first: `DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @aft/db exec prisma migrate deploy`.

## Commands
- [ ] `pnpm check` → typecheck, lint, and format pass in every workspace → AC-18, AC-19
- [ ] `MSYS_NO_PATHCONV=1 pnpm turbo run test //#test:root --force` → every suite passes; the root contract includes the spec 0011 checks → AC-18, AC-20, AC-21
- [ ] `pnpm turbo run test:db --concurrency=2` with `TEST_DATABASE_URL` set → `@aft/db` (tenant, catalog, idempotency, race) and `@aft/app-web` (thread) pass → AC-1, AC-2, AC-3, AC-4, AC-22
- [ ] The same command without `TEST_DATABASE_URL` → prints that the database tests were skipped for each workspace, and passes → AC-20
- [ ] CI run on the branch → six required checks green; the `test` job shows the migrate step, then `test:db` on `postgres:17` → AC-20

## Tenant scope and errors
- [ ] In `packages/db/src/tenant.db.test.ts`, as `aft_app`: no scope set reads zero rows; another workspace's row is invisible; a cross workspace insert is refused; `withOrg` on a transaction scoped to another workspace throws; only `aft_system` inside `withSystem` sees across workspaces → AC-1
- [ ] In `apps/web/lib/server.db.test.ts`: GET, PATCH, and DELETE on another workspace's record reply 404 with a body equal to a missing record's (apart from `requestId`), and the row is unchanged → AC-2
- [ ] An insert into another workspace through a route replies 404 `not_found` (policy refusal 42501), with no `error` log line → AC-2
- [ ] Create a table with an `organizationId` column and no policies in a scratch migration: the catalog test fails naming it; listing it in `rls-allowlist.ts` with a reason makes it pass → AC-3
- [ ] A handler throwing `new Error("secret")` replies 500 `Something went wrong` with no stack; under `AFT_ENV=development` the real message shows → AC-8
- [ ] Prisma `P2025` gives 404, `P2002` and `P2003` give 409, a `maxWait` timeout gives 503 with `Retry-After: 1` → AC-8
- [ ] Production (`AFT_ENV=production`) with a superuser login: every scoped call is `internal` and one `error` line is logged; development logs one `warn` and continues → AC-22

## Idempotency
- [ ] Same key and input twice → one row written, second reply has `Idempotent-Replayed: true` (route) or `replayed: true` (action) and the handler ran once → AC-4
- [ ] Same key, other input → 422 `idempotency_mismatch` → AC-4
- [ ] Two calls with one key at once → one runs, the other gets 409 `idempotency_in_progress` with `Retry-After: 1` (CI only) → AC-4
- [ ] Handler crash, then retry with the same key → the retry runs at once; no row was left → AC-4
- [ ] Handler `conflict` → saved and replayed; a crash or 5xx → never saved → AC-4
- [ ] Two members of one workspace using the same key → both run → AC-4
- [ ] A row past `expiresAt` → treated as absent and replaced → AC-4
- [ ] A reply over 64 KB → throws in test; in production the reply is sent unsaved with an `error` line naming the scope → AC-4
- [ ] Signed in POST, PATCH, DELETE without `Idempotency-Key`, with `""`, a space, or 256 characters → 400; GET ignores it; an idempotent action without a valid `idempotencyKey` → `bad_request`; defining a public idempotent action throws → AC-5

## Input and bodies
- [ ] An unknown key → 400 `validation_failed` with `errors[].path` `extra` (route) or `fieldErrors.extra` (action) → AC-6
- [ ] `text()` refuses a control character, a bidi override (U+202E), and a lone surrogate; `min` and `max` count code points after NFC and trim → AC-6
- [ ] 101 KB body with and without `Content-Length` → 413; `text/plain` → 415; invalid UTF 8 or broken JSON → 400; a leading BOM is accepted → AC-7
- [ ] `apps/web/next.config.ts` has `experimental.serverActions.bodySizeLimit: "100kb"` → AC-7

## Control flow, auth, Origin
- [ ] `redirect()` in a normal call commits its writes and is rethrown, logged as `ok` 307 with no `error` line; `notFound()` logs `not_found` 404 → AC-9
- [ ] `redirect()` in an idempotent call rolls back and throws in test; in production it becomes 500 `internal` → AC-9
- [ ] Session POST with a foreign `Origin`, with `Origin: null`, and with none → 403; from the `BETTER_AUTH_URL` origin → passes; a Bearer call skips the check → AC-10
- [ ] Bearer call with no `verifyApiKey` → 401; no session → 401 (actions return `unauthenticated`, never redirect); `org` mode with no workspace → 404; `authorize` false → 403 before any transaction → AC-11
- [ ] An unauthenticated oversized body → 401, not 413 → AC-11

## Logs
- [ ] With `LOG_LEVEL=info`, a wrapped call writes one JSON line: `level` as a label, ISO `time`, `msg: "request"`, `service`, `env`, `kind`, `route` or `action`, `status`, `result`, `durationMs`, `replayed`, `requestId`, `userId`, `organizationId`; no `pid` or `hostname` → AC-12, AC-13
- [ ] An object with each redacted key (`password`, `email`, `otp`, `cookie`, …) at the top and one level down is logged as `[redacted]` → AC-12
- [ ] `LOG_LEVEL=loud` stops `next start` at the env check → AC-12, AC-21
- [ ] A client `X-Request-Id` appears only as `clientRequestId`; the reply's `X-Request-Id` is a new UUID → AC-13
- [ ] `next dev` with no Resend key: sign up logs a `warn` JSON line naming the label only, then the `[DEV FALLBACK]` OTP line; `next start` never logs the OTP; no log line holds an email address → AC-19

## Domain helpers
- [ ] `allocate(money(4900, "usd"), [1, 1, 1])` → 1634, 1633, 1633; any split adds up to the total, negatives included → AC-14
- [ ] `multiplyRatio` on 5 × 1/2: `halfEven` 2, `halfUp` 3, `floor` 2, `ceil` 3; on −5: −2, −3, −3, −2 → AC-14
- [ ] Unsafe integer, unknown currency, mixed currencies, zero denominator, missing mode → throws → AC-14
- [ ] `instantSchema` refuses `2026-10-29T21:30:00` (no offset); `timeZoneSchema` refuses `Mars/Olympus`; `formatInstant` in `Africa/Kampala` moves 21:30 UTC to the next day → AC-15
- [ ] `IdempotencyRecord` columns are `timestamptz(3)` in the live schema → AC-15
- [ ] `parseModelOutput`: fenced JSON passes; extra keys, 300 KB text, and broken JSON give 502 `model_output_invalid` whose message has only the size and paths → AC-16
- [ ] `fenceUntrusted` with a fake `</untrusted id="…">` inside → escaped; a fresh 16 hex id per call; a bad label throws → AC-16
- [ ] `pageInput`: default limit 20, limit 0 or 101 refused, a bad cursor gives `validation_failed` on `cursor`; `toPage` gives `nextCursor` only when an extra row was fetched → AC-17

## Enforcement
- [ ] Add `console.log("x")` to `apps/web/lib/server.ts` → `pnpm lint` fails; in `components/` only `console.error` passes → AC-18
- [ ] Add `import prisma from "@aft/db"` to `apps/web/lib/server.ts` → lint fails; in a `repositories/` file it passes → AC-18
- [ ] Add `apps/web/app/api/v1/x/route.ts` exporting `async function GET` → `ci.test.ts` fails; with `= defineRoute({ path: "/api/v1/y" })` it fails on the path; a `"use server"` file exporting a plain function fails; two actions sharing a `name` fail → AC-18

## Value sourcing
- [ ] `requestId` is a fresh UUID per call, and the same in the reply header, the problem body, and the log line
- [ ] `ctx.now` is one `Date` per call (two reads in one handler are equal)
- [ ] Caller and `userId` come from `auth.api.getSession({ headers })`: a signed in `next dev` request to a fixture `user` route shows your user id
- [ ] `organizationId` in `org` mode is only set with `findMembership` (feature 29); today `org` mode answers 404 for real traffic
- [ ] `role` is undefined until feature 41
- [ ] Allowed origins: change `BETTER_AUTH_URL` to another host → a write from the old origin gets 403
- [ ] Idempotency owner: a user key and the same key under an API key or another workspace are separate rows
- [ ] `scope` is `"<METHOD> <path>"` for routes and `"action:<name>"` for actions (read the `idempotency_record` rows)
- [ ] `fingerprint` ignores key order and `idempotencyKey`; changes when a value changes
- [ ] `expiresAt` is `ctx.now` plus 24 hours
- [ ] `Retry-After` is 1 on 409 in progress and 503
- [ ] Error `title` and `status` match the spec table for each code
- [ ] Real message only under `AFT_ENV=development`
- [ ] Body cap: a route with `maxBodyBytes: 2000` refuses 2001 bytes; over 1 MB throws at definition
- [ ] Transaction timeout 20 s and wait 5 s (`TRANSACTION_OPTIONS`)
- [ ] Log level: unset gives `debug` in development, `info` in production, `silent` in test; `LOG_LEVEL` overrides
- [ ] `service` is `web` from `lib/server.ts` (`auth`, `email`, `db` from the packages); `env` is `AFT_ENV`
- [ ] Bypass check reads `rolsuper` and `rolbypassrls` for `current_user`, once per client
- [ ] Money minor digits come from `CURRENCIES` (`usd` has 2); rounding mode always from the caller
- [ ] Time zone and locale always from the caller
- [ ] `nextCursor` encodes the last returned row's id
- [ ] Fence id is 8 random bytes as hex
- [ ] Database tests connect only through `TEST_DATABASE_URL`

## Acceptance-criteria coverage
- AC-1 tenant suite · AC-2 thread test and policy insert · AC-3 catalog test · AC-4 idempotency section · AC-5 key rules · AC-6 and AC-7 input and bodies · AC-8 errors · AC-9 control flow · AC-10 Origin · AC-11 auth modes and order · AC-12 and AC-13 logs · AC-14 money · AC-15 time and column types · AC-16 untrusted · AC-17 pagination · AC-18 enforcement · AC-19 logging fixes and A3 · AC-20 CI and skip message · AC-21 `LOG_LEVEL` wiring and the drift contract · AC-22 bypass check
