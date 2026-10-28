// Contract checks for the CI pipeline in spec 0001, moved to pnpm and Turborepo by spec 0008.
// They read the workflow files as text, so a later edit cannot silently drop a required
// check or expose a secret.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const ci = read(".github/workflows/ci.yml");
const setup = read(".github/actions/setup/action.yml");
const pkg = JSON.parse(read("package.json"));
const web = JSON.parse(read("apps/web/package.json"));
const workspace = read("pnpm-workspace.yaml");
const turbo = JSON.parse(read("turbo.json"));

// Every source file under packages/, skipping installed, generated, and tool output folders.
function packageSources(dir = "packages"): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return ["node_modules", "generated", "coverage", ".turbo"].includes(entry.name)
        ? []
        : packageSources(path);
    return /\.(ts|tsx|mts|mjs|js)$/.test(entry.name) ? [path] : [];
  });
}

// Each workspace folder the pnpm-workspace.yaml globs (apps/*, packages/*) match.
function workspaceDirs() {
  const globs = [...workspace.matchAll(/^ {2}- ([\w-]+)\/\*$/gm)].flatMap(([, dir]) =>
    dir ? [dir] : [],
  );
  return globs.flatMap((dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, "package.json")))
      .map((entry) => join(dir, entry.name)),
  );
}

// Every workspace manifest: the root plus each workspace folder.
function workspaceManifests() {
  return [".", ...workspaceDirs()].map((dir) => JSON.parse(read(join(dir, "package.json"))));
}

// Tools used only to lint or to add components; never runtime dependencies (spec 0008 AC-9, I31).
const BUILD_ONLY_TOOLS = ["shadcn", "eslint-config-next"];

// The six required checks named in the branch protection command (AC-12).
const REQUIRED_CHECKS = ["test", "typecheck", "lint", "prisma", "build-smoke", "audit"];

// Each job under `jobs:` with its display name: a two space indented key, then its `name:` line.
function jobs(workflow: string) {
  const body = workflow.slice(workflow.indexOf("\njobs:"));
  return [...body.matchAll(/^ {2}([\w-]+):\n {4}name: (.+)$/gm)].flatMap(([, id, name]) =>
    id && name ? [{ id, name: name.trim() }] : [],
  );
}

describe("CI workflow", () => {
  it("covers AC-13: has exactly the six required jobs", () => {
    expect(
      jobs(ci)
        .map((job) => job.id)
        .sort(),
    ).toEqual([...REQUIRED_CHECKS].sort());
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
    const checkouts =
      ci.match(/uses: actions\/checkout@\S+\n {8}with:\n {10}persist-credentials: false$/gm) ?? [];
    expect(checkouts).toHaveLength((ci.match(/uses: actions\/checkout@/g) ?? []).length);
    expect(checkouts).toHaveLength(REQUIRED_CHECKS.length);
  });

  it("covers 0008 AC-7: each job keeps its own Turborepo cache", () => {
    expect(setup).toMatch(/^\s+key: turbo-.*\$\{\{ github\.job \}\}.*\$\{\{ github\.sha \}\}$/m);
    expect(setup).toMatch(/^\s+restore-keys: turbo-.*\$\{\{ github\.job \}\}/m);
    expect(ci).toMatch(/^\s+key: nextjs-.*'!\*\*\/node_modules\/\*\*'/m);
  });

  it("covers 0008 AC-20: test runs cap Turborepo concurrency and Vitest workers", () => {
    expect(pkg.scripts.test).toContain("--concurrency=2");
    expect(pkg.scripts["test:coverage"]).toContain("--concurrency=2");
    expect(ci).toMatch(/^\s+run: pnpm turbo run test:coverage .*--concurrency=2$/m);
    const testJob = ci.slice(ci.indexOf("\n  test:\n"), ci.indexOf("\n  typecheck:\n"));
    expect(testJob).toContain("TURBO_FORCE: ${{ github.run_attempt > 1 }}");
    // The worker cap lives in each workspace config, not in CI (amendment 2026-10-28).
    const configs = workspaceDirs()
      .map((dir) => join(dir, "vitest.config.mts"))
      .filter((file) => existsSync(file));
    expect(configs).toHaveLength(5);
    for (const file of configs) expect(read(file), file).toMatch(/^\s+maxWorkers: 2,$/m);
    expect(read("vitest.config.mts")).not.toContain("maxWorkers");
    expect(ci).not.toContain("VITEST_MAX_WORKERS");
    expect(turbo.globalPassThroughEnv).not.toContain("VITEST_MAX_WORKERS");
    // No blind retry for the worker start timeout (I32); comment lines may mention it.
    const code = ci.split("\n").filter((line) => !line.trim().startsWith("#"));
    expect(code.filter((line) => line.includes("--retry"))).toEqual([]);
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
    for (const approved of [
      '"@prisma/engines": true',
      "prisma: true",
      "esbuild: true",
      "sharp: true",
      "unrs-resolver: true",
    ])
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

  it("covers 0008 AC-15: @next/env matches next in the catalog", () => {
    const next = workspace.match(/^ {2}next: (\S+)$/m)?.[1];
    expect(next).toBeDefined();
    expect(workspace.match(/^ {2}"@next\/env": (\S+)$/m)?.[1]).toBe(next);
    expect(web.dependencies["@next/env"]).toBe("catalog:");
  });

  it("covers 0008 AC-11: no file under packages imports the @/ alias", () => {
    const offenders = packageSources().filter((file) => /["']@\//.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("covers AC-1: the test job runs turbo run test:coverage and the root contract test", () => {
    expect(ci).toContain("run: pnpm turbo run test:coverage //#test:root:coverage --concurrency=2");
    expect(web.scripts.test).toBe("vitest run");
    expect(web.scripts["test:watch"]).toBe("vitest");
    // The root test script goes through Turborepo, so turbo run test can never recurse into itself.
    expect(pkg.scripts.test).toBe("turbo run test --concurrency=2");
    expect(pkg.scripts["test:root"]).toBe("vitest run");
  });

  it("covers AC-8: the shadcn CLI is a dev dependency, not a runtime one", () => {
    expect(pkg.dependencies?.shadcn).toBeUndefined();
    expect(pkg.devDependencies.shadcn).toBeDefined();
  });

  it("covers 0008 AC-9: build only tools are dev dependencies in every workspace", () => {
    const manifests = workspaceManifests();
    // A glob typo must not let this pass with nothing checked.
    expect(manifests.map((m) => m.name)).toEqual(
      expect.arrayContaining(["@aft/config", "@aft/ui"]),
    );
    const offenders = manifests.flatMap((m) =>
      BUILD_ONLY_TOOLS.filter((tool) => m.dependencies?.[tool]).map((tool) => `${m.name}: ${tool}`),
    );
    expect(offenders).toEqual([]);
  });

  it("covers 0008 AC-9: every workspace peer is also a dev dependency", () => {
    const manifests = workspaceManifests();
    expect(manifests.map((m) => m.name)).toEqual(
      expect.arrayContaining(["@aft/config", "@aft/ui"]),
    );
    // pnpm's autoInstallPeers records an unmirrored peer as a runtime dependency, so pnpm audit --prod would audit it (I31).
    const offenders = manifests.flatMap((m) =>
      Object.keys(m.peerDependencies ?? {})
        .filter((peer) => !m.devDependencies?.[peer])
        .map((peer) => `${m.name}: ${peer}`),
    );
    expect(offenders).toEqual([]);
  });
});

// A job in ci.yml: from its `  <job>:` line to the next line with two space indentation.
function jobSlice(job: string) {
  const start = ci.indexOf(`\n  ${job}:\n`);
  const next = ci.slice(start + 1).search(/\n {2}\S/);
  return next === -1 ? ci.slice(start) : ci.slice(start, start + 1 + next);
}

describe("Workspace tooling (spec 0009)", () => {
  it("I44: covers 0009 AC-6, the lint job checks formatting", () => {
    expect(jobSlice("lint")).toMatch(
      /- name: Format\n\s+run: pnpm turbo run format:check \/\/#format:root:check$/m,
    );
  });

  it("I35: covers 0009 AC-10, CI installs without git hooks", () => {
    const start = setup.indexOf("- name: Install dependencies");
    const end = setup.indexOf("- ", start + 2);
    expect(start).toBeGreaterThan(-1);
    expect(setup.slice(start, end)).toContain('HUSKY: "0"');
  });

  it("I35: covers 0009 AC-4, AC-7, root scripts for check, format, and hooks", () => {
    expect(pkg.scripts).toMatchObject({
      check: "turbo run lint typecheck format:check //#format:root:check --continue",
      format: "turbo run format //#format:root",
      "format:root": "prettier --write .",
      "format:root:check": "prettier --check .",
      "lint:fix": "turbo run lint:fix",
      prepare: "husky || true",
    });
  });

  it("I34: covers 0009 AC-7, the commit hook calls no package manager", () => {
    const hook = read(".husky/pre-commit");
    expect(hook).not.toMatch(/\bpnpm\b/);
    expect(hook).not.toMatch(/\bnpx\b/);
    expect(existsSync(".husky/pre-push")).toBe(false);
    expect(existsSync(".husky/commit-msg")).toBe(false);
  });

  it("I37, I39: covers 0009 AC-8, lint staged globs are disjoint and Prettier runs last", async () => {
    // A computed specifier, so the plain .mjs config needs no type declarations.
    const { default: config } = await import(pathToFileURL("lint-staged.config.mjs").href);
    const code = "*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
    expect(Object.keys(config)).toEqual([
      code,
      "*.{json,jsonc,yaml,yml,css}",
      "packages/db/prisma/schema.prisma",
    ]);
    const extensions = Object.keys(config).flatMap((glob) => {
      const braces = glob.match(/\{(.+)\}$/);
      return braces ? braces[1]!.split(",") : [glob.slice(glob.lastIndexOf(".") + 1)];
    });
    expect(new Set(extensions).size).toBe(extensions.length);
    expect(config[code][0]).toBe("node scripts/lint-staged/eslint.mjs");
    expect(config[code].at(-1)).toMatch(/^prettier /);
  });

  it("I22: covers 0009 AC-4, format tasks never replay a stale result", () => {
    for (const task of ["//#format:root:check", "//#format:root", "format", "lint:fix"])
      expect(turbo.tasks[task]?.cache, task).toBe(false);
    expect(turbo.tasks["format:check"].inputs).toEqual(["prisma/schema.prisma"]);
  });

  it("I18, I40: covers 0009 AC-1, Prettier skips markdown, migrations, and tool files, and its Tailwind stylesheet exists", () => {
    const ignored = read(".prettierignore").split(/\r?\n/);
    expect(ignored).toEqual(
      expect.arrayContaining([
        "**/*.md",
        "packages/db/prisma/migrations/",
        "pnpm-lock.yaml",
        "skills-lock.json",
        ".claude/",
        ".idea/",
        "docs/.agent-cache/",
      ]),
    );
    const stylesheet = read("prettier.config.mjs").match(/tailwindStylesheet: "(.+)"/)?.[1];
    expect(stylesheet).toBeDefined();
    expect(existsSync(stylesheet!)).toBe(true);
  });

  it("I41: covers 0009 AC-11, the base tsconfig keeps the strict flags, and @aft/config is typechecked", () => {
    const { compilerOptions } = JSON.parse(read("packages/config/tsconfig/base.json"));
    for (const flag of [
      "strict",
      "noUncheckedIndexedAccess",
      "noImplicitOverride",
      "noFallthroughCasesInSwitch",
    ])
      expect(compilerOptions[flag], flag).toBe(true);
    expect(JSON.parse(read("packages/config/package.json")).scripts.typecheck).toBe("tsc --noEmit");
  });
});
