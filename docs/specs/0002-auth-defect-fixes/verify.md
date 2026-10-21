# Verify: auth defect fixes · spec 0002 · updated 2026-10-21
_Steps derived from spec 0002 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Before any `next start` step, set a real `BETTER_AUTH_SECRET` in `.env` (it is empty locally, and Better Auth refuses the default secret in production mode).

## UI / manual
- [ ] On localhost with `next dev`, open DevTools Network, sign in by email → every auth request goes to `http://localhost:3000/api/auth/...` → AC-1
- [ ] Start the production build with all four OAuth variables blank → `/auth/sign-in` and `/auth/sign-up` show no social buttons and no dashed divider, and the form keeps its gap below the subtitle → AC-4, AC-5
- [ ] Same build, only `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` set → one full width `Github` button on both pages → AC-4
- [ ] Same build, all four set → `Google` and `Github` side by side, no rebuild between these three runs → AC-4, AC-5
- [ ] Same build, `GITHUB_CLIENT_SECRET` blank, then open `/api/auth/get-session` → server log shows `[auth] GITHUB_CLIENT_SECRET is not set, so the github provider is off. Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.` and no key value → AC-2, AC-3
- [ ] Under `next dev`, with `RESEND_API_KEY` blanked, sign up a new user → server log shows `[DEV FALLBACK] OTP for <email>: <code>` and the code verifies the account → AC-6
- [ ] Under `next start`, with `RESEND_API_KEY` blanked, sign up → the server logs the send error and no line contains the code → AC-6
- [ ] Sign up with an email that already exists → the toast shows the error, the browser console shows no `SIGNUP ERROR CONTEXT` line → AC-7
- [ ] Against the dev database: email sign up, OTP verify, sign in, dashboard, sign out, forgot and reset password, Google sign in all work as before → AC-8

## Commands
- [ ] `npm run lint` → zero warnings → AC-8
- [ ] `npm run typecheck` → clean → AC-8
- [ ] `npm test` → all pass, including every `A11:` and `A3:` test → AC-9
- [ ] `npm run build` → `/auth/sign-in` and `/auth/sign-up` listed as `ƒ` (dynamic) → AC-5
- [ ] `npm run build && npm run test:e2e` with no OAuth keys (CI) → 4 smoke tests pass → AC-8
- [ ] `grep -rn "process.env" lib/auth-client.ts components/auth` → no matches → AC-1

## Acceptance-criteria coverage
- AC-1: Network tab step, the grep command
- AC-2: the warning step, `lib/auth-providers.test.ts`
- AC-3: the warning step, `lib/auth-providers.test.ts`
- AC-4: the three button layout steps, the form tests
- AC-5: the three runs on one build, the build listing, the page tests
- AC-6: the two OTP steps, `lib/auth-otp.test.ts`
- AC-7: the duplicate sign up step, the sign up form test
- AC-8: the regression pass, lint, typecheck, e2e
- AC-9: `npm test`
