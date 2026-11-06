# Review, feat/engineering-standards, 2026-11-06

**Reviewed by**: Sonnet 5.5 (author model not stated)
**Scope**: 98 files, branch vs main (merge base 511d3392). About 45 read closely (every file you listed as risky, plus the ESLint, CI, turbo, email and auth changes). The vendored pino skill, the lockfiles and the docs were skimmed or skipped.
**Verdict**: Changes requested

## Summary
This change adds `@aft/core` (errors, logs, validation, money, time, pagination, untrusted text, and the route and action wrappers), tenant scoping and idempotency in `@aft/db`, a session resolver in `@aft/auth`, and the lint and CI enforcement. The code is careful and follows the spec closely: the lock, replay, mismatch and saved failure flow is correct, the fingerprint does not depend on key order, and I found no blocker. One real gap: `forbidden()` and `unauthorized()` are promised by AC-9 but cannot work in the shipped Next.js config, and a test stub hides that. The rest are small.

## Major
### 🟠 `forbidden()` and `unauthorized()` throw a plain Error in the shipped config, `apps/web/next.config.ts:205`
**Problem**: Next.js 16.4 only allows these two functions when `experimental.authInterrupts` is true. I checked `node_modules/next/dist/client/components/forbidden.js:27` and `unauthorized.js:28`: with the flag off (the default, `config-shared.js:258`) they throw "`forbidden()` is experimental and only allowed to be enabled when `experimental.authInterrupts` is enabled". Your `next.config.ts` sets only `experimental.serverActions`. The spec (AC-9, Exceptions) and the wrappers treat both as supported control flow. The test at `packages/core/src/server/route.auth.test.ts:272-277` gets around this with `vi.stubEnv("__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS", "true")`, so it passes while the real app would not.
**Why it matters**: A handler that follows the spec and calls `forbidden()` gets a normal Error. `controlFlowOf` does not recognise it, so it becomes `internal` (500) with an `error` log line, instead of a 403 from Next.js. The first feature that uses it will hit this, and the green test gives false comfort.
**Suggested fix**: Decide one way. Either turn on `experimental.authInterrupts: true` in `next.config.ts` and add an assertion in `next.config.test.ts` (next to the `bodySizeLimit` one), or say in the spec that handlers must throw `AppError("forbidden")` instead and drop `forbidden()` and `unauthorized()` from AC-9. If you keep the stub in the test, add a comment that it stands in for the config flag, and make the config test the guard.

## Minor
### 🟡 AC-5 wording does not match the code, `packages/core/src/server/route.ts:222`
**Problem**: AC-5 says a `/api/v1` `POST`, `PATCH` or `DELETE` without a valid `Idempotency-Key` gets 400, and that a public route cannot be declared idempotent "(the factory throws at definition)". In the code, routes have no `idempotent` option. `idempotent = auth !== "public" && IDEMPOTENT_METHODS.has(method)`, so a public `POST` quietly skips the key and runs without a transaction, and nothing throws at definition. Only `defineAction` throws (`action.ts:82`). Also `PUT` is in `WRITE_METHODS`, so it gets the Origin check, but it is not in the spec's method list and it is not idempotent, so a retried `PUT` is not deduplicated.
**Why it matters**: The code is sensible (webhooks need a public `POST`). But a reader of the spec expects a throw and a 400 that never happen, and nobody has decided what `PUT` should do.
**Suggested fix**: Change the AC-5 text to say public routes are exempt and only actions throw, and say in one line that `PUT` gets the Origin check but no key. Or make `PUT` require a key. Add a test for the public `POST` case so it stays decided.

### 🟡 Empty `failing paths:` value in the model output error, `packages/core/src/untrusted.ts:19` and `:36`
**Problem**: When `JSON.parse` fails, `invalid(bytes, [""])` is called. The array has one entry, so `paths.length > 0` and the message becomes `... (N bytes; failing paths: )`. The same happens for a root level schema failure (path `""`). `untrusted.test.ts:59` asserts `toContain("failing paths: ")`, which locks the empty value in.
**Why it matters**: The message goes to logs and operators. An empty list reads like a bug, and it does not say whether the text was not JSON or the schema failed at the root.
**Suggested fix**: Map the empty path to a word such as `(root)`, or use a different tail for a parse failure (for example `not valid JSON`). Update the test to check that exact text. Spec AC-16 allows only the size and the failing paths, so a fixed word is fine.

### 🟡 `useIdempotencyKey` throws where `crypto.randomUUID` is missing, `packages/ui/src/hooks/use-idempotency-key.ts:3`
**Problem**: `useState(() => crypto.randomUUID())` runs during render. Browsers only define `randomUUID` in secure contexts (https or localhost). Opening the dev server by LAN address (`http://192.168...`) makes it `undefined`, and the form crashes on render.
**Why it matters**: Any form using the hook breaks in that setup. About hydration, I checked that lead: the initializer runs on the server and again on the client, so the two keys differ, but the key is only read in event handlers and is never rendered into the HTML. So there is no hydration mismatch today. It would become one the day someone puts `key` in a hidden input or in text.
**Suggested fix**: Add one comment line saying the key must not be rendered into markup (send it from the handler only). Optionally fall back to `crypto.getRandomValues` when `randomUUID` is missing.

### 🟡 A replay drops the headers the handler set, `packages/core/src/server/route.ts:289`
**Problem**: Handler headers (`reply.headers`, for example `Location` on a 201) are only applied when the call is not a replay (line 294). The saved reply stores only status and body (`Reply` in `packages/core/src/server/idempotency.ts`), so a replay of the same request comes back without them.
**Why it matters**: A client that retries after a timeout and relies on `Location` or an `ETag` sees a different response than the first one. That defeats the point of a transparent replay.
**Suggested fix**: Either save a small allowed set of headers with the reply and put them back on replay, or document in the spec that handler headers are not replayed, so route authors put what matters in the body.

### 🟡 A cursor id is not checked as a UUID, `packages/core/src/pagination.ts:227`
**Problem**: `cursorShape` accepts any string of 1 to 200 characters as `id`. The spec says ids are UUID v7, and the columns are `@db.Uuid`. A hand made cursor such as `{"id":"x"}` decodes fine, then reaches the repository query and fails in Postgres.
**Why it matters**: The caller sent bad input but gets a 500 `internal` with an error log, not a 400 on `cursor`. Anyone can trigger it.
**Suggested fix**: Validate the decoded id with `z.uuid()` (or let each list route pass its own id schema to `decodeCursor`), so a bad id gives `validation_failed` on `cursor` as AC-17 says.

## Nits
- ⚪ `packages/core/src/server/call.ts:241`, `caller.kind === "user" ? caller.userId : caller.userId` returns the same value both ways. Write `return caller.userId`.
- ⚪ `packages/core/src/server/route.ts:187`, the client's `X-Request-Id` is logged with no length cap. A 16 KB header goes into every access line. Cut it to, say, 128 characters.
- ⚪ `packages/core/src/server/route.ts:294`, a handler header named `X-Request-Id` or `Cache-Control` replaces the wrapper's. Skip those names, or set them after.
- ⚪ `packages/core/src/server/route.ts:123`, `result[key] = ...` on a plain `{}` means `?__proto__=a` is dropped instead of refused by the strict schema. Build the object with `Object.create(null)` or `Object.fromEntries`.
- ⚪ `packages/db/src/idempotency.ts:198`, `responseBody` is `jsonb`, which does not keep key order, so a replayed body has its keys in a different order than the first reply (same data). Fine for JSON clients, but worth a line in the spec so nobody compares bytes. The fingerprint itself does not depend on key order (`canonicalJson` sorts keys, `packages/core/src/server/idempotency.ts:343`), so that lead is not a defect.
- ⚪ `packages/db/src/tenant.ts:125`, `shared ??= import("./index").then(...)` caches a rejected promise forever. If the first import throws, every later call fails until restart. Reset `shared` on rejection, as `bypass` does.

## Strengths
- The idempotency flow is right where it matters: one transaction, `pg_try_advisory_xact_lock` first, a separate short transaction for saved failures that takes the lock again and inserts only if no row exists, control flow never saved, and `handlerFailed` stops lock or mismatch errors from being stored.
- Tenant safety is layered: RLS errors (42501) map to `not_found`, the bypass check runs once and fails closed in production, `OrgDb` has no `$transaction`, and the catalog test checks itself with a probe table.
- Input handling is tight: a byte counted stream read, strict objects, fixed validation texts that never echo input, and an Origin check that fails closed (a bad lookup gives 500 and is retried, with a test).
- `multiplyRatio` and `allocate` use `BigInt`, and I traced the rounding for negatives and ties; they match the spec. The `ci.test.ts` wrapper check tests its own failure cases.
- The `Authorization: Bearer` path cannot be used to skip the Origin check: with no `verifyApiKey` it returns 401 before anything else.

## Test coverage
Coverage is strong for a feature with no real route callers: every wrapper step has tests with real `Request` objects (route, route.auth, route.idempotency, action), the db suites cover tenant, idempotency, errors and the RLS catalog, and money, time, pagination, untrusted, validate, log and errors each have their own tests. X17, the race test, runs only in CI, as agreed. Gaps: the `forbidden()` and `unauthorized()` tests hide the missing config flag behind an env stub (Major above); there is no test for a public `POST` or for `PUT`; the empty `failing paths:` text is asserted as if it were intended; `useIdempotencyKey` has no test for a missing `randomUUID`; a non UUID cursor id is not tested. The missing permanent test through a real route is the known gap you named.
