// Lints staged files from the commit hook (spec 0009, AC-9). Each file goes to the ESLint of the
// workspace that owns it, run from that workspace so its own eslint.config.mjs applies. Started
// with node, never through a shell or pnpm (I34). Files outside every workspace are not linted.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Groups absolute file paths by the workspace (`apps/<x>` or `packages/<x>` holding a
 * `package.json`) that owns them.
 * @param {string[]} files
 * @param {string} root
 * @returns {{ groups: Map<string, string[]>, outside: string[] }}
 */
export function groupByWorkspace(files, root) {
  const groups = new Map();
  const outside = [];
  for (const file of files) {
    const abs = path.resolve(file);
    const [top, name] = path.relative(root, abs).split(path.sep);
    const ws = name && (top === "apps" || top === "packages") ? path.join(root, top, name) : null;
    if (ws && abs !== ws && existsSync(path.join(ws, "package.json"))) {
      groups.set(ws, [...(groups.get(ws) ?? []), abs]);
    } else {
      outside.push(abs);
    }
  }
  return { groups, outside };
}

function lintWorkspace(ws, files) {
  const pkgPath = createRequire(path.join(ws, "package.json")).resolve("eslint/package.json");
  const bin = path.join(
    path.dirname(pkgPath),
    JSON.parse(readFileSync(pkgPath, "utf8")).bin.eslint,
  );
  return spawnSync(
    process.execPath,
    [bin, "--fix", "--max-warnings=0", "--no-warn-ignored", ...files],
    { cwd: ws, stdio: "inherit" },
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { groups } = groupByWorkspace(process.argv.slice(2), repoRoot);
  let failed = false;
  for (const [ws, files] of groups) {
    let result;
    try {
      result = lintWorkspace(ws, files);
    } catch (error) {
      // ESLint could not be resolved from this workspace.
      console.error(error);
      failed = true;
      continue;
    }
    if (result.error || result.status !== 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}
