// Grouping of staged files by workspace for the commit hook (spec 0009, AC-9).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { groupByWorkspace } from "./eslint.mjs";

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
