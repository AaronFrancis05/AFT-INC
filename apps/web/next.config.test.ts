// @vitest-environment node
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadEnvConfig = vi.fn();
vi.mock("@next/env", () => ({ loadEnvConfig }));

async function loadConfig() {
  vi.resetModules();
  return (await import("./next.config")).default;
}

beforeEach(() => {
  loadEnvConfig.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config root .env loading (spec 0008 AC-13)", () => {
  it("loads env files from the repo root, the folder holding pnpm-workspace.yaml", async () => {
    await loadConfig();
    expect(loadEnvConfig).toHaveBeenCalledTimes(1);
    const [dir] = loadEnvConfig.mock.calls[0];
    expect(existsSync(path.join(dir, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(path.join(dir, "apps", "web", "next.config.ts"))).toBe(true);
  });

  it("forces a reload, so the root files replace the empty load Next.js cached from apps/web", async () => {
    await loadConfig();
    const [, , log, forceReload] = loadEnvConfig.mock.calls[0];
    expect(forceReload).toBe(true);
    expect(log).toBe(console);
  });

  it("loads development env files outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await loadConfig();
    expect(loadEnvConfig.mock.calls[0][1]).toBe(true);
  });

  it("does not load development env files in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await loadConfig();
    expect(loadEnvConfig.mock.calls[0][1]).toBe(false);
  });
});

describe("next.config workspace settings (spec 0008 AC-17)", () => {
  it("compiles every workspace package the app imports", async () => {
    const config = await loadConfig();
    expect([...(config.transpilePackages ?? [])].sort()).toEqual(["@aft/auth", "@aft/db", "@aft/email", "@aft/ui"]);
  });

  it("points Turbopack and file tracing at the same repo root that env loading uses", async () => {
    const config = await loadConfig();
    const [root] = loadEnvConfig.mock.calls[0];
    expect(config.turbopack?.root).toBe(root);
    expect(config.outputFileTracingRoot).toBe(root);
  });
});
