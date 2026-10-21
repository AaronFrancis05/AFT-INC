# 0002. Fix the four known auth defects: rationale

The decision record behind [index.md](index.md).

## Context

Scope feature 2 (Foundation epic) exists because the auth code that came with the brownfield app has four defects, recorded in PLAN.md, AGENTS.md (Gotchas), and MEMORY.md. They are small, but every later identity feature (organizations, session security, AFT as an identity provider) builds on this code. Fixing them later means fixing them under more callers.

1. `lib/auth-client.ts` passes `process.env.BETTER_AUTH_URL` as `baseURL`. Next.js only inlines `NEXT_PUBLIC_*` variables into the browser bundle, so in the browser that value is always `undefined`. It works only by accident: Better Auth 1.7's `getBaseURL` (in `node_modules/better-auth/dist/utils/url.mjs`) falls back to `window.location.origin` in the browser, and to `BETTER_AUTH_URL` or `/api/auth` during server rendering. The code reads as if it depends on a variable that it never receives.
2. `lib/auth.ts` registers Google and GitHub with `process.env.X || ""`. Missing keys register a broken provider, and both forms always show both buttons, which fail at the callback (edge case **A11**).
3. `lib/auth.ts` prints `[DEV FALLBACK] OTP for <email>: <otp>` whenever sending the email fails, in every environment. In production that writes a working sign up or password reset code into the logs, which anyone with log access could use (edge case **A3**, existing bug part).
4. `components/auth/sign-up.tsx` runs `console.log("SIGNUP ERROR CONTEXT:", ctx)` on a failed sign up. The better-fetch context can carry the request, so the password can end up in the browser console (found during `/test` on 2026-10-20).

Forces: the app will run as one container image promoted across environments on AWS (scope features 9 to 13). So anything that depends on the environment must be read at runtime, not baked in at build time. The CI `build-smoke` job builds with no OAuth secrets. AGENTS.md forbids client code from reading non `NEXT_PUBLIC_*` variables, and from importing `@/lib/auth` or `@/lib/prisma` into a `'use client'` file. A typed, validated env schema arrives later in scope feature 6, so this fix must not invent its own config framework.

Out of scope, by the engineer's choice: the swallowed email send error (A4, scope feature 44), the recipient email addresses that `lib/email.tsx` logs on every send (scope feature 22, structured logs), the profile form data that `components/auth/profile.tsx` logs (scope feature 7), the rest of A3 (single use, attempt limit, cooldown, scope feature 44), and SSO with AFT as the identity provider (its own spec, next).

## Options considered

### Base URL source

**Option A: same origin client, no `baseURL`.** Delete the line and let Better Auth use the page's origin.
- Pros: zero config, so it works on every host and preview automatically. One image serves every environment, and there is nothing to keep in sync with `BETTER_AUTH_URL`.
- Cons: it can never talk to an auth server on a different origin, so a future cross origin client (a separate API domain) would need a change.

**Option B: `NEXT_PUBLIC_BETTER_AUTH_URL`.**
- Pros: explicit and visible in config.
- Cons: Next inlines it at build time, so one image can't serve two domains. It's a second variable that can drift from `BETTER_AUTH_URL`, and a wrong value breaks every auth call.

**Option C: same origin by default, public variable as an optional override.**
- Pros: flexible for a future cross origin setup.
- Cons: it builds a code path nobody needs yet, and that path keeps Option B's build time baking problem.

### How the pages learn which providers are on

**Option A: a server helper feeds both `auth.ts` and the pages, and each page passes a prop.**
- Pros: one function decides, for the server registration and for the UI alike, so they can't disagree. It's read at runtime, and nothing new reaches the client except provider names.
- Cons: the pages must render per request, which means no static HTML for two light pages.

**Option B: `NEXT_PUBLIC_*` boolean flags.**
- Pros: the pages could stay static.
- Cons: baked at build time (the CI build would ship "no providers" forever), and they can drift from what the server actually registered.

**Option C: the client fetches a runtime endpoint.**
- Pros: the pages stay static and the data stays fresh.
- Cons: a new API route, a loading state, and buttons that pop in after the page loads.

### OTP log gate

**Option A: `NODE_ENV === "development"`.**
- Pros: only `next dev` sets it, so every build, test, and AWS environment fails closed, with no new variable.
- Cons: a developer running `next start` locally loses the fallback and needs real email (Resend already works locally).

**Option B: an explicit opt in variable (for example `AUTH_LOG_OTP`).**
- Pros: fine grained control.
- Cons: one more switch that can be turned on in the wrong environment, which is exactly the leak this fix closes.

**Option C: remove the log.**
- Pros: no OTP is ever printed.
- Cons: local sign up is impossible when the email send fails, for example with no Resend key or offline.

## Rationale

The deciding force is that one image will be promoted across environments on AWS, and that CI builds with no secrets. Anything resolved at build time (a public URL, public provider flags) would be wrong in at least one environment, so both the base URL and the provider list are resolved at runtime: the base URL from the browser's own origin, and the provider list from the server's env on each request. Same origin also removes the dependency on the hosting and domain design that `/architect platform architecture` (feature 3) still owes. Whatever domain it picks, the client follows.

A single helper that returns both the provider config and the enabled list is the smallest way to make "the server registered it" and "the page shows it" the same fact. Two independent checks would drift the first time someone adds a third provider. Counting a provider as configured only when both values are present stops the half configured case, which today produces a button that fails at the OAuth callback. A warning, not a crash, keeps a typo from taking sign in down entirely. Failing fast at startup belongs to the typed env schema in feature 6, which can tighten this later.

For the OTP, failing closed matters more than convenience. `NODE_ENV` is set by Next itself (`development` only under `next dev`), so no operator action can turn the log on in production by mistake. The sign up log has no diagnostic value the toast and server logs don't already give, and it risks a password in the console, so it goes with no replacement.

Small calls made while writing (recommended, the engineer did not weigh in):
- **Extract a shared `SocialButtons` component** (`components/auth/social-buttons.tsx`) used by both forms, so the 0, 1, and 2 layouts live once. Runner up: change both forms inline, which duplicates the layout rule.
- **Extract the OTP sender** into `lib/auth-otp.ts` (exported `sendVerificationOTP`), so the A3 test can import it without loading Prisma. Runner up: mock Prisma and import `lib/auth.ts` in the test.
- **The helper takes `env` as a parameter** (`env: Record<string, string | undefined> = process.env`), so tests pass a plain object instead of mutating the process env. Runner up: `vi.stubEnv` everywhere. The OTP sender reads `process.env.NODE_ENV` directly instead (Next inlines it at build, which is what makes the gate fail closed), so its tests use `vi.stubEnv`.
- **The warning is its own pure function** (`warnMissingSocialProviders(missing, log = console.warn)` in `lib/auth-providers.ts`), so its exact text is testable without loading `lib/auth.ts` and Prisma. `lib/auth.ts` only calls it. Runner up: warn inline in `auth.ts` and leave the text untested.
- **No `globalThis` guard for "once per process".** `lib/auth.ts` is loaded by the auth route, the dashboard layout, and the profile page, and by several build workers, so the warning can repeat. A repeated warning is harmless, and a guard is a workaround that isn't worth its weight. Runner up: a `globalThis` flag.
- **No new e2e assertion for "0 buttons".** Local `npm run start` loads `.env` with real keys, so the assertion would fail there. The unit tests cover the rendering. Runner up: assert it only when `GOOGLE_CLIENT_ID` is unset.
- **No `server-only` package.** The helper returns only provider names to the pages and never secrets, and the forms use `import type`, which is erased at build. Adding a dependency for this is not worth it. Runner up: install `server-only` and mark the helper.
