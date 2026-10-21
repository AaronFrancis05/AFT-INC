# Review, feat/auth-defect-fixes, 2026-10-21

**Reviewed by**: Sonnet 5.5 (author on another model)
**Scope**: 21 code and test files in scope, branch vs main
**Verdict**: Approve with nits

## Summary
The change moves the OAuth provider decision into one pure helper, uses it for both server registration and the two pages, gates the OTP log on `NODE_ENV === "development"`, removes the `baseURL` and the sign up context log, and updates `.env.example` with the exact spec text. I checked every acceptance criterion against the code and found no blocker or major. The remaining findings are small test robustness points and edge polish.

## Minor
### 🟡 Single provider layout is only tested for Google, `components/auth/sign-in.test.tsx:97`
**Problem**: The one provider case on both forms uses `["google"]` only. The `["github"]` single case (the one proven at runtime) has no unit test.
**Why it matters**: A later change to the label or order table could break the Github only layout and no test would notice.
**Suggested fix**: Make the one provider case run for both `google` and `github` (for example with `it.each`) on both forms.

### 🟡 The "no process.env" check is a plain text search and covers only some client files, `lib/auth-client.test.ts:28`
**Problem**: The test reads `lib/auth-client.ts` and `components/auth/*.tsx` and fails on the raw text `process.env`, even inside a comment. It does not cover other client files such as `components/ui` or `app` client components. AC-1 says no client file of ours reads `process.env`.
**Why it matters**: It can fail on a harmless comment, and it can miss a real read elsewhere in client code. The verify grep covers the same narrow set.
**Suggested fix**: Strip comments before matching, and either widen the file list to every `'use client'` file or state in the test name that it only covers the auth files.

### 🟡 Prototype names pass the provider filter, `components/auth/social-buttons.tsx:134`
**Problem**: `provider in PROVIDER_UI` is true for names like `constructor` or `toString`, because `in` checks the prototype chain. Such a name would pass the filter and then break on `PROVIDER_UI[provider]` (undefined label and icon).
**Why it matters**: Not reachable today, since the list comes from `resolveSocialProviders()` and the type is a closed union. It only matters if a caller ever passes untyped data.
**Suggested fix**: Use `Object.hasOwn(PROVIDER_UI, provider)` instead of `in`.

## Nits
- ⚪ `lib/auth-otp.test.ts:49`, the A3 development test counts OTP arguments with `toHaveLength(1)`, which also passes if the OTP appears in the log line only once by accident of formatting. Fine, but asserting the single call is `console.log` would be tighter.
- ⚪ `lib/auth-providers.ts:48`, `warnMissingSocialProviders` silently skips a name it does not know (`continue`). That is harmless, but a comment saying why would help the next reader.
- ⚪ `lib/auth-client.ts:6`, the indentation of `emailOTPClient()` inside `plugins` is wider than the rest of the repo's style. Optional.

## Strengths
- One resolver feeds both the server config and the page props, so registration and buttons cannot disagree. The "key absent, not undefined" rule and trimmed values are met exactly.
- The OTP gate is a single exact equality check, and the tests spy on all five console levels for `production` and `test`, which is the right way to prove A3.
- The warning never contains a value, the text matches the spec word for word, and there is a test that the value is absent.
- Client files only use `import type` from `lib/auth-providers`, and a test enforces it, so server code cannot leak into the bundle.
- The zero provider case keeps the same gap above the form (`mt-6` on the form), as the spec asked.

## Test coverage
Covered: resolver (all set, half set, whitespace, undefined, order), warning text, `lib/auth.ts` wiring with a mocked Better Auth (registration, warning, OTP sender wiring, email and password settings), the OTP sender for development, production and test, the auth client options, `SocialButtons` (0, 1, 2, unknown, disabled, keyboard), both forms for 0, 1 and 2 providers, the sign up no log case with the toast and form error kept, and both page tests for `force-dynamic` and the env passed as the prop. Runtime proof for AC-1, AC-5 and AC-8 comes from /check verify. Gaps are the minor ones above only.

## Notes
- Expected follow up, not a defect: the AGENTS.md Gotchas lines about `lib/auth-client.ts`, the OTP log and A11 are now stale, and `/sync` should remove them.
- Known and routed: A4 (fake success on a failed send, duplicate email 200) belongs to scope feature 44. `lib/email.tsx` logging the recipient address belongs to feature 22. `components/auth/profile.tsx` logging form data belongs to feature 7.
- Out of scope files on the branch (spec 0003, the DNS csv, scope docs, MEMORY.md) were not reviewed and do not affect this code.
