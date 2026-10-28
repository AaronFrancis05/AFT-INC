# Verify: workspace tooling · spec 0009 · updated 2026-10-28 (PR 2 steps added; verified PASS)
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual (VS Code, with `AFT-INC` opened as the folder)
- [x] Source Control commit button: stage a badly formatted `.tsx` in `apps/web`, commit → the committed blob is formatted → AC-8
- [x] Source Control: stage `export const x: any = 1;` in `packages/ui`, commit → refused, ESLint output shows `no-explicit-any` → AC-8, AC-9
- [x] Source Control: change two far apart hunks in one file, stage one, commit → the other hunk is still unstaged and unchanged → AC-8, I33
- [x] Source Control: a commit that only deletes a file → passes → AC-8
- [x] If VS Code git cannot find Node, record it as I36 and put Node on PATH; never skip the case → AC-8, I36
- [x] Record `git show --stat HEAD` (or the refusal text) and `git diff` for each case here → AC-8
- [x] Save a messy `.tsx` in `apps/web` → ESLint fixes and Prettier layout applied with the repo config → AC-13, I45
- [x] Save a `.md` file with trailing spaces → nothing changes → AC-13

## Commands
- [x] `pnpm exec prettier --check .` on `main` → "All matched files use Prettier code style!" → AC-1
- [x] `git show --stat 7c7c901 -- packages/db/prisma/migrations` → lists no file → AC-2, I18
- [x] Compare `prettier.config.mjs`, `.prettierignore`, `.editorconfig` with the spec's *Config files* → identical → AC-1
- [x] Root `package.json` `devDependencies` → `prettier` `3.9.10` and `prettier-plugin-tailwindcss` `0.8.1`, exact, root only (not in the catalog) → AC-1
- [x] PR #15 checks → all six required checks green → AC-2
- [x] `vitest list` in each workspace plus the root, at 861b7ea and at 7c7c901 → the same 128 names → AC-2, I42
- [x] Value sourcing: the `tailwindStylesheet` path in `prettier.config.mjs` (`packages/ui/src/styles/globals.css`) exists → AC-1
- [x] `pnpm check` from PowerShell and from Git Bash (no `MSYS_NO_PATHCONV`) → passes; `git status --porcelain` is the same before and after → AC-4
- [x] Break a TS file and `schema.prisma` → one `pnpm check` run fails both (`--continue`) → `pnpm format` fixes both → AC-4, AC-5
- [x] PR 2 checks → all six green; the `lint` job shows a `Format` step → AC-6, I44
- [x] Fresh clone, `pnpm install` → `git config core.hooksPath` prints `.husky/_`; `pnpm install --prod` exits 0 → AC-7, I35
- [x] `.husky/pre-commit` is one line, `./node_modules/.bin/lint-staged`; no `pre-push` or `commit-msg` hook → AC-7, I34
- [x] Git Bash, on a scratch branch: unformatted file committed formatted; `any` refused with ESLint output; partial stage kept; delete only passes; `--no-verify` skips (and `prettier --check` then flags it) → AC-8, I33, I44
- [x] Git Bash: force add a file under `packages/ui/coverage/` with a lint error → the commit passes with no "File ignored" warning → AC-9, I38
- [x] Git Bash: stage an unformatted `schema.prisma` → the hook formats it (no empty commit) → AC-8
- [x] Husky run in a `git archive` export (no `.git`) → exits 0; the setup action install step sets `HUSKY: "0"` → AC-10, I35
- [x] `git blame packages/ui/src/components/sidebar.tsx -L1,1` → `19c523e`, not `7c7c901`; `git config blame.ignoreRevsFile` is `.git-blame-ignore-revs` → AC-3
- [x] `pnpm typecheck` and `pnpm lint` green with the three flags and the promise rules; `git grep -nE "allowDefaultProject|eslint-disable|ts-expect-error"` finds nothing new → AC-11, AC-12, I41
- [x] `pnpm test:root` → 36 of 36; each spec 0009 check fails when its file is changed back → AC-14
- [x] Value sourcing: ESLint in the hook runs with `cwd` set to the owning workspace (its own `eslint.config.mjs`); a root file such as `ci.test.ts` is formatted but not linted → AC-9
- [x] Value sourcing: the blame SHA in `.git-blame-ignore-revs` equals `git log -1 --format=%H 7c7c901` → AC-3

## Acceptance-criteria coverage
- AC-1 … the Prettier check, config compare, pins, and stylesheet steps · AC-2 … the migrations, PR checks, and test names steps · AC-3 … blame steps · AC-4, AC-5 … check and format steps · AC-6 … PR 2 checks · AC-7, AC-10 … clone, prod install, export, setup action · AC-8, AC-9 … VS Code and Git Bash hook cases · AC-11, AC-12 … typecheck and lint · AC-13 … VS Code save · AC-14 … root contract test

## Evidence (/check verify, 2026-10-28)
- AC-1, AC-2: `main` worktree at 7c7c901, `prettier --check .` exit 0; configs identical to the spec; sorted `vitest list` at 861b7ea and 7c7c901 identical (128); PR #15 six checks green; 0 migration files in 7c7c901.
- AC-3: line 1 of `sidebar.tsx`: `--ignore-revs-file=""` → 7c7c901; with the file or the local config → 19c523e.
- AC-4: `pnpm check --force` 15 of 15 in Git Bash and in PowerShell (no `MSYS_NO_PATHCONV`), `git status --porcelain` identical. AC-5: one run failed `//#format:root:check` and `@aft/db#format:check`; `pnpm format` fixed both, schema hash restored.
- AC-6: PR #16 run 40605037845, six checks green; `lint` job log shows the `Format` step running `pnpm turbo run format:check //#format:root:check`.
- AC-7, AC-10: fresh clone of f9c6a0b: hooksPath '' → `.husky/_` after install; `--prod` install exit 0 without Husky; Husky in a `git archive` export: ".git can't be found", exit 0.
- AC-8 (VS Code Source Control): vs1 e40c805 committed `zz-format.tsx` formatted (`className="flex p-2"`); vs2 refused (`1:17 error Unexpected any`, "husky - pre-commit script failed (code 1)"), HEAD stayed e40c805, file still staged; vs3 33e8a9f held only `// staged hunk (top)`, `// unstaged hunk (bottom)` still unstaged (I33); vs4 acf12bf deleted only `zz-delete-me.ts`. VS Code git found Node (no I36).
- AC-8, AC-9 (Git Bash): the same five cases plus `--no-verify` (blob unformatted, `prettier --check` exit 1), an ignored file under `coverage/` (no "File ignored"), a root file (formatted, not linted), and the schema (formatted, empty commit prevented).
- AC-11, AC-12: typecheck and lint inside `pnpm check`; 0 added lines matching `allowDefaultProject|eslint-disable|ts-expect-error`.
- AC-13: saving `zz-save.tsx` gave `const label = "hi";` and the Prettier layout; saving `zz-save.md` left its hash unchanged (d915d33).
- AC-14: `pnpm test:root` 36 of 36.
