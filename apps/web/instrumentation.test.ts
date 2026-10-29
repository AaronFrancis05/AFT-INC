// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "./instrumentation";

let exit: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", "");
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/aft_test");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-0123456789abcdefghij");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("instrumentation register() (spec 0010)", () => {
  it("covers AC-1: a valid environment starts without printing or exiting", async () => {
    await register();
    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("covers AC-1, AC-2: a bad environment prints every problem by name and exits 1", async () => {
    vi.stubEnv("AFT_ENV", "zz-sentinel-value-zz");
    vi.stubEnv("DATABASE_URL", "mysql://zz-sentinel-value-zz");
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain("[env] The web app can't start.");
    expect(message).toContain("  - AFT_ENV: required, one of development, test, production");
    expect(message).toContain("  - DATABASE_URL: must be a postgres:// or postgresql:// URL");
    expect(message.indexOf("AFT_ENV:")).toBeLessThan(message.indexOf("DATABASE_URL:"));
    expect(message).not.toContain("zz-sentinel-value-zz");
  });

  it("does nothing in the Edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("DATABASE_URL", "");
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it("I50: covers AC-10, does nothing during next build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("DATABASE_URL", "");
    await register();
    expect(exit).not.toHaveBeenCalled();
  });
});
