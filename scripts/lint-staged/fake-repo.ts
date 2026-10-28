// Test support for the commit hook helpers (spec 0009, AC-9). Each helper finds the repo root
// from its own location, so a test copies it into a throwaway repo with fake workspaces whose
// eslint or prisma binary is a stub that logs its folder and arguments, then exits as told.
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export type StubCall = { cwd: string; args: string[] };

export function fakeRepo(script: "eslint.mjs" | "prisma-format.mjs") {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "aft-lint-staged-")));
  mkdirSync(path.join(root, "scripts", "lint-staged"), { recursive: true });
  const scriptPath = path.join(root, "scripts", "lint-staged", script);
  copyFileSync(path.join(here, script), scriptPath);
  const log = path.join(root, "stub-calls.jsonl");

  return {
    root,
    /** Adds `<root>/<dir>` with a package.json; `bin` gives it a stub of that tool exiting `exit`. */
    workspace(dir: string, stub?: { bin: "eslint" | "prisma"; exit: number }) {
      const ws = path.join(root, dir);
      mkdirSync(ws, { recursive: true });
      writeFileSync(path.join(ws, "package.json"), JSON.stringify({ name: dir }));
      if (stub) {
        const pkg = path.join(ws, "node_modules", stub.bin);
        mkdirSync(path.join(pkg, "bin"), { recursive: true });
        writeFileSync(
          path.join(pkg, "package.json"),
          JSON.stringify({ name: stub.bin, bin: { [stub.bin]: "./bin/cli.js" } }),
        );
        writeFileSync(
          path.join(pkg, "bin", "cli.js"),
          [
            `require("node:fs").appendFileSync(${JSON.stringify(log)},`,
            `  JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + "\\n");`,
            `process.exit(${stub.exit});`,
          ].join("\n"),
        );
      }
      return ws;
    },
    /** Runs the copied script with node, as lint-staged does, and returns its exit status. */
    run(...args: string[]) {
      // pnpm's .bin shims set NODE_PATH to its hoisted folder, where createRequire would find the
      // repo's real eslint and prisma; without it, a workspace's missing binary stays missing.
      const env = { ...process.env };
      delete env.NODE_PATH;
      return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8", env }).status;
    },
    /** Every stub call, in order. */
    calls(): StubCall[] {
      if (!existsSync(log)) return [];
      return readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as StubCall);
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
