// Staged files only (spec 0009). No pnpm or npx here: pnpm reinstalls when a manifest drifts (I34).
export default {
  "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}": [
    "node scripts/lint-staged/eslint.mjs",
    "prettier --write --ignore-unknown",
  ],
  "*.{json,jsonc,yaml,yml,css}": "prettier --write --ignore-unknown",
  "packages/db/prisma/schema.prisma": () => "node scripts/lint-staged/prisma-format.mjs",
};
