// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

// The app wiring (spec 0011): importing lib/server.ts must read no env and open nothing, since
// every "use server" file and route imports it, and `next build` loads those.
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/server.ts", () => {
  it("imports with the database and auth variables unset", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", " ");
    vi.stubEnv("BETTER_AUTH_SECRET", " ");
    vi.stubEnv("BETTER_AUTH_URL", " ");
    const server = await import("./server");
    expect(typeof server.defineAction).toBe("function");
    expect(typeof server.defineRoute).toBe("function");
  });

  it("a public action runs through the real wrapper without touching auth or the database", async () => {
    vi.stubEnv("DATABASE_URL", " ");
    const { defineAction } = await import("./server");
    const { input, text } = await import("@aft/core/validate");
    const echo = defineAction({
      name: "fixture.echo",
      auth: "public",
      input: input({ word: text({ max: 5 }) }),
      handler: async ({ input }) => input.word,
    });
    expect(await echo({ word: " hi " })).toEqual({ ok: true, data: "hi" });
    expect(await echo({ word: "too long" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
  });
});
