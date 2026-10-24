// Contract checks for the CI pipeline in spec 0001, moved to pnpm and Turborepo by spec 0008.
// They read the workflow files as text, so a later edit cannot silently drop a required
// check or expose a secret.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const setup = read(".github/actions/setup/action.yml");
const pkg = JSON.parse(read("package.json"));
const workspace = read("pnpm-workspace.yaml");

// Every source file under packages/, skipping installed, generated, and tool output folders.
function packageSources(dir = "packages"): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ["node_modules", "generated", "coverage", ".turbo"].includes(entry.name) ? [] : packageSources(path);
    return /\.(ts|tsx|mts|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

// The six required checks named in the branch protection command (AC-12).
const REQUIRED_CHECKS = ["test", "typecheck", "lint", "prisma", "build-smoke", "audit"];

// Each job under `jobs:` with its display name: a two space indented key, then its `name:` line.
function jobs(workflow: string) {
  const body = workflow.slice(workflow.indexOf("\njobs:"));
  return [...body.matchAll(/^ {2}([\w-]+):\n {4}name: (.+)$/gm)].map(([, id, name]) => ({ id, name: name.trim() }));
}

describe("CI workflow", () => {
  it("covers AC-13: has exactly the six required jobs", () => {
    expect(jobs(ci).map((job) => job.id).sort()).toEqual([...REQUIRED_CHECKS].sort());
  });

  it("covers AC-13: each job's ID equals its display name, so check names stay stable", () => {
    for (const job of jobs(ci)) expect(job.name).toBe(job.id);
  });

  it("covers AC-13: has no path filters that could leave a required check skipped", () => {
    expect(ci).not.toMatch(/^\s*paths(-ignore)?:/m);
  });

  it("covers AC-13: the old webpack workflow is gone", () => {
    expect(existsSync(".github/workflows/webpack.yml")).toBe(false);
  });

  it("covers AC-10: runs on pull requests and pushes to main, and on manual dispatch", () => {
    expect(ci).toMatch(/^ {2}pull_request:\n {4}branches: \[main\]$/m);
    expect(ci).toMatch(/^ {2}push:\n {4}branches: \[main\]$/m);
    expect(ci).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it("covers AC-10: a newer push to a pull request cancels the older run", () => {
    expect(ci).toMatch(/^concurrency:\n {2}group: .*github\.ref/m);
    expect(ci).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it("covers AC-10 (I6): the token is read only and forks never see a secret", () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
    for (const file of [ci, setup]) {
      expect(file).not.toContain("secrets.");
      expect(file).not.toContain("pull_request_target");
    }
  });

  it("covers AC-10 (I6): no checkout leaves the token in .git/config for pull request code", () => {
    const checkouts = ci.match(/uses: actions\/checkout@\S+\n {8}with:\n {10}persist-credentials: false$/gm) ?? [];
    expect(checkouts).toHaveLength((ci.match(/uses: actions\/checkout@/g) ?? []).length);
    expect(checkouts).toHaveLength(REQUIRED_CHECKS.length);
  });

  it("covers AC-11: every job installs through the shared setup action", () => {
    const setupUses = ci.match(/uses: \.\/\.github\/actions\/setup$/gm) ?? [];
    expect(setupUses).toHaveLength(REQUIRED_CHECKS.length);
  });
});

describe("Toolchain pins", () => {
  it("covers AC-11: Node 24 is pinned in .nvmrc and engines, and CI reads .nvmrc", () => {
    expect(read(".nvmrc").trim()).toBe("24");
    expect(pkg.engines.node).toBe(">=24 <25");
    expect(setup).toContain("node-version-file: .nvmrc");
  });

  it("covers AC-11: CI installs the pnpm version from packageManager, installed by pnpm/action-setup", () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(setup).toMatch(/uses: pnpm\/action-setup@v\d+$/m);
    // No version input, so the action reads packageManager and the two cannot drift.
    expect(setup).not.toMatch(/^\s+version:/m);
    expect(setup).toContain("pnpm install --frozen-lockfile");
  });

  it("covers AC-11: allowBuilds lists the reviewed packages and strictDepBuilds is not turned off", () => {
    for (const approved of ['"@prisma/engines": true', "prisma: true", "esbuild: true", "sharp: true", "unrs-resolver: true"])
      expect(workspace).toContain(approved);
    expect(workspace).toContain("msw: false");
    expect(workspace).not.toMatch(/strictDepBuilds:\s*false/);
    expect(workspace).not.toMatch(/dangerouslyAllowAllBuilds:\s*true/);
    expect(pkg.allowScripts).toBeUndefined();
  });

  it("covers 0008 AC-9: the audit job fails on high or critical advisories in runtime dependencies", () => {
    expect(ci).toContain("run: pnpm audit --prod --audit-level high");
    expect(workspace).toMatch(/^auditConfig:\n {2}(#.*\n {2})*ignoreGhsas:/m);
  });

  it("covers 0008 AC-1, AC-9: the npm lockfile and audit-ci are gone", () => {
    expect(existsSync("package-lock.json")).toBe(false);
    expect(existsSync("audit-ci.jsonc")).toBe(false);
    expect(pkg.devDependencies["audit-ci"]).toBeUndefined();
  });

  it("covers 0008 AC-11: no file under packages imports the @/ alias", () => {
    const offenders = packageSources().filter((file) => /["']@\//.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("covers AC-1: npm test runs Vitest once and test:watch keeps it running", () => {
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts["test:watch"]).toBe("vitest");
  });

  it("covers AC-8: the shadcn CLI is a dev dependency, not a runtime one", () => {
    expect(pkg.dependencies.shadcn).toBeUndefined();
    expect(pkg.devDependencies.shadcn).toBeDefined();
  });
});
