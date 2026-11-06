// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionContextResolver, type MembershipLookup } from "./context";

// The session resolver and the allowed origins (spec 0011, AC-10, AC-11). Better Auth itself is
// replaced, so no env or database is needed.
const better = vi.hoisted(() => ({
  loads: 0,
  getSession: vi.fn(),
  trustedOrigins: undefined as unknown,
}));
vi.mock("./server/auth", () => {
  better.loads += 1;
  return {
    auth: {
      api: { getSession: better.getSession },
      get options() {
        return { trustedOrigins: better.trustedOrigins };
      },
    },
  };
});
vi.mock("./env", () => ({ authEnv: () => ({ BETTER_AUTH_URL: "https://aft.example/app/" }) }));

const headers = new Headers({ cookie: "session=s1" });
const signedIn = (session: object = {}) => ({ user: { id: "u1" }, session });

afterEach(() => {
  better.getSession.mockReset();
  better.trustedOrigins = undefined;
});

describe("createSessionContextResolver", () => {
  it("AC-11: no session is null in both modes", async () => {
    const resolver = createSessionContextResolver({ getSession: async () => null });
    expect(await resolver.resolve({ headers, mode: "user" })).toBeNull();
    expect(await resolver.resolve({ headers, mode: "org" })).toBeNull();
  });

  it("user mode gives the user caller and passes the request headers", async () => {
    const getSession = vi.fn(async () => signedIn({ activeOrganizationId: "org_a" }));
    const resolver = createSessionContextResolver({ getSession });
    expect(await resolver.resolve({ headers, mode: "user" })).toEqual({
      caller: { kind: "user", userId: "u1" },
    });
    expect(getSession).toHaveBeenCalledWith(headers);
  });

  it("org mode with a member gives the workspace and the role", async () => {
    const findMembership = vi.fn<MembershipLookup>(async () => ({ role: "owner" }));
    const resolver = createSessionContextResolver({
      getSession: async () => signedIn({ activeOrganizationId: "org_a" }),
      findMembership,
    });
    expect(await resolver.resolve({ headers, mode: "org" })).toEqual({
      caller: { kind: "user", userId: "u1" },
      organizationId: "org_a",
      role: "owner",
    });
    expect(findMembership).toHaveBeenCalledWith({ userId: "u1", organizationId: "org_a" });
  });

  it("X15: org mode without an active workspace, a lookup, or a membership has no workspace", async () => {
    const caller = { caller: { kind: "user", userId: "u1" } };
    const notMember = createSessionContextResolver({
      getSession: async () => signedIn({ activeOrganizationId: "org_b" }),
      findMembership: async () => null,
    });
    expect(await notMember.resolve({ headers, mode: "org" })).toEqual(caller);

    const noActive = createSessionContextResolver({
      getSession: async () => signedIn({ activeOrganizationId: "" }),
      findMembership: async () => ({ role: "owner" }),
    });
    expect(await noActive.resolve({ headers, mode: "org" })).toEqual(caller);

    // Today: no findMembership until feature 29.
    const today = createSessionContextResolver({
      getSession: async () => signedIn({ activeOrganizationId: "org_a" }),
    });
    expect(await today.resolve({ headers, mode: "org" })).toEqual(caller);
  });

  it("a member without a role yet has no role key", async () => {
    const resolver = createSessionContextResolver({
      getSession: async () => signedIn({ activeOrganizationId: "org_a" }),
      findMembership: async () => ({}),
    });
    expect(await resolver.resolve({ headers, mode: "org" })).toEqual({
      caller: { kind: "user", userId: "u1" },
      organizationId: "org_a",
    });
  });
});

describe("sessionContextResolver and allowedOrigins (the live ones)", () => {
  it("loads Better Auth only on first use and asks it for the session", async () => {
    vi.resetModules();
    better.loads = 0;
    const context = await import("./context");
    expect(better.loads).toBe(0);
    better.getSession.mockResolvedValue(signedIn());
    expect(await context.sessionContextResolver.resolve({ headers, mode: "user" })).toEqual({
      caller: { kind: "user", userId: "u1" },
    });
    expect(better.loads).toBe(1);
    expect(better.getSession).toHaveBeenCalledWith({ headers });
  });

  it("AC-10: the BETTER_AUTH_URL origin plus Better Auth's trustedOrigins", async () => {
    const { allowedOrigins } = await import("./context");
    expect(await allowedOrigins()).toEqual(["https://aft.example"]);
    better.trustedOrigins = ["https://admin.example"];
    expect(await allowedOrigins()).toEqual(["https://aft.example", "https://admin.example"]);
  });

  it("refuses trustedOrigins it can't compare exactly", async () => {
    const { allowedOrigins } = await import("./context");
    for (const trusted of [() => [], ["https://*.example.com"]]) {
      better.trustedOrigins = trusted;
      await expect(allowedOrigins()).rejects.toThrow(TypeError);
    }
  });
});
