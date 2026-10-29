import "server-only";
import type { ContextResolver, ResolvedContext } from "@aft/core/server";
import { authEnv } from "./env";

// Who is calling, for the action and route wrappers (spec 0011). Better Auth is loaded on first
// use, so importing this module reads no env and opens no database connection.

export type SessionLookup = (
  headers: Headers,
) => Promise<{ user: { id: string }; session: object } | null>;

// The caller's membership in a workspace, or null when they are not a member. Feature 29 supplies
// it (with the active workspace on the session); feature 41 adds the role.
export type MembershipLookup = (args: {
  userId: string;
  organizationId: string;
}) => Promise<{ role?: string } | null>;

export type SessionContextOptions = {
  getSession: SessionLookup;
  findMembership?: MembershipLookup;
};

export function createSessionContextResolver({
  getSession,
  findMembership,
}: SessionContextOptions): ContextResolver {
  return {
    async resolve({ headers, mode }) {
      const found = await getSession(headers);
      if (!found) return null;
      const context: ResolvedContext = { caller: { kind: "user", userId: found.user.id } };
      if (mode === "user") return context;
      // No active workspace, no membership lookup yet, or not a member: the caller comes back
      // without a workspace, which the wrapper answers with 404 (X15).
      const organizationId = (found.session as { activeOrganizationId?: unknown })
        .activeOrganizationId;
      if (typeof organizationId !== "string" || organizationId === "" || !findMembership)
        return context;
      const membership = await findMembership({ userId: found.user.id, organizationId });
      if (!membership) return context;
      return membership.role
        ? { ...context, organizationId, role: membership.role }
        : { ...context, organizationId };
    },
  };
}

async function loadAuth() {
  return (await import("./server/auth")).auth;
}

// The live resolver: user mode works today; org mode answers 404 until feature 29 passes
// findMembership.
export const sessionContextResolver = createSessionContextResolver({
  getSession: async (headers) => (await loadAuth()).api.getSession({ headers }),
});

// Origins a signed in browser may write from (AC-10): the BETTER_AUTH_URL origin plus Better Auth's
// trustedOrigins.
export async function allowedOrigins(): Promise<string[]> {
  // Read through BetterAuthOptions' shape: our config sets none today, so its own type lacks it.
  const { options } = await loadAuth();
  const trusted = (options as { trustedOrigins?: unknown }).trustedOrigins ?? [];
  if (!Array.isArray(trusted) || trusted.some((origin) => String(origin).includes("*")))
    throw new TypeError(
      "The Origin check needs trustedOrigins as a list of exact origins (no function, no wildcard)",
    );
  return [new URL(authEnv().BETTER_AUTH_URL).origin, ...(trusted as string[])];
}
