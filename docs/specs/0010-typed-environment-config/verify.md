# Verify: typed environment config · spec 0010 · updated 2026-10-29
_Steps derived from spec 0010 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Setup: add `AFT_ENV="development"` to your root `.env` first (every existing `.env` lacks it). For the `next start` steps, build once with `pnpm build`. Run the start commands from `apps/web` as `node node_modules/next/dist/bin/next start -p 3105` (or `dev -p 3106`). Inline variables win over `.env`. On Windows an empty variable is deleted and `.env` refills it, so use a wrong value instead of an empty one.

## UI / manual
- [x] `AFT_ENV` unset (remove the line from `.env`) and `DATABASE_URL=mysql://x` inline → `next start` prints `[env] The web app can't start…` with `AFT_ENV` then `DATABASE_URL`, each with its table rule, sorted, exits 1, and `GET /` never answers → AC-1, AC-3 (I46)
- [x] The same bad values under `next dev` → same message, no page served, process exits 1 (build step 1 recorded this on 2026-10-28) → AC-1
- [x] A sentinel such as `DATABASE_URL=mysql://zz-sentinel-zz` and `BETTER_AUTH_SECRET=zz-sentinel-zz` → the message never contains `zz-sentinel` → AC-2 (I49)
- [x] `AFT_ENV=production` under `next dev` → refused with `production needs NODE_ENV=production (use next start, not next dev)` → AC-3 (I47)
- [x] `RESEND_FROM_EMAIL="   "` (spaces) in `.env` → treated as unset: starts in development and sends from `onboarding@resend.dev`; `BETTER_AUTH_URL=" http://localhost:3105 "` → trimmed, sign in works → AC-4 (I48)
- [x] `BETTER_AUTH_SECRET` of 31 characters → `must be at least 32 characters` → AC-5
- [x] `AFT_ENV=production` under `next start` with `BETTER_AUTH_URL=http://localhost:3105` → both `must use https:// in production` cases trigger (http first); with `https://localhost` → `must not point at localhost in production` → AC-5
- [x] `AFT_ENV=production` under `next start` with no `RESEND_API_KEY` and no `RESEND_FROM_EMAIL` → both `required when AFT_ENV is production`; with `RESEND_FROM_EMAIL=onboarding@resend.dev` → `must not use the resend.dev sandbox sender in production`; with `RESEND_API_KEY=sk_x` → `must start with re_` → AC-5, AC-7
- [x] `GOOGLE_CLIENT_ID` set alone → refused under `GOOGLE_CLIENT_SECRET` with `set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither`, in development and production → AC-6 (A12)
- [x] All four OAuth values blank → app starts; `/auth/sign-in` and `/auth/sign-up` show no Google or GitHub button; set one full pair → only that button shows → AC-6 (A11)
- [x] `next dev` with no `RESEND_API_KEY` → sign up with email → console shows `[email] RESEND_API_KEY is not set, so the OTP email was not sent.` then `[DEV FALLBACK] OTP for …`; the code verifies the account → AC-7 (A3)
- [x] `next start` (`AFT_ENV=development`) with no `RESEND_API_KEY` → sign up → the skip warning prints, but no OTP line (A3 holds outside `next dev`) → AC-7
- [x] Valid `.env` with `AFT_ENV=development` → `next start` serves `/` with 200 and prints no `[env]` line → AC-1

## Commands
- [x] `pnpm --filter @aft/config test` → the `B13:` cases pass (`sk_test_`, `rk_test_`, `pk_test_` refused in production and allowed in development; `sk_live_` allowed in production) → AC-8 (B13)
- [x] `pnpm --filter @aft/db test` → `I51:` a missing `DATABASE_URL` fails the import with a names only error; `pnpm --filter @aft/config test` → accessor cases (validates `AFT_ENV` too, no cache) → AC-9 (I51)
- [x] With the CI placeholder values plus `AFT_ENV=test`, `pnpm turbo run build --filter=@aft/app-web --force` → passes with no `[env]` output → AC-10 (I50)
- [x] `pnpm --silent --filter @aft/app-web env:schema` → only JSON on stdout: `"app": "web"`, ten variables sorted by name, `pair` on both halves of each OAuth pair, no value. Then from `apps/web`, run `node scripts/env-schema.mts` with an empty environment (`env -i PATH="$PATH" SYSTEMROOT="$SYSTEMROOT" node scripts/env-schema.mts` in Git Bash) → same JSON, exit 0 → AC-11
- [x] Remove `RESEND_FROM_EMAIL` from a copy of `.env.example` (or add `UNDECLARED=` to it, or drop `AFT_ENV` from `turbo.json` `globalEnv`) → `MSYS_NO_PATHCONV=1 pnpm vitest run` fails the `I52` check; restore → passes → AC-12 (I52, I22)
- [x] Add `export const k = process.env.RESEND_API_KEY;` to any file under `apps/web/components/` → `pnpm --filter @aft/app-web lint` fails with the `@aft/<pkg>/env` message; `process.env.NODE_ENV` passes; the same line in `apps/web/scripts/` passes → AC-13 (I53)
- [x] Push the branch → all six CI checks green; the workflow `env` block has `AFT_ENV: test` and no `secrets.` → AC-14 (I6)

## Value sourcing
- [x] Tier: `.env.example` says `development`; `ci.yml` top `env` says `test`; every Vitest config loads `@aft/config/vitest/env` (or the root's relative path) → run `pnpm test` with no `AFT_ENV` in your shell → passes
- [x] `NODE_ENV`: `next start` reports `production` and accepts `AFT_ENV=production`; `next dev` refuses it (step above)
- [x] `NEXT_RUNTIME` and `NEXT_PHASE`: `apps/web/instrumentation.test.ts` covers the Edge and build skips; the build step above shows no check during `next build`
- [x] Each value from `process.env` via the root `.env`: change `DATABASE_URL` in `.env` only (nothing inline) to `mysql://x` → `next start` refuses it, proving `loadEnvConfig` feeds the check
- [x] App name `web` in the message header and in the exporter's `"app"` → both say `web`
- [x] Rule texts: every message seen above matches the spec's *Variable rules* table word for word
- [x] Descriptions: the exporter's descriptions read as one sentence each, matching `.env.example`
- [x] Sender default: `onboarding@resend.dev` outside production only (Resend steps above)
- [x] Provider buttons: `resolveSocialProviders(authEnv())` (OAuth steps above)

## Acceptance criteria coverage
- AC-1: manual start steps, `instrumentation.test.ts`, `checkEnvOrExit` tests · AC-2: sentinel step, `I49` tests · AC-3: `I46`, `I47` steps and tests · AC-4: trim step, `I48` tests · AC-5: rule steps, `packages/auth/src/env.test.ts`, `packages/email/src/env.test.ts` · AC-6: OAuth steps, `A12` tests · AC-7: Resend steps, `send.test.tsx`, `auth-otp.test.ts` · AC-8: `B13` tests · AC-9: `I51` tests · AC-10: build step, `I50` test · AC-11: exporter steps and `scripts/env-schema.test.ts` · AC-12: drift step and `I52` checks in `ci.test.ts` · AC-13: lint step and the `I53` probes in `eslint.config.test.ts` · AC-14: CI step and the `I6` check in `ci.test.ts`
