# Review, feat/ci-repair-test-harness, 2026-10-20

**Reviewed by**: Claude Sonnet 5.5 (author model not stated)
**Scope**: 52 files, branch vs main (merge base f41a242)
**Verdict**: Approve with nits

## Summary
The branch replaces the broken `webpack.yml` with a six job `ci.yml`, adds Vitest, Testing Library and Playwright, pins the toolchain, fixes the baseline lint errors, upgrades `next`, `better-auth` and `prisma`, and adds the additive `account.idToken` column. The change matches spec 0001 closely: read only token, no `secrets.` reference, no `pull_request_target`, no path filters, job IDs equal names, an empty audit allowlist, and an additive migration that matches the schema and the regenerated client. I found no blockers or majors. The findings are small deviations from the spec text, a few flake risks in the smoke test, and stale project context.

## Minor
### 🟡 Action versions differ from the spec, `.github/workflows/ci.yml:23`
**Problem**: The workflow and the setup action use `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-artifact@v5` (`.github/actions/setup/action.yml:7`). The spec (Decision, workflow settings) names `@v4` for all of them. `actions/cache@v4` matches.
**Why it matters**: Spec and implementation disagree, so the next reader cannot tell which is intended. Newer majors are probably fine, but v5 `setup-node` also turns on package manager cache detection from `packageManager`, which the spec did not account for.
**Suggested fix**: Record the v5 choice in the spec (or in /sync), or move back to v4. Do not leave the two out of step.

### 🟡 The hand written migration is not checked against the schema in CI, `prisma/migrations/20261019200000_add_account_id_token/migration.sql:2`
**Problem**: The `prisma` job only validates the schema and checks the committed client. Nothing proves that the migrations produce the schema. The `idToken` migration was written by hand and there is no local database to apply it to.
**Why it matters**: It looks correct now (`ALTER TABLE "account" ADD COLUMN "idToken" TEXT;` matches `String?`). A later hand written migration could drift and only fail when the first database is created (features 8 and 12), which is late.
**Suggested fix**: Out of scope for this spec, but add a follow-up to run `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` against a shadow database once the Postgres service or feature 8 exists.

### 🟡 Homepage smoke check depends on the network and on an external image host, `e2e/smoke.spec.ts:35`
**Problem**: The homepage test scrolls and waits for `networkidle`, while the page loads remote Unsplash images through `next/image`. Playwright discourages `networkidle`. A slow or failing Unsplash response delays idle or changes which errors appear. The previous failure (a dead photo id) was fixed by swapping the id in `app/page.tsx:138`, which will rot the same way.
**Why it matters**: This is the most likely source of a flaky required check. Retries (two in CI) will mask it, and the gate is required for every PR.
**Suggested fix**: Prefer waiting on specific signals (heading visible, the images `complete`) or intercept `images.unsplash.com` and `/_next/image` with `page.route` so the test does not use the real network. Local assets avoid the problem when feature C5 lands.

### 🟡 Stale project context, `AGENTS.md` (Stack, Commands, Gotchas)
**Problem**: AGENTS.md still says CI pins Node 20, Better Auth 1.5, "No test runner yet", and that `webpack.yml` runs `npm test` with no script. All of this is now false on this branch.
**Why it matters**: Agents read AGENTS.md first, so they would plan around a broken CI that no longer exists.
**Suggested fix**: /sync owns this. Update Stack, Commands (add test, test:coverage, test:e2e, typecheck), and remove the CI gotcha.

## Nits
- ⚪ `.github/actions/setup/action.yml:25`, the install script check matches the exact English phrase "No packages with unreviewed install scripts" from `npm install-scripts ls`. It fails closed when the npm output changes, so a deliberate `packageManager` bump needs a matching edit here and in `ci.test.ts`. Worth a comment in the action.
- ⚪ `ci.test.ts:51`, the `secrets.` substring check would also fail on a comment that mentions the word. The job parsing regex (`name:` on the line directly after the job ID) is brittle against a reordered key. Acceptable for a contract test, but a YAML parser would be sturdier.
- ⚪ `components/ui/form.tsx:47`, every field error now gets `role="alert"`, so several simultaneous errors are all announced. Consider an `aria-live` region or `aria-describedby` wiring when features 27 and 121 fix the label links. Also `components/ui/**` is excluded from coverage (`vitest.config.mts:21`) although this file now holds real logic; it is tested in `form.test.tsx`, but the coverage report will not show it.
- ⚪ `hooks/use-session-storage-value.ts:10`, `window.sessionStorage.getItem` can throw when storage is blocked, and it now throws during render instead of inside an effect. Wrap in try/catch returning null. The no-op `subscribe` is documented and fine for the current same page flows.
- ⚪ `components/auth/reset-password.tsx:105`, the "session expired" screen renders on the server and on first client render (value is null until hydration), so it can flash on every load. This matches the old behavior (state set in an effect) and is not a regression.
- ⚪ `.gitattributes:2`, the binary list lacks `webp`, `pdf`, fonts. `text=auto` detects binary by content, so this is harmless.
- ⚪ `playwright.config.ts:7`, only the `html` reporter is set, so the CI log shows nothing useful on failure unless the artifact is downloaded. Add `["list"]` in CI.

Known and routed elsewhere, not counted: OTP printed to console (A3, `lib/auth.ts:38`), empty social provider secrets (A11, `lib/auth.ts:22`), `lib/auth-client.ts` reading a server env var, unlinked form labels (27/121), and the `sign-up.tsx` error context logging noted by /test for feature 2.

## Strengths
- The workflow honors the I6 invariants: `contents: read`, no secrets, no `pull_request_target`, no path filters, and `ci.test.ts` locks all of that in as a named contract test.
- The `set-state-in-effect` fixes are done by deriving state (`canResend = countdown === 0`, `useSyncExternalStore`) instead of disabling the rule, and `verify-email.test.tsx` covers the resend timer behavior thoroughly (start, tick, stop at zero, restart, failed resend, no stored email).
- `useIsMobile` and `useSessionStorageValue` are tested for SSR snapshot, cleanup and breakpoint changes.
- The schema change is minimal, additive and consistent across migration, schema and the regenerated client; the `.gitattributes` LF normalization makes the Prisma drift gate deterministic across platforms.
- `audit-ci.jsonc` starts with an empty allowlist, with the allowlist policy written in the comment.

## Test coverage
Configured (Vitest and Testing Library, Playwright). New logic is covered: `lib/auth-schemas.ts` (password rules, mismatch, OTP length), `sign-in`, `sign-up`, `verify-email`, `reset-password`, `FormField`/`FormMessage`, both new hooks, and the CI contract in `ci.test.ts`. The four Playwright smoke tests cover AC-7. Gaps: no automated check that migrations reproduce the schema (see Minor), and the failing path of the CI gates (throwaway failing test, lint, stale client) is verified by hand per the spec, not in code, which is acceptable.
