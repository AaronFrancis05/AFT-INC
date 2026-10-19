# AFT Inc: Progress Memory

This file holds the project's working memory, so any session or teammate can pick up exactly where the last one stopped.

**How to use it**
- Read it at the start of every session, right after [PLAN.md](PLAN.md).
- Append a dated entry to the Session log at the end of every session. Never rewrite old entries.
- Keep **Current position** true. It is the only part you edit in place.
- Feature status (planned, in progress, done) lives in `docs/scope/`, and decisions live in `docs/specs/`. This file points to them and never duplicates them.

## Current position

- **Stage**: PLAN.md Step 1 (planning artifacts, no app code yet)
- **Done**: `/audit` gap-fill of `AGENTS.md`; `/scope` wrote [docs/scope/index.md](docs/scope/index.md) plus 8 epic files (132 features, plus 3 pre-existing items A to C)
- **Spec 0001** ([CI repair and test harness](docs/specs/0001-ci-repair-test-harness.md)) accepted 2026-10-19; scope feature 1 is `in-progress` with its build checklist
- **Next command**: `/develop ci repair and test harness` (feature 1), then `/develop auth defect fixes` (feature 2), then `/architect platform architecture` (feature 3, which becomes spec 0002; spec numbers follow creation order, so the standards spec from feature 7 will be 0003 or later)
- **Needs the engineer before feature 1 can finish**: install the GitHub CLI (`winget install GitHub.cli`) and run `gh auth login` once (build task 9, branch protection)
- **Owed to `/sync`**: copy the build approach (Tracer Bullet) from the scope header into `AGENTS.md` `## Build approach` (still a placeholder)
- **Blockers**: none

## Step 1 checklist

- [x] `/audit`: root `AGENTS.md` filled in (persona, stack, commands, env, rules, git, gotchas)
- [x] `PLAN.md` and `MEMORY.md` created
- [x] `/scope`: `docs/scope/index.md` and the epic files, with edge case IDs on each `Done when`
- [ ] Scope feature 1 (CI repair) and 2 (auth fixes) shipped first, so the pipeline is green
- [ ] `/architect platform architecture` (scope feature 3, spec 0001): monorepo, AWS and EKS, data and tenancy, workflow engine, provider adapters, environments and releases
- [ ] `/architect engineering standards and shared helpers` (scope feature 7, spec 0002): errors, logging, env and secrets, idempotency and outbox, authz and entitlements, API style
- [ ] Engineer confirms 0001 and 0002 (status `Accepted`)

## Decisions log

Locked decisions. Changing one needs an `/architect` supersede and a new line here.

| Date | Decision | Where it is recorded |
|---|---|---|
| 2026-10-18 | Repo becomes a pnpm and Turborepo monorepo | PLAN.md, spec 0001 (pending) |
| 2026-10-18 | AWS with Kubernetes (EKS), GitOps through Argo CD | PLAN.md, spec 0001 (pending) |
| 2026-10-18 | CI/CD covers both the platform and per customer deployments | PLAN.md |
| 2026-10-18 | Stripe Billing for subscriptions, metered usage, invoices | PLAN.md |
| 2026-10-18 | Hosted AI model APIs behind adapters, custom AFT model later | PLAN.md |
| 2026-10-18 | Media: images and 9:16 video first, then 3D GLB with turntable video | PLAN.md |
| 2026-10-18 | LLMs: multi provider from day one (Claude, OpenAI, Gemini) | PLAN.md |
| 2026-10-18 | App Studio v1 includes live multiplayer collaboration | PLAN.md |
| 2026-10-18 | Subscription modes: shared SaaS, dedicated instance, API plus MCP | PLAN.md |
| 2026-10-18 | Workflow tier: Beta by default, GA for auth, orgs, billing, metering, provisioning, infra, CI/CD, MCP | PLAN.md |
| 2026-10-18 | Build approach: Tracer Bullet | PLAN.md, scope header (pending) |
| 2026-10-18 | Edge cases are cataloged up front with IDs (X, A, C, B, D, M, G, S, I) and traced to specs and tests | PLAN.md |
| 2026-10-18 | Every module is split into small features (1 to 3 days), each specced, built, verified, tested, and shipped on its own | docs/scope/index.md |
| 2026-10-18 | Ship rule: merge, staging, then production behind a feature flag (off until the epic is ready) | docs/scope/index.md |
| 2026-10-18 | Solo engineer with AI agents, no fixed deadline, one feature at a time | docs/scope/index.md |
| 2026-10-18 | Go to market in scope: SEO, analytics, WCAG 2.2 AA, legal, multiple languages and currencies | docs/scope/launch.md |
| 2026-10-18 | Legal pages (feature 124) must ship before billing and generation flags turn on in production | docs/scope/launch.md |

## Known defects (fix inside the named scope feature, not ad hoc)

- CI runs `npm test` with no test script (feature 1)
- `lib/auth-client.ts` reads a server env var in the browser (feature 1)
- OTP printed to the console in every environment, edge case A3 (feature 1 or 10)
- Social providers registered with empty secrets, edge case A11 (feature 1)
- Placeholder branding and mock dashboard data (features 10 and 17)

## Session log

### 2026-10-18
- Read the whole codebase (brownfield Next.js 16.2 app: auth built, catalog and dashboard mocked).
- Asked and locked 12 product and architecture decisions with the engineer (see Decisions log).
- Wrote and got approval for the plan, including the full edge case catalog. Saved as PLAN.md.
- Ran `/audit` (gap-fill): filled in root `AGENTS.md`, added the agent persona. No nested `AGENTS.md` yet, because feature 2 (monorepo migration) moves every area; write them per workspace after the move.
- Ran `/scope` (brownfield plan, epic split). Engineer asked that every module be broken into small features that are developed, tested, and deployed on their own. Result: 132 features across 8 epics; platform CI/CD alone is 12 features (10 to 21), customer CI/CD 15 (38, 39, 62 to 74), App Studio 20 (99 to 118). Each `Done when` names its edge case IDs, and every catalog ID is owned by at least one feature.
- Stopped after `/scope`. Next command: `/architect ci repair and test harness`.

### 2026-10-19
- Ran `/architect ci repair and test harness` and wrote spec 0001. Baseline measured: typecheck clean; lint 4 errors and 16 warnings; 3 critical and 29 high runtime advisories (`next`, `better-auth`, plus the `shadcn` CLI misplaced in dependencies); npm 11.19 blocks install scripts; the generated Prisma client is committed with CRLF line endings.
- Engineer's choices: Vitest and Testing Library; six blocking gates (lint, typecheck, test, prisma, audit, build-smoke); coverage reported with no threshold; Node 24 only; tests next to the code; audit fails on high or worse in runtime deps; vulnerabilities and lint fixed in this feature; CI on pull requests, pushes to main, and manual runs; main protected, linear history, squash merges only.
- A cross check on another model found 12 gaps and an ordering problem; all fixes applied (npm pinning, install script approvals, LF normalization, console error detection, an empty Postgres service in the smoke job, branch protection by `gh api`, dependency upgrades before lint fixes).
- Machine note: `npm ci` here can fail on network hiccups; retry with `--fetch-retries=5`. ESLint is slow because it walks `lib/generated` (spec 0001 adds the ignore).
- Next command: `/develop ci repair and test harness`.
- `/develop ci repair and test harness` started on branch `feat/ci-repair-test-harness` (spec 0001 now `In Progress`). Done: build task 1 (Node/npm pinned, install script approvals live in `package.json` `allowScripts` with bare names, `.gitattributes` LF) and task 2 (Vitest 5 harness, 10 passing tests). Version notes: `@vitejs/plugin-react` held at ^5.2 (v6 pulls Babel 8 and clashes with the shadcn CLI), `@types/node` moved to ^24 early because Vitest 5 requires it.
- Bug found by the new test and fixed (`fix(ui)` commit): `components/ui/form.tsx` `FormMessage` never showed field errors, so all 7 auth forms gave no validation feedback.
- Resume at build task 3 (thin CI thread: `ci.yml` with the `test` job, delete `webpack.yml`, open the pull request).
- Side task (engineer request): AWS Agent Toolkit set up and verified. Profile `remwa`, Region `eu-west-1`, classic AWS account `355103369250`. AWS CLI 2.38.1 (installed over a phone hotspot: the home network resets TLS to `awscli.amazonaws.com` only, other AWS endpoints work). `uv` installed. 24 AWS skills in `~/.claude/skills`; `aws-mcp` server in `~/.claude.json` with `AWS_MCP_PROXY_PROFILES=remwa` (backup at `~/.claude.json.bak-before-aws-mcp-profile`). AWS rules added to `AGENTS.md` between markers, with a project note that specs win (the IaC tool is decided in feature 10). Credentials last 12 hours and renew for 90 days without the browser; renew with `aws login --profile remwa`.
- Open risk: the profile signs in as the account **root user**. Create an admin identity (IAM Identity Center) before any real resources; to be covered in the feature 10 spec.
- The production Postgres stays in scope feature 12 (engineer's choice). No AWS resources exist yet.
