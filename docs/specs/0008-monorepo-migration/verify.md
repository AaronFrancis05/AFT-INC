# Verify: monorepo migration · spec 0008 · updated 2026-10-27
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Baselines (step 0 test names and count, route table, `npm ls --depth=0`, the seven lockfile versions) belong in the PR description; compare against those. In Git Bash, prefix `//#` turbo tasks with `MSYS_NO_PATHCONV=1`. On Windows, keep the checkout path free of dots (I30).

## UI / manual
Run `next dev` on port 3000 against the dev database (Better Auth rejects any other port). Setting `RESEND_API_KEY=re_invalid_ac5` for that one process keeps real email from going out and makes the OTP print in the dev log.
- [ ] Open `/auth/sign-up`: Google and GitHub buttons both show when all four provider values are set → AC-5 (A11)
- [ ] Restart with `GITHUB_CLIENT_SECRET=` blank: only the Google button shows on `/auth/sign-in` and `/auth/sign-up` → AC-5 (A11)
- [ ] Sign up a new test address → redirect to `/auth/verify-email`; the dev log prints `[DEV FALLBACK] OTP for <email>: <code>` → AC-5 (A3)
- [ ] Enter the code → verify succeeds, lands on `/auth/sign-in` → AC-5
- [ ] Sign in → `/dashboard` loads → AC-5
- [ ] Logout → back on `/auth/sign-in`; opening `/dashboard` no longer shows the dashboard → AC-5
- [ ] `/auth/forgot-password` → code in the dev log → reset on `/auth/reset-password` → old password then fails, new one signs in → AC-5
- [ ] Click Google on `/auth/sign-in` → browser reaches `accounts.google.com` → AC-5
- [ ] Under `next start` (after `next build`), a failed email send prints no OTP line → AC-5 (A3)
- [ ] Compare the dashboard sidebar with `main` at the same viewport (screenshot or side by side): same colors, spacing, and icons → AC-19

## Commands
- [x] `pnpm install --frozen-lockfile` with pnpm 12.15.0 → succeeds; no `package-lock.json` in the repo → AC-1
- [x] `pnpm -r list --depth=0` versus the step 0 `npm ls --depth=0` → every direct dependency at the same version (only the planned removals and additions differ) → AC-1
- [x] `next`, `react`, `react-dom`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, `better-auth` in `pnpm-lock.yaml` → equal the step 0 baseline → AC-1
- [x] `ls apps packages` and the root listing → exactly `apps/web` plus the five packages; no app source at the root → AC-2
- [x] Fresh clone, no `.env`, export only the CI placeholders, `pnpm install` then `pnpm turbo run lint typecheck test build` → all green → AC-3
- [x] `git diff -M100% --stat main -- packages/db/prisma/migrations` → every migration listed as a rename → AC-4 (I18)
- [ ] `pnpm --filter @aft/db exec prisma migrate status` on the dev database → two migrations applied, nothing pending → AC-4
- [x] `git ls-files packages/db/src/generated lib/generated` → nothing tracked → AC-4 (I23)
- [x] `pnpm turbo run test` plus `pnpm test:root` → count not below the baseline (106 at the last run), every baseline `it` name present except the planned `ci.test.ts` renames → AC-5
- [x] `pnpm --filter @aft/app-web test:e2e` → smoke passes → AC-5
- [x] `pnpm --filter @aft/app-web build` → route table matches the baseline; `/auth/sign-in` and `/auth/sign-up` are `ƒ`; no workspace root or lockfile warning → AC-6, AC-17
- [x] `.github/workflows` → exactly `test`, `typecheck`, `lint`, `prisma`, `build-smoke`, `audit`; no `secrets.`; every checkout has `persist-credentials: false` → AC-7
- [x] `pnpm-workspace.yaml` → `allowBuilds` as the spec lists; `strictDepBuilds` not turned off → AC-8
- [ ] `pnpm audit --prod --audit-level high` → passes; `audit-ci` and `audit-ci.jsonc` gone → AC-9
- [x] `MSYS_NO_PATHCONV=1 pnpm turbo run //#test:root` → `ci.test.ts` passes; deleting a required job from a scratch copy of the workflow makes it fail → AC-10
- [x] A throwaway import of `@aft/auth/src/server/auth` in `apps/web` → `lint` fails; `git grep -n '"@/' -- packages` → empty → AC-11
- [x] A throwaway `'use client'` file importing `@aft/db` or `@aft/auth/providers` → `next build` fails; an `import type` only version passes → AC-12 (I20)
- [x] `pnpm dev` from the root and from `apps/web` → both read the root `.env` → AC-13
- [x] Change one `globalEnv` variable in the shell, then one byte of `.env` → each misses the `build` cache → AC-14 (I22)
- [x] `pnpm why react -r` → one version → AC-15 (I25)
- [x] From `packages/ui`: `pnpm exec shadcn add accordion` → only `src/components/accordion.tsx`, `packages/ui/package.json`, and `pnpm-lock.yaml` change, nothing outside the repo; lint fails on the raw `from "cn"`; after the post add rewrite and `pnpm --filter @aft/ui remove cn`, lint and typecheck pass and `pnpm why cn -r` shows `cn` only under `shadcn`. Then discard (`git checkout`, `git clean`, `pnpm install --frozen-lockfile`) → AC-16 (I29, I30)
- [x] A throwaway `import { cn } from "cn"` in `packages/ui` → `lint` fails → AC-16 (I29)
- [x] An edit inside `packages/auth` → `@aft/app-web#test` misses the cache → AC-3 (`transit` task)
- [x] Built CSS from `next build` → contains a `size-9` rule → AC-19 (I26)

## Value sourcing
- [x] `packageManager` → `pnpm@12.15.0`; root `turbo` → `2.11.10` → AC-1, AC-3
- [x] `turbo.json` `globalEnv` → the nine `.env.example` names plus `NODE_ENV` → AC-14
- [x] CI `build-smoke` placeholders → the same five values as on `main` → AC-3
- [x] Root `shadcn` → `4.22.1`, and `packages/ui/src/lib/utils.ts` → identical to `lib/utils.ts` on `main` → AC-16
- [x] `packages/ui/components.json` `utils` alias → `@aft/ui/lib/utils` → AC-16
- [x] Each config's repo root → computed with `fileURLToPath(import.meta.url)` → AC-13, AC-17

## Acceptance-criteria coverage
- AC-1 install, list, lockfile, value sourcing · AC-2 layout · AC-3 fresh clone, transit · AC-4 renames, migrate status, generated client · AC-5 test parity, e2e, the manual auth steps · AC-6 route table · AC-7 workflow jobs · AC-8 `allowBuilds` · AC-9 audit · AC-10 root contract test · AC-11 deep import, `@/` gate · AC-12 `server-only` build failure · AC-13 root `.env` · AC-14 cache misses · AC-15 one React · AC-16 shadcn add, cn guard · AC-17 build warnings · AC-18 preflight (checked at step 0, recorded in `MEMORY.md` 2026-10-25) · AC-19 `size-9`, sidebar comparison
