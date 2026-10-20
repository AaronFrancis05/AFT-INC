// Contract checks for the CI pipeline in spec 0001. They read the workflow files as text,
// so a later edit cannot silently drop a required check or expose a secret.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const setup = read(".github/actions/setup/action.yml");
const pkg = JSON.parse(read("package.json"));

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

  it("covers AC-11: CI installs the npm version from packageManager and fails on a mismatch", () => {
    const version = pkg.packageManager.replace(/^npm@/, "");
    expect(setup).toContain(`npm install -g npm@${version}`);
    expect(setup).toContain(`test "$(npm -v)" = "${version}"`);
  });

  it("covers AC-11: CI fails on any install script that is not reviewed", () => {
    expect(setup).toContain("npm install-scripts ls");
    expect(setup).toMatch(/grep -q "No packages with unreviewed install scripts" \|\| \{.*exit 1; \}/);
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
