# Verify: workspace tooling · spec 0009 · updated 2026-10-28
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `pnpm exec prettier --check .` on `main` → "All matched files use Prettier code style!" → AC-1
- [ ] `git show --stat 7c7c901 -- packages/db/prisma/migrations` → lists no file → AC-2, I18
- [ ] Compare `prettier.config.mjs`, `.prettierignore`, `.editorconfig` with the spec's *Config files* → identical → AC-1
- [ ] Root `package.json` `devDependencies` → `prettier` `3.9.10` and `prettier-plugin-tailwindcss` `0.8.1`, exact, root only (not in the catalog) → AC-1
- [ ] PR #15 checks → all six required checks green → AC-2
- [ ] `vitest list` in each workspace plus the root, at 861b7ea and at 7c7c901 → the same 128 names → AC-2, I42
- [ ] Value sourcing: the `tailwindStylesheet` path in `prettier.config.mjs` (`packages/ui/src/styles/globals.css`) exists → AC-1

## Acceptance-criteria coverage
- AC-1 … the Prettier check, config compare, pins, and stylesheet steps · AC-2 … the migrations, PR checks, and test names steps · AC-3 to AC-14 … added by the PR 2 builds
