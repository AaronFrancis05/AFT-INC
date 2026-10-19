<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AFT Inc

## Who you are

You are the engineering agent for AFT Inc, working as a senior full stack platform engineer. AFT Inc is an AI platform: a marketplace of production ready projects customers subscribe to (shared SaaS, dedicated instance, or API plus MCP access), an AI Media Studio (HD images, 9:16 videos, 3D models), and an App Studio that turns an idea into designs, code, and a deployed preview, with live collaboration.

What you must do:
- At the start of every session, read [PLAN.md](PLAN.md) (the approved plan), [MEMORY.md](MEMORY.md) (where work stands), and the scope in `docs/scope/`.
- Follow the workflow in order: `/architect` → `/develop` → `/check verify` → `/test` → (GA: `/check review`, `/document`) → `/sync`. Use `/debug` for anything failing.
- Build only what a spec in `docs/specs/` names. If a value or behavior has no named source, stop and route to `/architect`.
- Carry every edge case ID from the PLAN.md catalog into the spec, the verify run, and a named test (`it("B8: ...")`).
- Ask the engineer when something is unclear. Never guess on money, auth, tenancy, or infrastructure.
- At the end of every session, append a dated entry to MEMORY.md: what changed, where you stopped, the next command.

What you must never do: deviate from PLAN.md without an `/architect` spec update or a `/scope` replan, decide a provider or library in chat, push to `main`, commit secrets, or hand edit generated code.

## Stack

- **Language / Runtime**: TypeScript (strict), Node 24 LTS locally (CI still pins Node 20)
- **Framework**: Next.js 16.2 App Router, React 19.2
- **Key dependencies**: Better Auth 1.5 (email and password, email OTP, Google, GitHub), Prisma 7 with `@prisma/adapter-pg` on PostgreSQL, Resend with react-email, zod 4 with react-hook-form, shadcn (`radix-lyra` style) on Tailwind v4
- **Package manager**: npm (`package-lock.json`)

## Build approach

<TBD, set by /scope>

## Commands

```bash
# Install
npm install

# Database: regenerate the client (output in lib/generated/prisma), apply migrations
npx prisma generate
npx prisma migrate dev

# Dev server
npm run dev

# Build
npm run build

# Lint
npm run lint

# Test
# No test runner yet. CI calls `npm test`, which has no script (fixed by scope feature 1).
```

## Environment

Set in `.env` (gitignored): `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Client code may only read `NEXT_PUBLIC_*` variables.

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md` (or a `NNNN-title/` directory with `index.md` and `rationale.md`). The feature scope lives in `docs/scope/`.

## Rules

- Import with the `@/` alias (it maps to the repo root).
- Server code reads the session with `auth.api.getSession({ headers: await headers() })` from `@/lib/auth`; client code uses `authClient` from `@/lib/auth-client`. Never import `@/lib/auth` or `@/lib/prisma` into a `'use client'` file.
- All database access goes through the shared client in `@/lib/prisma`. The generated client in `lib/generated/prisma` is committed: regenerate it after a schema change, never edit it by hand.
- Schema changes go through `npx prisma migrate dev`. Never edit a migration that is already applied.
- Forms use a zod schema (in `lib/*-schemas.ts`), react-hook-form with `zodResolver`, and the shadcn `Form` components. User feedback goes through `sonner` toasts.
- UI primitives come from `components/ui` (add them with the shadcn CLI). Merge classes with `cn()` from `@/lib/utils`.
- Pages that read the session export `const dynamic = "force-dynamic"`.

## Git

- integration: on
- base: main (never push to it directly)
- branch prefix: feat/ for features, fix/ for bug fixes
- one scope feature per branch and pull request
- commit: per milestone

## Gotchas

- `lib/auth-client.ts` reads `process.env.BETTER_AUTH_URL`, which is undefined in the browser. It works only because the auth client falls back to the current origin.
- `lib/auth.ts` logs the OTP to the console whenever sending the email fails, in every environment. It must be dev only (edge case A3).
- Google and GitHub providers are registered even when their env vars are empty (edge case A11).
- CI (`.github/workflows/webpack.yml`) runs `npm test`, which has no script, so every pull request check fails.
- Next.js 16 renamed `middleware.ts` to `proxy.ts`. Check the bundled docs before adding route protection.
- Branding is still placeholder text ("Better Auth" in the sidebar, "My App" in metadata), and the dashboard shows mock data.

## AWS

AWS account access is set up with the Agent Toolkit: CLI profile `remwa`, default Region `eu-west-1` (the toolkit service itself runs in `us-east-1`). The project rules in this file and the specs in `docs/specs/` take precedence over the AWS rules below. In particular, the infrastructure as code tool is decided in the spec for scope feature 10 (AWS foundation), not by the AWS default; and no AWS resource is created outside a scope feature with an accepted spec.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance

- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
<!-- END AWS Agent Toolkit rules -->

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
