# 0002. Fix the four known auth defects

**Date**: 2026-10-21
**Status**: Accepted

## Summary

This spec fixes four small but real auth bugs before anything else is built on top of auth. The browser auth client stops reading a server only setting and simply talks to the site it was loaded from. Google and GitHub sign in turn on only when both of their keys are set, and the sign in and sign up pages show only the buttons that work. The one time code (OTP) is printed to the console only in local development, and the sign up form stops logging error details that can include the password.

## Requirements

**User stories**:
- As a visitor, I want to see only the sign in options that actually work, so that I never click a Google or GitHub button that fails.
- As the operator, I want the same build to work on localhost, previews, and `remwa.tech`, so that I never rebuild just to change the domain or the OAuth keys.
- As the operator, I want no working OTP or password to ever reach a production log or a browser console, so that log access never becomes account access.

**Acceptance criteria**:
- **AC-1**: our code passes no `baseURL` to `createAuthClient` in `lib/auth-client.ts`, and no file of ours in the client reads `process.env`. In the browser every auth request goes to `<window.location.origin>/api/auth`. (Better Auth itself still checks a few env names first, such as `NEXT_PUBLIC_BETTER_AUTH_URL`. We set none of them, and setting one later would still be honored.)
- **AC-2** (A11): a social provider is registered in `lib/auth.ts` only when both its client ID and its client secret are non empty after trimming whitespace (`undefined` counts as empty). Otherwise its key is absent from `socialProviders` entirely (not present as `undefined`, and no empty string registration). A registered provider receives the trimmed values, so a trailing newline in a stored secret does not break OAuth.
- **AC-3** (A11): when exactly one of a provider's two variables is set, that provider stays off, and the server logs one `console.warn` per module load for the empty variable, with exactly this text: `[auth] <MISSING_VAR> is not set, so the <provider> provider is off. Set both <ID_VAR> and <SECRET_VAR> to enable it.` (for example `[auth] GITHUB_CLIENT_SECRET is not set, so the github provider is off. Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.`). It never includes any value. It may repeat during `next build` (several workers) and after dev reloads; that is accepted. When both are empty, nothing is logged (off is a valid choice).
- **AC-4** (A11): the sign in and sign up pages show a social button only for registered providers. With 0 providers there are no buttons and no dashed divider, only the email form, with the same gap above the form as today. With 1 there is a single full width button. With 2 the layout is today's two column grid. Labels stay exactly `Google` and `Github`, with today's icons. Both pages behave the same.
- **AC-5**: both pages read the provider list on every request (`export const dynamic = "force-dynamic"`). A build made with no OAuth keys, started with keys set, shows the buttons without a rebuild.
- **AC-6** (A3): the OTP fallback line is printed only when `process.env.NODE_ENV === "development"` (that is, `next dev`). Under `production` (`next build`, `next start`, CI, AWS) and `test` (Vitest) the OTP is never printed. The send error itself is still logged with `console.error` in every environment, without the OTP. (`lib/email.tsx` also logs its own Resend error, message, stack, and the recipient address. None of those contain the OTP, and that file is not changed here; feature 22 owns its logging.)
- **AC-7**: a failed sign up no longer calls `console.log` with the error context. The form error and the toast still show `ctx.error.message` (or `"Signup failed"`) exactly as today.
- **AC-8**: nothing else changes. Email sign up, OTP verify, sign in, sign out, password reset, and Google sign in still work on localhost against the dev database. The four e2e smoke tests stay green with no OAuth keys in CI.
- **AC-9**: the edge case rules have named tests: `it("A11: ...")` for registration, the warning text, and button rendering (0, 1, 2 providers) on both forms, and `it("A3: ...")` for the OTP log under `development`, `production`, and `test`. Both pages have a test that they export `dynamic === "force-dynamic"` and pass the provider list from the env.

## Decision

**Chosen options**: base URL Option A (same origin), provider flags Option A (server helper plus prop), OTP gate Option A (`NODE_ENV === "development"`), and delete the sign up context log with no replacement.

The browser auth client uses the page's own origin. One pure server helper decides which social providers are configured (both ID and secret set), and both `lib/auth.ts` and the two auth pages use it. The OTP fallback log runs only under `next dev`. The sign up `console.log` is deleted.

**Implementation skills**: `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `react-testing-library` (`pproenca/dot-skills`, `.claude/skills/react-testing-library/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change.

**Module surface** (no new HTTP endpoints):

| Unit | Kind | Inputs | Outputs | Notes |
|---|---|---|---|---|
| `resolveSocialProviders(env: Record<string, string \| undefined> = process.env)` in `lib/auth-providers.ts` | pure function | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` from `env`, each trimmed | `{ config, enabled, missing }`: `config` is the `socialProviders` object holding only fully configured providers, with trimmed `clientId` and `clientSecret` (an unconfigured provider has no key at all); `enabled` is `SocialProvider[]` in fixed order `["google", "github"]`; `missing` is the names of the empty variables of half configured providers only (both empty adds nothing) | exports `type SocialProvider = "google" \| "github"` |
| `warnMissingSocialProviders(missing, log = console.warn)` in `lib/auth-providers.ts` | pure function | `missing` from above | one `log` call per name, with the AC-3 text | the provider and its pair of variable names are derived from the missing name |
| `lib/auth.ts` | server config | `resolveSocialProviders()` | `socialProviders: config`; calls `warnMissingSocialProviders(missing)` at module load | |
| `sendVerificationOTP({ email, otp })` in `lib/auth-otp.ts` | async function | email, otp | calls `sendVerificationEmail`; on failure `console.error` the caught error, then `console.log` the existing `[DEV FALLBACK] OTP for <email>: <otp>` line only if `process.env.NODE_ENV === "development"` | wired into the `emailOTP` plugin in `lib/auth.ts` |
| `app/(auth)/auth/sign-in/page.tsx`, `.../sign-up/page.tsx` | server components | `resolveSocialProviders().enabled` | `<SignIn socialProviders={enabled} />`, `<SignUp socialProviders={enabled} />` | both `export const dynamic = "force-dynamic"` |
| `SignIn`, `SignUp` | client components | required prop `socialProviders: SocialProvider[]` (via `import type`, no default) | when the list is non empty, one wrapper with `mt-6` holding `<SocialButtons>` and the `<hr className="my-4 border-dashed" />`; when empty, no wrapper, and the form gets `mt-6` so the gap stays | sign up drops the `console.log` |
| `SocialButtons` in `components/auth/social-buttons.tsx` | client component | `providers: SocialProvider[]`, `disabled: boolean`, `onSelect(provider: SocialProvider)` | 0: renders nothing; 1: `grid grid-cols-1 gap-3` with a `w-full` button; 2: `grid grid-cols-2 gap-3` as today | keeps today's `variant="outline"` buttons, labels `Google` and `Github`, icons `Icons.google` and `Icons.gitHub`, in the fixed order |
| `lib/auth-client.ts` | client config | none | `createAuthClient({ plugins: [emailOTPClient()] })` | base URL from the page origin |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Browser auth request | auth server URL | `window.location.origin` + `/api/auth` (Better Auth default) |
| Server registration | which providers exist | `resolveSocialProviders().config`, from the four env vars at process start |
| Page render | which buttons to show | `resolveSocialProviders().enabled`, read per request, passed as a prop |
| Warning | missing variable name | `resolveSocialProviders().missing` |
| OTP fallback | whether to print | `process.env.NODE_ENV` (set by Next) |
| Sign up error UI | message | `ctx.error.message`, else `"Signup failed"` (unchanged) |

**Key invariants**:
- The server registered providers and the buttons on screen always come from the same function call on the same env.
- No OTP is printed unless `NODE_ENV` is exactly `"development"`.
- No client file reads `process.env`, and no client file has a value import of `lib/auth-providers.ts` (type imports only).
- The order of buttons is fixed (Google, then GitHub), whatever order the env lists them in.

**Security model**: no change to who can do what. Secrets stay on the server. The pages receive provider names only. A direct call to sign in with an unregistered provider is rejected by Better Auth (`Provider not found`), and the form's existing `onError` toast covers it. Logs never contain an OTP outside development, and never contain an env var value.

**Configuration required**: no new variables. `BETTER_AUTH_URL` stays, because the server uses it for callback URLs and trusted origins. Without it, Better Auth derives them from the request host and warns, so every deployed environment must set it (secrets delivery, feature 14). New `.env.example` comments, exact text:
- above `BETTER_AUTH_URL`: `# The public base URL of the app. The server uses it for OAuth callbacks and trusted origins.` and `# The browser does not read it: the auth client calls /api/auth on the page's own origin.`
- replace `# Leave empty to disable a provider. Create credentials at:` with `# A provider turns on only when both its ID and its secret are set. Leave both empty to turn it off.` and `# Setting only one logs a warning and keeps the provider off. Create credentials at:`

**Test setup** (for `/develop` and `/test`):
- `lib/auth-providers.test.ts`: plain `env` objects, covering all set, half set, whitespace, and `undefined`. Assert `Object.keys(config)` and the exact warning text through an injected `log` spy.
- `lib/auth-otp.test.ts`: `vi.mock("./email")` (email.tsx builds a Resend client at import), `vi.stubEnv("NODE_ENV", …)` with `vi.unstubAllEnvs()` after each test, and spies on `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug`. The A3 assertion is "no console call of any level has an argument containing the OTP" for `production` and `test`, and "the OTP line was logged" for `development`.
- `sign-in.test.tsx` and `sign-up.test.tsx`: every existing `render(<SignIn />)` and `render(<SignUp />)` passes `socialProviders` (both providers, so the existing social tests keep working). The A11 cases use `getByRole("button", { name: /google/i })` and `/github/i`, `queryByRole` for absence, and `container.querySelector("hr")` for the divider.
- Page tests (`page.test.tsx` beside each page): import the module, assert `dynamic === "force-dynamic"`, call the default export with `vi.stubEnv` keys set, and assert the returned element's `socialProviders` prop.
- `vitest.config.mts`: remove the `BETTER_AUTH_URL` entry and its stale "The auth client reads this at import time" comment, unless a test fails without it. In that case keep it and correct the comment.

**Critical test scenarios**:
- Happy path: env with all four values returns both providers, and both pages render two buttons, verifies **AC-2**, **AC-4**.
- A11 half configured: only `GITHUB_CLIENT_ID` set returns GitHub off with `missing = ["GITHUB_CLIENT_SECRET"]`, and the warning names it without the ID value, verifies **AC-2**, **AC-3**.
- A11 whitespace: `GOOGLE_CLIENT_SECRET="  "` or `undefined` counts as missing, and `" id\n"` reaches `config` as `"id"`, verifies **AC-2**.
- A11 render: `SignIn` and `SignUp` with `[]` render no social button and no divider, with `["github"]` one button, with both two, verifies **AC-4**.
- A3: a failed send with `NODE_ENV` `development` prints the OTP line. With `production` or `test` it calls `console.error`, but no console call of any level contains the OTP, verifies **AC-6**.
- Pages: each page exports `force-dynamic` and passes the env's provider list, verifies **AC-5**.
- Sign up failure: `console.log` is not called, the toast shows the message, verifies **AC-7**.
- Runtime read: the e2e smoke (no keys) shows the forms with no social buttons, and a local `next start` with keys shows them without a rebuild, verifies **AC-5**, **AC-8**.
- Base URL: `lib/auth-client.ts` passes no `baseURL`. Manual: on localhost the Network tab shows auth calls to `http://localhost:3000/api/auth/...`, verifies **AC-1**.

## Build plan

Tracer Bullet: prove the provider path end to end on one page first (env to server registration to page to button), then widen it to the second page, then the independent one line fixes.

1. Add `lib/auth-providers.ts` with `resolveSocialProviders`, `warnMissingSocialProviders`, and `SocialProvider`, plus its `A11:` unit tests (see Test setup), satisfies **AC-2**, **AC-3**, **AC-9**.
2. Use it in `lib/auth.ts` (`socialProviders: config`, then `warnMissingSocialProviders(missing)`), satisfies **AC-2**, **AC-3**.
3. Add `components/auth/social-buttons.tsx`. Give `SignIn` the required `socialProviders` prop, with the wrapper and spacing rule from the module surface, and make `sign-in/page.tsx` dynamic and pass the prop. Update every render in `sign-in.test.tsx`, add the `A11:` render cases, and add the sign in page test. Run the sign in e2e smoke, satisfies **AC-4**, **AC-5**, **AC-9**.
4. Do the same for `SignUp`, `sign-up/page.tsx`, `sign-up.test.tsx`, and the sign up page test. In the same edit, delete the `console.log("SIGNUP ERROR CONTEXT:", ctx)` line and add a test that `console.log` is not called on a failed sign up while the toast still shows the message, satisfies **AC-4**, **AC-5**, **AC-7**, **AC-9**.
5. Move the OTP sender to `lib/auth-otp.ts` with the `NODE_ENV === "development"` gate, wire it into `emailOTP` in `lib/auth.ts`, and add the `A3:` tests (see Test setup), satisfies **AC-6**, **AC-9**.
6. Remove `baseURL` from `lib/auth-client.ts`, and remove the stale `BETTER_AUTH_URL` entry from `vitest.config.mts` (see Test setup), satisfies **AC-1**.
7. Apply the exact `.env.example` comments from Configuration required, satisfies **AC-1**, **AC-2**.
8. Full check: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build && npm run test:e2e` with no OAuth keys. Then a manual pass on localhost against the dev database: email sign up, OTP verify (with a forced send failure under `next dev`, so the OTP line appears), sign in, Google sign in, sign out, and `next start` with keys set showing the buttons, satisfies **AC-5**, **AC-8**.

## Consequences

**Positive**:
- Auth works on any domain feature 3 picks, with no client config to update.
- A half configured provider can no longer show a broken button, and the server says exactly which variable is missing.
- Production logs and browser consoles no longer receive OTPs or sign up request context.

**Negative / tradeoffs**:
- The sign in and sign up pages render on every request instead of being static HTML. This is a small server cost on two light pages.
- Running `next start` locally no longer prints the OTP, so testing a production build locally needs working email.
- A typo in one OAuth variable now quietly turns that provider off (with a warning) instead of failing loudly. Feature 6 can make it fail at startup.
- The warning can show up several times in build output and after dev reloads.
- Nothing stops someone from later setting `NEXT_PUBLIC_BETTER_AUTH_URL`, which Better Auth would honor ahead of the page origin.
- The auth client can't target a different origin without a code change.

**Neutral**:
- No migration and no new dependency. One pull request, and reverting one commit rolls it back.
- The AGENTS.md Gotchas lines for the base URL, A3, and A11 become stale once this ships, and `/sync` removes them.

## Follow-up

- [ ] A4 (a failed email send shows a fake success): scope feature 44, session security.
- [ ] `lib/email.tsx` logs recipient email addresses (PII) on every send: scope feature 22, tracing and structured logs.
- [ ] `components/auth/profile.tsx` logs profile form data with `console.log`: scope feature 7, engineering standards.
- [ ] Feature 6 (typed environment config) may turn the half configured provider warning into a startup failure.
- [ ] SSO with AFT as the OIDC identity provider (PLAN.md, scope feature 38): its own umbrella spec, next `/architect` run.
