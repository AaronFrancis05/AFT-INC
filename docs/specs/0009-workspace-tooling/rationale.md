# 0009. Workspace tooling: rationale

Part of [0009](index.md). `/develop` reads `index.md`; this file records why.

## Context

The monorepo (spec 0008) already runs `lint` and `typecheck` in every workspace through Turborepo, from a shared ESLint flat config and tsconfig bases in `@aft/config`, and CI gates both. What it lacks is a formatter, so style drifts by author and by tool. Today 68 TypeScript files use double quotes and 15 use single, 52 end statements with semicolons and 34 don't, and 180 lines run past 100 characters. Every diff mixes real changes with layout changes, and shadcn writes its own style on each `add`.

Nothing runs before a commit, so lint and type problems are first found by CI, minutes after a push. Spec 0001 asked for local hooks for exactly this reason. The engineer works alone with AI agents, on Windows 11 (Git Bash, PowerShell, and VS Code's git), and several agent sessions can share the checkout. Any hook must work in all three git clients, must not slow commits so much that it gets skipped, and must not change the lockfile in the middle of a commit (pnpm reinstalls when a manifest drifts, per `AGENTS.md`).

The shared TypeScript base sets `strict` only. Array and record lookups are typed as always present, and an un-awaited promise (an auth call, a database write, an email send) passes lint silently. Both classes of bug get more expensive once the workflow engine, billing, and delivery code land. Measured on 2026-10-28, `noUncheckedIndexedAccess` raises 15 errors across the repo, and the full strictest set raises 43.

Two repo facts constrain the rollout. `main` allows only squash merges and requires linear history, and specs, scope, PLAN.md, and MEMORY.md are markdown files written by skills, with hand aligned tables.

## Options considered

### Option 1: Prettier, Husky, and lint-staged on today's Turborepo tasks

Prettier owns formatting, with the official Tailwind plugin. Husky installs the git hook and lint-staged runs ESLint fixes and Prettier on staged files. A root `pnpm check` composes the existing tasks with new format check tasks.

**Pros**:
- The default pairing in the Next.js and shadcn ecosystem, with well known failure modes and docs.
- The Tailwind plugin sorts classes in the order Tailwind v4 applies them, including inside `cn()` and `cva()`.
- Husky has no dependencies and installs through the root `prepare` script, so no `allowBuilds` entry is needed (I21).
- lint-staged handles partly staged files safely (I33).

**Cons**:
- Prettier is slower than the Rust formatters (seconds, not milliseconds, at this size).
- Three new dev dependencies plus a plugin, and two small helper scripts so ESLint runs per workspace from the hook.

### Option 2: Biome as the formatter, Lefthook for hooks

Biome formats (and could lint) from one Rust binary. Lefthook runs hooks from one YAML file, with parallel jobs and its own staged file filter.

**Pros**:
- Much faster formatting, and one binary for hooks.
- Lefthook's `stage_fixed` and globs replace lint-staged.

**Cons**:
- Biome's Tailwind class sorting is a lint rule, not part of formatting, and it adds a second config language beside ESLint, which stays for the Next rules and the import boundary rule.
- Lefthook's npm package ships a postinstall script, which needs an `allowBuilds` approval and review on each upgrade.
- Mostly Prettier compatible, but not fully, so shadcn output would still be rewritten on each `add`.

### Option 3: oxfmt with simple-git-hooks

The Oxc formatter, built to match Prettier, with the smallest hook installer.

**Pros**:
- Fastest option, and its output is close to Prettier's.

**Cons**:
- Young and still before 1.0 as far as known on 2026-10-28, with plugin gaps.
- simple-git-hooks must be rerun by hand after each hook change, which is easy to forget.

### Option 4: CI only formatting, no hooks

Add `prettier --check` to CI and a `pnpm format` script, with no local hook.

**Pros**:
- Fewest moving parts. Nothing runs on commit.

**Cons**:
- Fails the scope's done bar ("commit hooks block unformatted code").
- Formatting failures show up minutes after a push, the problem this feature exists to fix.

## Rationale

Option 1 wins on the forces that matter here. It is the boring choice for a Next.js, Tailwind v4, and shadcn repo, so shadcn output and the Tailwind plugin line up with no glue. Its speed cost is a few seconds on a repo of about 400 formatted files, which one engineer won't notice. Husky's install path through `prepare` avoids the `allowBuilds` review that Lefthook would need, and lint-staged is the most proven way to handle partly staged files on Windows.

The smaller calls follow the same forces.
- **Prettier defaults with printWidth 100.** These match most of today's files and shadcn's output, so the reformat is smallest. Width 100 wraps less of the existing JSX than 80 does.
- **Markdown excluded.** Skills write it, and reformatting their tables on every write would make noise in every docs diff.
- **Report only `pnpm check`.** It behaves exactly like CI, so a green local run means a green CI run for these gates.
- **Format step inside the `lint` job.** The six required check names, and so branch protection, stay the same.
- **No push hook, no commit message hook, no tests in hooks.** Each one costs friction on every push or commit for little lasting value. PRs are squash merged, so the PR title becomes the commit on `main`. CI already runs every test, and Vitest worker start is the I32 risk.
- **Stricter flags limited to the three cheap ones.** `noUncheckedIndexedAccess` catches the most real bugs per error to fix (15). `exactOptionalPropertyTypes` often clashes with library types such as Better Auth and react-hook-form.
- **Only the two promise rules, not all of `recommendedTypeChecked`.** They target the bug class (un-awaited side effects) that the coming workflow and billing code makes costly. `checksVoidReturn.attributes` is off because `onSubmit={form.handleSubmit(...)}` is the standard react-hook-form pattern and is safe.
- **Two PRs.** This is the only way a pure formatting commit survives on a squash only `main`, so blame can skip it without also hiding the real type and lint fixes.

### Calls made by the architect (RECOMMEND items)

- **Prettier config at the root, not in `@aft/config`.** Prettier runs once for the whole repo from the root, and a config re exported from a package would resolve its plugin from the wrong folder. Runner up: an `@aft/config/prettier` export re exported by the root (spec 0008's follow up guessed this; nothing else would use it).
- **ESLint runs before Prettier in the hook.** You picked "Prettier write, then ESLint fix", but an ESLint fix can leave a line unformatted (I39). Running Prettier last guarantees the committed file passes the CI format check. The content of the hook is the same as your pick; only the order changes. Runner up: Prettier first, which can fail CI after a lint fix.
- **ESLint from the hook through a small per workspace helper.** Each workspace has its own `eslint.config.mjs`, and ESLint 9 finds config from the folder it runs in. The helper runs each workspace's own binary with that folder as `cwd`, through `node` (no shell, so Windows `.cmd` shims and pnpm's reinstall never matter). Runner up: ESLint's `v10_config_lookup_from_file` flag from the root. That flag needs ESLint at the root, and it is untested here with `eslint-config-next`'s folder based settings.
- **`eslint-config-prettier/flat` last in the shared config.** It turns off any ESLint style rule that would fight Prettier. Runner up: none; without it, a future rule could make lint and format disagree.
- **`tsconfigRootDir: process.cwd()` for typed linting.** Every runner (Turborepo scripts, the hook helper, VS Code with `eslint.workingDirectories` auto) starts ESLint in the workspace folder, so the shared config needs no per workspace argument. Runner up: turn the shared config into a function that takes `import.meta.dirname`, which changes all six `eslint.config.mjs` files.
- **`//#format:root:check` is not cached.** A root task hashes only root files by default, so a cached result could replay a pass after an `apps/` change. Prettier takes a few seconds, so correctness wins over listing every input glob. Runner up: cache with explicit `apps/**` and `packages/**` inputs, as `//#test:root` does.
- **`@aft/config` gets a tsconfig and a `typecheck` script.** Typed linting needs every linted TypeScript file inside a project (I41), and the done bar says every workspace typechecks. Runner up: `allowDefaultProject` for its two files, which hides the same problem later.
- **Exact pins for root only tools, not the catalog.** The catalog holds dependencies used by more than one workspace (`AGENTS.md`). Prettier, Husky, and lint-staged live only at the root, like `turbo`, and `eslint-config-prettier` lives only in `@aft/config`.
