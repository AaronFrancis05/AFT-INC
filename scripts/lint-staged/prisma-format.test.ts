// The commit hook's Prisma helper (spec 0009, AC-8, AC-9), run against a stub Prisma binary in a
// throwaway repo.
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeRepo } from "./fake-repo";

// Each case starts node twice (the helper, then the stub), which can take seconds on a cold or
// loaded machine; this is a limit, not a retry.
describe("prisma-format.mjs run from the commit hook", { timeout: 30_000 }, () => {
  let repo: ReturnType<typeof fakeRepo>;

  beforeEach(() => {
    repo = fakeRepo("prisma-format.mjs");
  });

  afterEach(() => {
    repo.remove();
  });

  it("covers 0009 AC-8: runs @aft/db's own Prisma format from packages/db", () => {
    const db = repo.workspace("packages/db", { bin: "prisma", exit: 0 });

    expect(repo.run()).toBe(0);
    expect(repo.calls()).toEqual([{ cwd: db, args: ["format"] }]);
  });

  it("covers 0009 AC-8: ignores file arguments and formats only the one schema", () => {
    const db = repo.workspace("packages/db", { bin: "prisma", exit: 0 });

    expect(repo.run(path.join(db, "prisma", "schema.prisma"))).toBe(0);
    expect(repo.calls()).toEqual([{ cwd: db, args: ["format"] }]);
  });

  it("covers 0009 AC-8: blocks the commit when prisma format fails", () => {
    repo.workspace("packages/db", { bin: "prisma", exit: 1 });

    expect(repo.run()).toBe(1);
  });

  it("covers 0009 AC-8: blocks the commit when @aft/db has no Prisma installed", () => {
    repo.workspace("packages/db");

    expect(repo.run()).not.toBe(0);
    expect(repo.calls()).toEqual([]);
  });
});
