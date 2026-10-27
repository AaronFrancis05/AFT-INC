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
