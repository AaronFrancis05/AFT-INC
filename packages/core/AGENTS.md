# @aft/core

The shared standard from [spec 0011](../../docs/specs/0011-engineering-standards/index.md): errors, logs, validation, money, time, pagination, untrusted model output, and the route and action wrappers.

## Where things are

- `src/errors.ts`: `AppError`, the code to status table, RFC 9457 replies
- `src/log.ts`: `createLogger`, redaction
- `src/validate.ts`: `input()`, `text()`, `parseInput`, `readJsonBody`
- `src/money.ts`, `src/time.ts`, `src/pagination.ts`, `src/untrusted.ts`: one helper set each
- `src/server/`: `createRouteWrapper`, `createActionWrapper`, idempotency, and Next.js control flow (`@aft/core/server`, server only)

## Commands

```bash
pnpm --filter @aft/core test
pnpm --filter @aft/core typecheck
```

## Rules

- Import through the `exports` map only. The app wires the wrappers once, in `apps/web/lib/server.ts`; features use its `defineAction` and `defineRoute`, never the factories.
- This package has no database or auth dependency. The wrappers get them through the store, transaction runner, and resolver interfaces in `src/server/types.ts`; `src/server/fakes.test-support.ts` holds the in memory versions tests use.
- Every wrapper catch checks Next.js control flow first (`controlFlowOf`), so `redirect()` and `notFound()` are never turned into `internal`. Control flow in an idempotent handler is a programming error: return data and let the client navigate.
- `forbidden()` and `unauthorized()` need `experimental.authInterrupts` in `next.config.ts`. A unit test only stubs that flag, so `apps/web/next.config.test.ts` guards the real one.
- Build field errors and other objects keyed by outside input with a `Map`, because a key can be named `__proto__` or `constructor`.
- `src/env.ts` holds rules only, with no `server-only` import, so the env exporter runs it on bare Node.

_Drafted by /sync from the introducing change, worth a quick human pass._
