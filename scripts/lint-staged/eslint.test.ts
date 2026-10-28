// The commit hook's ESLint helper (spec 0009, AC-9): grouping staged files by workspace, and the
// script's main run against stub ESLint binaries in a throwaway repo.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groupByWorkspace } from "./eslint.mjs";
import { fakeRepo } from "./fake-repo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const web = path.join(root, "apps", "web");
const ui = path.join(root, "packages", "ui");

describe("groupByWorkspace", () => {
  it("covers 0009 AC-9: puts files from two workspaces in their own groups", () => {
    const a = path.join(web, "a.ts");
    const b = path.join(ui, "src", "b.tsx");
    const { groups, outside } = groupByWorkspace([a, b], root);
    expect([...groups]).toEqual([
      [web, [a]],
      [ui, [b]],
    ]);
    expect(outside).toEqual([]);
  });

  // path.resolve treats a backslash as a separator only on Windows, where git clients pass them.
  it.runIf(process.platform === "win32")(
    "covers 0009 AC-9: accepts a Windows style path with backslashes",
    () => {
      const file = path.join(ui, "src", "lib", "utils.ts");
      const { groups } = groupByWorkspace([file.split(path.sep).join("\\")], root);
      expect(groups.get(ui)).toEqual([file]);
    },
  );

  it("covers 0009 AC-9: leaves a root file outside every workspace", () => {
    const file = path.join(root, "ci.test.ts");
    const { groups, outside } = groupByWorkspace([file], root);
    expect(groups.size).toBe(0);
    expect(outside).toEqual([file]);
  });

  it("covers 0009 AC-9: groups a file deep in a workspace's nested folders", () => {
    const file = path.join(web, "components", "auth", "sign-in.tsx");
    expect(groupByWorkspace([file], root).groups.get(web)).toEqual([file]);
  });

  it("covers 0009 AC-9: leaves a folder with no package.json outside", () => {
    const file = path.join(root, "packages", "not-a-workspace", "x.ts");
    expect(groupByWorkspace([file], root).outside).toEqual([file]);
  });

  it("covers 0009 AC-9: returns nothing for an empty list", () => {
    const { groups, outside } = groupByWorkspace([], root);
    expect(groups.size).toBe(0);
    expect(outside).toEqual([]);
  });
});

// Each case starts node twice (the helper, then the stub), which can take seconds on a cold or
// loaded machine; this is a limit, not a retry.
describe("eslint.mjs run from the commit hook", { timeout: 30_000 }, () => {
  let repo: ReturnType<typeof fakeRepo>;
  const FLAGS = ["--fix", "--max-warnings=0", "--no-warn-ignored"];

  beforeEach(() => {
    repo = fakeRepo("eslint.mjs");
  });

  afterEach(() => {
    repo.remove();
  });

  it("covers 0009 AC-9, I38: runs each workspace's own ESLint from that workspace, with the fix and ignore flags", () => {
    const a = repo.workspace("apps/a", { bin: "eslint", exit: 0 });
    const b = repo.workspace("packages/b", { bin: "eslint", exit: 0 });
    const fileA = path.join(a, "page.tsx");
    const fileB = path.join(b, "src", "lib", "x.ts");

    const status = repo.run(fileA, fileB);

    expect(status).toBe(0);
    expect(repo.calls()).toEqual([
      { cwd: a, args: [...FLAGS, fileA] },
      { cwd: b, args: [...FLAGS, fileB] },
    ]);
  });

  it("covers 0009 AC-9: passes every staged file of one workspace in a single run", () => {
    const a = repo.workspace("packages/a", { bin: "eslint", exit: 0 });
    const files = [path.join(a, "one.ts"), path.join(a, "src", "two.tsx")];

    expect(repo.run(...files)).toBe(0);
    expect(repo.calls()).toEqual([{ cwd: a, args: [...FLAGS, ...files] }]);
  });

  it("covers 0009 AC-9: blocks the commit when one workspace fails, after still linting the others", () => {
    const a = repo.workspace("apps/a", { bin: "eslint", exit: 1 });
    const b = repo.workspace("packages/b", { bin: "eslint", exit: 0 });

    const status = repo.run(path.join(a, "bad.ts"), path.join(b, "good.ts"));

    expect(status).toBe(1);
    expect(repo.calls().map((call) => call.cwd)).toEqual([a, b]);
  });

  it("covers 0009 AC-9: blocks the commit on an ESLint crash exit code, not only on lint errors", () => {
    const a = repo.workspace("packages/a", { bin: "eslint", exit: 2 });

    expect(repo.run(path.join(a, "x.ts"))).toBe(1);
  });

  it("covers 0009 AC-9: blocks the commit when a workspace has no ESLint to run", () => {
    const a = repo.workspace("packages/no-eslint");
    const b = repo.workspace("packages/b", { bin: "eslint", exit: 0 });

    const status = repo.run(path.join(a, "x.ts"), path.join(b, "y.ts"));

    expect(status).toBe(1);
    expect(repo.calls().map((call) => call.cwd)).toEqual([b]);
  });

  it("covers 0009 AC-9: lints nothing for files outside every workspace", () => {
    repo.workspace("packages/a", { bin: "eslint", exit: 1 });

    const status = repo.run(path.join(repo.root, "ci.test.ts"), path.join(repo.root, "x.mjs"));

    expect(status).toBe(0);
    expect(repo.calls()).toEqual([]);
  });

  it("covers 0009 AC-9: passes when there are no files", () => {
    expect(repo.run()).toBe(0);
    expect(repo.calls()).toEqual([]);
  });

  it("I34: hands file paths straight to ESLint with no shell, so spaces and shell characters stay intact", () => {
    const a = repo.workspace("packages/a", { bin: "eslint", exit: 0 });
    const odd = path.join(a, "a file; echo & $HOME.ts");

    expect(repo.run(odd)).toBe(0);
    expect(repo.calls()).toEqual([{ cwd: a, args: [...FLAGS, odd] }]);
  });
});
