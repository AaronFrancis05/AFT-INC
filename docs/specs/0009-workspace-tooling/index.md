# 0009. Workspace tooling: one check command, Prettier, and commit hooks

**Date**: 2026-10-28
**Status**: In Progress

## Summary

This spec adds the missing half of the repo's tooling. Prettier (a code formatter) now owns the layout of every code, config, and CSS file. One root command, `pnpm check`, runs lint, the format check, and typecheck across every workspace. A commit hook (a script git runs before each commit) fixes and formats the staged files, and blocks the commit when something can't be fixed. It also tightens the shared TypeScript and ESLint settings a little, so array lookups and forgotten `await`s get caught.

Scope feature 5 · Beta · build approach Tracer Bullet · two PRs (a format only PR, then the tooling PR), a one off exception to the one PR per feature rule, because `main` allows only squash merges.

## Requirements

**User stories**:
- As the engineer, I want one command that tells me whether lint, formatting, and types are clean everywhere, so that I find out before CI does.
- As the engineer, I want unformatted code to be impossible to commit, so that diffs only ever show real changes.
- As the engineer, I want `git blame` to skip the one time reformat, so that history still points at the commit that really changed a line.

**Acceptance criteria**:
- **AC-1**: Prettier `3.9.10` and `prettier-plugin-tailwindcss` `0.8.1` are exact pins in the root `devDependencies` (root only, so not in the catalog). The root `prettier.config.mjs` is exactly the one in *Config files*. Prettier formats every file type it supports, except what `.prettierignore` lists. Among tracked files on 2026-10-28 that set is `ts`, `tsx`, `jsx`, `js`, `mjs`, `mts`, `json`, `yaml`, `yml`, and `css` (`png`, `svg`, `xml`, `sql`, `toml`, and `prisma` aren't Prettier types). Markdown is never formatted (`**/*.md` in `.prettierignore`). `.prettierignore` is exactly the one in *Config files*, and Prettier also reads `.gitignore` (its default).
- **AC-2**: Before PR 1 starts, `ListAgents`, `git status`, and `git reflog -5` show no other session with work in progress in the checkout, no branch has unmerged work, and no PR is open (I24). PR 1 (`feat/workspace-tooling-format`) contains only: the AC-1 dependencies and the lockfile change they cause, `prettier.config.mjs`, `.prettierignore`, `.editorconfig`, the output of `pnpm exec prettier --write .`, and the smallest fixes a test that reads files as text needs after the reformat (I42). Each such fix keeps the test's meaning and is listed in the PR body. Nothing else is hand edited. After it, `pnpm exec prettier --check .` passes. `git diff --stat main` lists no file under `packages/db/prisma/migrations/` (I18). All six CI checks pass, and the test count and names equal `main` before the PR (I42).
- **AC-3**: PR 2 (`feat/workspace-tooling`) adds `.git-blame-ignore-revs` holding the full 40 character SHA of PR 1's squash commit on `main`, under a comment naming spec 0009. `git blame --ignore-revs-file .git-blame-ignore-revs` on a line that PR 1 reflowed shows a commit from before PR 1. Local git is pointed at the file with `git config blame.ignoreRevsFile .git-blame-ignore-revs` (a one time step, recorded for `/sync` to add to `AGENTS.md`). GitHub reads the file by its name with no setup.
- **AC-4**: The root scripts are exactly the ones in *Scripts and tasks*. `pnpm check` runs `lint`, `typecheck`, and `format:check` in every workspace that has them, plus the root task `//#format:root:check`, and exits nonzero when any of them fails. It never writes a file: `git status --porcelain` is the same before and after a run. It works the same from PowerShell and from Git Bash with no `MSYS_NO_PATHCONV` (the `//#` name lives inside the script, not on the shell line). `pnpm format` writes every Prettier and Prisma fix, after which `pnpm check` passes when lint and types are clean.
- **AC-5**: `@aft/db` has `format`: `prisma format` and `format:check`: `prisma format --check` (the flag is not listed in `--help` in Prisma 7.10.1, but it works and changes nothing; checked 2026-10-28). An unformatted `schema.prisma` fails `pnpm check` and the CI `lint` job. `pnpm format` fixes it.
- **AC-6**: The CI `lint` job gets a second step, `name: Format`, `run: pnpm turbo run format:check //#format:root:check`, after `Lint`. The six required jobs, their names, and branch protection don't change. A file that fails Prettier fails the `lint` check on the PR (I44).
- **AC-7**: Husky `9.1.7` and lint-staged `17.6.0` are exact pins in the root `devDependencies`, with root `"prepare": "husky || true"` (so an install without dev dependencies, such as `pnpm install --prod` in a Docker build, doesn't fail on a missing `husky` binary; I35). After `pnpm install` in a clone, `git config core.hooksPath` prints `.husky/_`. `.husky/pre-commit` is exactly the one line in *Config files*, and it calls no `pnpm`, `npx`, or `pnpm exec` (I34). There is no `pre-push` hook, no `commit-msg` hook, and no test run in any hook.
- **AC-8**: On commit, lint-staged runs on staged files only, with the disjoint globs in *Config files* (I37). Code files get ESLint fixes first, then Prettier (I39). Data and style files get Prettier. `packages/db/prisma/schema.prisma` gets `prisma format`. Fixed files are restaged into the commit. These hold on this Windows machine, from Git Bash and from VS Code's Source Control view:
  - a staged file with bad formatting is committed formatted;
  - a staged file with an ESLint error that `--fix` can't fix blocks the commit and prints the ESLint output;
  - a file staged in part keeps its unstaged lines, unchanged, in the working tree after the commit (I33);
  - a commit that only deletes files passes;
  - `git commit --no-verify` skips the hook, and CI still catches the problem (I44).

  Proof procedure, on a scratch branch: run each case once with `git commit` in Git Bash and once from VS Code's Source Control commit button. After each, record `git show --stat HEAD` (or the refusal text) and `git diff` (for the partial stage case) in `verify.md`. If VS Code's git can't find Node, that is I36: record it and put Node on PATH, never skip the case.
- **AC-9**: `scripts/lint-staged/eslint.mjs` groups the staged files by workspace (the nearest folder under `apps/*` or `packages/*` that holds a `package.json`). It runs that workspace's own ESLint binary (resolved from the workspace, started with `node`, never through a shell) with `cwd` set to the workspace and the arguments `--fix --max-warnings=0 --no-warn-ignored`, and fails if any group fails. A staged file outside every workspace (such as `ci.test.ts`) is formatted but not linted, as today. A staged file that ESLint ignores (generated code, `next-env.d.ts`) does not fail the commit (I38). `scripts/lint-staged/prisma-format.mjs` runs `@aft/db`'s Prisma binary the same way with `format`. `scripts/lint-staged/eslint.test.ts` covers the grouping, run by the root Vitest config.
- **AC-10**: The setup action's `Install dependencies` step sets `env: HUSKY: "0"`, so CI never installs hooks. Running Husky in a folder with no `.git` (a Docker build, a `git archive` export) prints a notice and exits 0, so `pnpm install` doesn't fail there (I35).
- **AC-11**: `packages/config/tsconfig/base.json` adds `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch`, all `true`, and no workspace turns them off. `pnpm typecheck` passes. Today that means fixing about 15 errors (12 in `apps/web`, 2 in `@aft/auth`, 1 in `@aft/db`), following *Fix rules*. `@aft/config` gets a `tsconfig.json` (extends `./tsconfig/library.json`, includes `stubs` and `vitest`, types `node` and `@testing-library/jest-dom/vitest`), a `typecheck` script (`tsc --noEmit`), and `typescript` plus `@types/node` as `catalog:` dev dependencies, so every workspace typechecks.
- **AC-12**: Before turning the promise rules on, run them once and count the findings. If there are more than 25, stop and return to `/architect` with the list, rather than fixing them in bulk. `@aft/config/eslint` adds, in this order, after the existing blocks: a block for `**/*.{ts,tsx,mts,cts}` that turns on typed linting (`parserOptions.projectService: true`, `tsconfigRootDir: process.cwd()`) and sets `@typescript-eslint/no-floating-promises` to `error` and `@typescript-eslint/no-misused-promises` to `["error", { checksVoidReturn: { attributes: false } }]`; then `eslint-config-prettier/flat` last. `eslint-config-prettier` `10.1.8` is an exact pin in `@aft/config` `devDependencies` (build only, I31). No new `typescript-eslint` dependency: the plugin and parser come from `eslint-config-next/typescript`. `pnpm lint` passes with zero warnings, after fixing what the promise rules find (*Fix rules*). Every TypeScript file ESLint lints is included by its workspace `tsconfig.json`; `allowDefaultProject` is never used (I41).
- **AC-13**: The repo commits `.editorconfig`, `.vscode/settings.json`, and `.vscode/extensions.json`, exactly as in *Config files*. With `AFT-INC` opened as the VS Code folder, saving a `.tsx` file in `apps/web` applies ESLint fixes and Prettier formatting with the repo config (I45). Saving a `.md` file changes nothing.
- **AC-14**: `ci.test.ts` gains the checks in *CI contract tests*, and every file they read is added to the `//#test:root` and `//#test:root:coverage` inputs in `turbo.json`.

## Decision

**Chosen option**: Option 1: Prettier, Husky, and lint-staged on top of today's Turborepo tasks.

Add Prettier at the root (printWidth 100, Tailwind class sorting), a root `pnpm check` that composes the existing `lint` and `typecheck` tasks with new format check tasks, Husky plus lint-staged for a `pre-commit` hook that runs ESLint fixes and then Prettier on staged files, a Format step in the CI `lint` job, three stricter compiler flags, and the two promise lint rules. The reformat lands alone in PR 1 so its squash commit can be ignored by blame.

**Implementation skills**: `pnpm` (`.claude/skills/pnpm/`) · `turborepo` (`vercel/turborepo`, `.claude/skills/turborepo/`) · `vitest` (`antfu/skills`, `.claude/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

No data model, API, or state machine: this feature changes only repo tooling, so there is no schema or migration.

### Config files

`prettier.config.mjs` (root):

```js
// Repo wide formatting (spec 0009). Prettier defaults otherwise: double quotes, semicolons,
// trailing commas, 2 spaces.
/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  endOfLine: "lf",
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4 reads its theme from the CSS entry; every app imports this one.
  tailwindStylesheet: "./packages/ui/src/styles/globals.css",
  tailwindFunctions: ["cn", "cva"],
};
```

`.prettierignore` (root; `.gitignore` entries are already ignored):

```
# Written by skills and people as prose; never reformatted (spec 0009).
**/*.md
# Byte exact once applied (I18).
packages/db/prisma/migrations/
# Owned by tools, rewritten on their next run (I40).
pnpm-lock.yaml
skills-lock.json
.claude/
.idea/
docs/.agent-cache/
```

`.editorconfig` (root):

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

`.husky/pre-commit` (one line, no shebang, Husky 9 style):

```sh
./node_modules/.bin/lint-staged
```

`lint-staged.config.mjs` (root). lint-staged adds the staged file paths to each command. Commands in one array run in order; different globs run at the same time, so no file may match two globs:

```js
// Staged files only (spec 0009). No pnpm or npx here: pnpm reinstalls when a manifest drifts (I34).
export default {
  "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}": [
    "node scripts/lint-staged/eslint.mjs",
    "prettier --write --ignore-unknown",
  ],
  "*.{json,jsonc,yaml,yml,css}": "prettier --write --ignore-unknown",
  "packages/db/prisma/schema.prisma": () => "node scripts/lint-staged/prisma-format.mjs",
};
```

`.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "prettier.requireConfig": true,
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[prisma]": { "editor.defaultFormatter": "Prisma.prisma" },
  "[markdown]": { "editor.formatOnSave": false }
}
```

`.vscode/extensions.json`:

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "Prisma.prisma",
    "EditorConfig.EditorConfig"
  ]
}
```

### Scripts and tasks

Root `package.json` scripts (existing ones unchanged):

| Script | Command |
|---|---|
| `check` | `turbo run lint typecheck format:check //#format:root:check --continue` (`--continue` so one run shows every failing check) |
| `format` | `turbo run format //#format:root` |
| `format:root` | `prettier --write .` |
| `format:root:check` | `prettier --check .` |
| `lint:fix` | `turbo run lint:fix` |
| `prepare` | `husky \|\| true` |

Workspace scripts: every workspace with `lint` also gets `lint:fix`: `eslint . --fix --max-warnings=0`. `@aft/db` gets `format` and `format:check` (AC-5). `@aft/config` gets `typecheck` (AC-11).

`turbo.json` new tasks:

| Task | Settings | Why |
|---|---|---|
| `format:check` | `inputs: ["prisma/schema.prisma"]` | Only `@aft/db` has it today. Cached, since the input is one named file. |
| `format` | `cache: false` | Writes files. |
| `lint:fix` | `dependsOn: ["transit"]`, `cache: false` | Writes files. |
| `//#format:root:check` | `cache: false` | A root task hashes only root files by default, so a cached result could miss a change under `apps/` or `packages/`. Prettier checks about 400 files in a few seconds. |
| `//#format:root` | `cache: false` | Writes files. |

`typecheck` already exists. `@aft/config` joins it once it has the script.

### Lint staged helpers

`scripts/lint-staged/eslint.mjs` exports `groupByWorkspace(files, repoRoot)`. Its inputs are the absolute paths lint-staged passes, each normalized with `path.resolve` (so `\` and `/` both work). It returns `{ groups: Map<string, string[]>, outside: string[] }`: keys are absolute workspace dirs (`<repoRoot>/apps/<x>` or `<repoRoot>/packages/<x>` holding a `package.json`), values are absolute file paths, and `outside` holds every other file. `repoRoot` is `path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")`. The script runs its main code only when started directly (`pathToFileURL(process.argv[1]).href === import.meta.url`; not `import.meta.main`, so the test can import it). Main reads the paths from `process.argv.slice(2)`, groups them, and for each workspace resolves ESLint with `createRequire(path.join(ws, "package.json")).resolve("eslint/package.json")`, reads `bin.eslint` from it, and runs `spawnSync(process.execPath, [bin, "--fix", "--max-warnings=0", "--no-warn-ignored", ...files], { cwd: ws, stdio: "inherit" })`. Files are passed to ESLint as absolute paths. It runs every group, then exits 1 if any result has a nonzero `status`, a `null` status (killed by a signal), or an `error` (for example ESLint not found); otherwise 0. `eslint.test.ts` covers: files from two workspaces, a Windows style `\` path, a root file (in `outside`), a path inside a workspace's nested folder, and an empty list. `scripts/lint-staged/prisma-format.mjs` does the same for `prisma` (`bin.prisma`) from `packages/db` with `["format"]`. Neither uses a shell, so the Windows `.cmd` shims never matter.

The root `vitest.config.mts` `include` (and `coverage.include`) becomes `["ci.test.ts", "scripts/**/*.test.ts"]`. The root `tsconfig.json` `include` adds `scripts/**/*.ts`.

### Fix rules (for the new type flags and lint rules)

- An index lookup that may miss gets a real guard (`if (!x) …`, `?.`, `??` with a stated default). A non null assertion (`!`) is allowed only when the line above proves the index is in range, with a short comment saying why. No `@ts-expect-error`, no `eslint-disable`, no per workspace flag override.
- A floating promise gets `await`, or a `.catch()` that handles the error, or `void` with a comment saying why it is safe not to wait (for example a router navigation). Never an empty `.catch(() => {})`.
- Behavior doesn't change. Every existing test still passes under the same name.

### CI contract tests

New checks in `ci.test.ts`. Each name starts with the edge case IDs it proves (the `AGENTS.md` naming rule), then the AC. YAML files are read as text, as the existing checks do: a job is the slice of `ci.yml` from its `  <job>:` line to the next line with two space indentation, and the install step is the slice of `action.yml` from `- name: Install dependencies` to the next `- `.

- `I44: covers 0009 AC-6, the lint job checks formatting`: the `lint` slice has `name: Format` followed by `run: pnpm turbo run format:check //#format:root:check`.
- `I35: covers 0009 AC-10, CI installs without git hooks`: the install step slice has `HUSKY: "0"`.
- `I35: covers 0009 AC-4, AC-7, root scripts for check, format, and hooks`: the root `check`, `format`, `format:root`, `format:root:check`, `lint:fix`, and `prepare` scripts equal *Scripts and tasks* exactly.
- `I34: covers 0009 AC-7, the commit hook calls no package manager`: `.husky/pre-commit` has no `pnpm` and no `npx`, and neither `.husky/pre-push` nor `.husky/commit-msg` exists.
- `I37, I39: covers 0009 AC-8, lint staged globs are disjoint and Prettier runs last`: importing `lint-staged.config.mjs` gives the three keys in *Config files*. No extension appears in two keys, and in the code key the ESLint command comes first and the Prettier command last.
- `I22: covers 0009 AC-4, format tasks never replay a stale result`: in `turbo.json`, `//#format:root:check`, `//#format:root`, `format`, and `lint:fix` have `cache: false`, and `format:check` has `inputs: ["prisma/schema.prisma"]`.
- `I18, I40: covers 0009 AC-1, Prettier skips markdown, migrations, and tool files, and its Tailwind stylesheet exists`: `.prettierignore` has every line in *Config files*, and the `tailwindStylesheet` path in `prettier.config.mjs` (read as text) exists.
- `I41: covers 0009 AC-11, the base tsconfig keeps the strict flags, and @aft/config is typechecked`: `packages/config/tsconfig/base.json` sets `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch` to `true`, and `@aft/config` has a `typecheck` script.

I38, I43, and I33 are proved by the AC-8 procedure and the `eslint.test.ts` cases, not by `ci.test.ts`.

New `//#test:root` and `//#test:root:coverage` inputs: `.prettierignore`, `prettier.config.mjs`, `lint-staged.config.mjs`, `.husky/**`, `packages/config/tsconfig/*.json`, `scripts/**`.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Prettier | print width 100, LF, defaults | engineer's pick in this spec (AC-1) |
| Prettier Tailwind plugin | stylesheet path | `@aft/ui` exports `./globals.css` → `packages/ui/src/styles/globals.css` (spec 0008) |
| Tool versions | `3.9.10`, `0.8.1`, `9.1.7`, `17.6.0`, `10.1.8` | npm registry `latest`, read 2026-10-28 |
| ESLint in the hook | which workspace owns a file | nearest `package.json` under `apps/*` or `packages/*` (AC-9) |
| ESLint in the hook | which binary and config | resolved from that workspace; its own `eslint.config.mjs` through `cwd` |
| Typed linting | the tsconfig root | `process.cwd()`: Turborepo, the hook helper, and VS Code (`eslint.workingDirectories` auto) all run ESLint from the workspace dir |
| CI hook skip | `HUSKY` | setup action install step env (AC-10) |
| Blame ignore | the format commit SHA | `git log -1 --format=%H` of PR 1's squash commit on `main`, read after PR 1 merges (AC-3) |
| Stricter flags | which flags | engineer's pick; error counts measured 2026-10-28 |

### Key invariants

- `pnpm check` and CI run the same checks, and neither writes a file.
- No hook calls `pnpm`, `npx`, or `pnpm exec` (I34).
- No file matches two lint-staged globs (I37), and Prettier always runs last on a file (I39).
- Markdown, migrations, and tool owned files are never formatted (I18, I40).
- Typed lint rules only see files a tsconfig includes (I41).

### Security model

No secrets, no runtime code, nothing users see. The hook runs only code from this repo and its pinned dependencies. Husky and lint-staged are dev dependencies, so `pnpm audit --prod` is unchanged (I31). Neither ships an install script that needs an `allowBuilds` entry (Husky installs through the root `prepare` script, which pnpm always runs for the root package).

### Configuration required

No new environment variables for the app. `HUSKY=0` is CI only (AC-10).

### Edge cases (new in the PLAN.md catalog)

- **I33** A file is staged only in part → lint-staged hides the unstaged lines, fixes the staged ones, then restores; if the restore conflicts it brings back its backup and fails the commit, so nothing is lost.
- **I34** A hook calls pnpm, which reinstalls when a manifest drifts and rewrites `pnpm-lock.yaml` in the middle of a commit → hooks start binaries with `node` or `./node_modules/.bin`, never `pnpm` or `npx`.
- **I35** Hooks are missing in a fresh clone, or `prepare` fails where there is no `.git` or no Husky (a production only install) → `prepare: husky || true` installs on `pnpm install` and never fails an install; CI sets `HUSKY=0`; with no `.git` Husky exits 0.
- **I36** A git client without Node on its PATH runs the hook → the hook fails (exit 127) and blocks the commit, rather than being skipped. The fix is to put Node on that client's PATH, never `--no-verify` as a habit.
- **I37** Two lint-staged globs match one file and edit it at the same time → the globs are disjoint.
- **I38** A staged file that ESLint ignores trips `--max-warnings=0` with "File ignored" → `--no-warn-ignored`.
- **I39** An ESLint fix leaves a line unformatted → Prettier runs after ESLint, and `eslint-config-prettier` turns off ESLint's style rules.
- **I40** A file written by a tool or vendored (lockfile, skills, the agent cache, IDE files) fails the format check after the tool rewrites it → it is in `.prettierignore`.
- **I41** A type aware rule meets a TypeScript file that no tsconfig includes, and fails with "not found by the project service" → add the file to its workspace tsconfig; never `allowDefaultProject`.
- **I42** The reformat changes a file that a test reads as text (`ci.test.ts` reads workflows, manifests, and Vitest configs) → PR 1 runs the whole suite. If a check breaks, its match is fixed for the new layout, with the same meaning, in PR 1.
- **I43** A Windows checkout with `core.autocrlf` writes CRLF and fails the LF check → `.gitattributes` (`* text=auto eol=lf`) already forces LF in the working tree; Prettier and `.editorconfig` agree.
- **I44** A commit skips the hook (`--no-verify`, or a clone before `pnpm install`) → the CI `lint` job's Format step catches it.
- **I45** VS Code runs ESLint or Prettier from the wrong folder and uses another config → `eslint.workingDirectories` auto and `prettier.requireConfig`, with `AFT-INC` opened as the folder.

### Critical test scenarios

- Happy path: from a clean tree, `pnpm check` passes, and `git status` is unchanged afterwards. Verifies **AC-4**, **AC-6**.
- Commit flow: stage a badly formatted `.tsx` file in `apps/web` and commit; the committed blob is formatted. Verifies **AC-8**.
- Blocked commit: stage `const x: any = 1` in `packages/ui` (fails `no-explicit-any`, not fixable); the commit is refused with ESLint's output. Verifies **AC-8**, **AC-9**.
- Partial stage: change two hunks in one file, stage one, commit; the other hunk is still unstaged and unchanged. Verifies **AC-8** (I33).
- Grouping unit test: `groupByWorkspace` puts `apps/web/a.ts` and `packages/ui/src/b.tsx` in their workspaces and `ci.test.ts` outside. Verifies **AC-9**.
- Prisma: add stray spaces in `schema.prisma`; `pnpm check` fails; `pnpm format` fixes it. This works with no `DATABASE_URL` and no `.env` (checked 2026-10-28). Verifies **AC-5**.
- CI contract: each *CI contract tests* check fails when its file is changed back. Verifies **AC-14**.
- No `.git`: run Husky in a folder exported with `git archive`; exit code 0. Verifies **AC-10**.

## Build plan

Tracer Bullet: PR 1 lands the format layer alone. In PR 2, the first step is a thin real path (a staged file formatted by a real hook on a real commit), and each later step thickens it by one strand.

**PR 1, `feat/workspace-tooling-format`**

1. Add Prettier and the plugin, `prettier.config.mjs`, `.prettierignore`, and `.editorconfig`. Satisfies **AC-1**.
2. Run `pnpm exec prettier --write .`. Confirm no migration changed, then run lint, typecheck, the full test suite, and `build`. Make only the I42 test fixes, and list each one in the PR body. Satisfies **AC-2**.
3. Open the PR, all six checks green, squash merge. Record the squash SHA. Satisfies **AC-2**.

**PR 2, `feat/workspace-tooling`**

4. Thin thread: Husky, lint-staged, `prepare`, `.husky/pre-commit`, and a `lint-staged.config.mjs` with only the Prettier commands. Commit a badly formatted file and see it land formatted. Set `HUSKY: "0"` in the setup action. Satisfies **AC-7**, **AC-10**.
5. `pnpm check`, `pnpm format`, the new tasks, `@aft/db` format scripts, the lint staged Prisma helper, and the CI Format step. Satisfies **AC-4**, **AC-5**, **AC-6**.
6. ESLint in the hook: `scripts/lint-staged/eslint.mjs` with its test, the root Vitest and tsconfig includes, `lint:fix` scripts. Run the AC-8 cases from Git Bash and VS Code. Satisfies **AC-8**, **AC-9**.
7. Lint rules: `eslint-config-prettier`, the typed linting block, and the fixes. Satisfies **AC-12**.
8. Type flags: the three flags, `@aft/config` tsconfig and `typecheck`, and the fixes. Satisfies **AC-11**.
9. Editor files and `.git-blame-ignore-revs` with PR 1's SHA. Satisfies **AC-3**, **AC-13**.
10. `ci.test.ts` checks and the new `//#test:root` inputs. Satisfies **AC-14**.

## Migration plan

**Strategy**: big bang reformat, then tooling, in two PRs (the reformat is mechanical and reversible, so incremental formatting buys nothing and would leave the CI check unusable).
**Phases**:
1. PR 1 merges the Prettier config and the reformat, with no enforcement yet. Before opening it, confirm no other branch has unmerged work and no PR is open (I24); none on 2026-10-28.
2. PR 2 merges the hooks, `pnpm check`, the CI Format step, the stricter flags and rules with their fixes, and the blame ignore file. Nothing else merges to `main` between the two PRs.
**Rollback**: revert PR 2's squash commit to remove enforcement; revert PR 1's to restore the old layout. Each is one commit, and neither touches data or deployed code.
**Risks**: a branch started before PR 1 conflicts on almost every line (rebase, then run `pnpm format`); a text matching test breaks on the new layout (I42); a hook that fails on one git client blocks commits there (I36, proved in AC-8).

## Consequences

**Positive**:
- One command gives the same answer as CI for lint, format, and types, and formatting stops being a review topic.
- Forgotten `await`s and unchecked array lookups get caught before the workflow engine, billing, and delivery code arrive, which is where they would hurt.
- Every workspace, `@aft/config` included, is now typechecked.

**Negative / tradeoffs**:
- Each commit takes a few seconds longer while ESLint loads the Next config.
- Typed linting makes `pnpm lint` slower in every workspace (it builds a TypeScript program per workspace).
- PR 1 touches most files, so any branch started before it must be rebased and reformatted.
- The feature ships as two PRs, which breaks the one PR per feature rule this once.
- Two small root scripts (`scripts/lint-staged/`) are custom code to maintain.

**Neutral**:
- `/sync` should add `pnpm check`, `pnpm format`, the hook, `blame.ignoreRevsFile`, and I33 to I45 to `AGENTS.md`. The VS Code folder becomes `AFT-INC`, not `remwa-com`.

## Follow-up

- [ ] Add I33 to I45 to the PLAN.md edge case catalog (done when this spec is confirmed).
- [ ] Root files (`ci.test.ts`, `vitest.config.mts`, `scripts/`) are formatted but not linted or typechecked by a task. Worth a small root `//#typecheck:root` and lint config later.
- [ ] Feature 9 (container images): the Dockerfile install runs `prepare`; Husky exits 0 without `.git` (AC-10), but setting `HUSKY=0` there too keeps the log clean.
- [ ] Spec 0001 follow up "pre-commit hooks that run lint and tests": closed. Lint runs at commit; tests stay in `pnpm test` and CI (engineer's decision, 2026-10-28).
- [ ] Spec 0008 follow up: Prettier lives at the root, not in `@aft/config`, because it runs once for the whole repo. `turbo boundaries` stays declined; the ESLint import rule stays.
- [ ] `README.md` still says npm (outside this spec; flagged by the 0008 `/sync`).
- [ ] For `/sync`: add to the root `AGENTS.md` `## Agent skills` a `Declined:` line for the Prettier, Husky, lint-staged, ESLint, and EditorConfig skills found on 2026-10-28 (`mattpocock/skills` setup-pre-commit, `patricio0312rev/skills` eslint-prettier-config, `github/awesome-copilot` editorconfig, and smaller ones) and the `@eslint/mcp` server. The engineer declined them; the spec pins every config file.
