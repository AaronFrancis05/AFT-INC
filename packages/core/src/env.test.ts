import { afterEach, describe, expect, it, vi } from "vitest";
import { logEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("logEnv", () => {
  it("covers AC-12: LOG_LEVEL is optional", () => {
    vi.stubEnv("LOG_LEVEL", " ");
    expect(logEnv().LOG_LEVEL).toBeUndefined();
  });

  it("covers AC-12: accepts a known level", () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    expect(logEnv().LOG_LEVEL).toBe("warn");
  });

  it("covers AC-12: refuses an unknown level by name, never echoing the value", () => {
    vi.stubEnv("LOG_LEVEL", "verbose-secret");
    expect(() => logEnv()).toThrow(/LOG_LEVEL/);
    expect(() => logEnv()).not.toThrow(/verbose-secret/);
  });
});
