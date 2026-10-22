# 0004. Rationale: AFT as the single sign on provider

Back to the [build spec](index.md).

## Context

> ⚠️ Premise note: this topic spans seven independently buildable decisions (the authorization server, the sign in flow, the client registry, session lifecycle and logout, moving the main site, inbound enterprise SSO, and the MCP registration rules). It is written as one umbrella with six child specs so each part can be built, verified, and shipped on its own, while the shared contract (issuer, tokens, claims, scopes) is decided once. It also rests on four decisions that have no spec yet: the monorepo layout (scope feature 4), the workspace model (feature 29), entitlements (feature 37), and Redis (feature 12). Each is stated as an explicit assumption in the index Prerequisites, and the entitlement dependency is isolated behind one interface so the first slice does not wait for billing.

AFT sells showcase projects as shared SaaS, as dedicated instances per customer, and through APIs and MCP. Every one of those surfaces needs to know who the user is and which workspace (tenant) they act for. Today sign in exists only inside the main Next.js app (Better Auth with email, OTP, Google, GitHub). Nothing outside it can trust that identity. PLAN.md already names "SSO via AFT as OIDC provider" as part of the project integration contract (scope feature 38) and asks that it reuse Better Auth plugins rather than custom code.

The forces are unusually wide for one decision. First party projects want zero friction and a shared user ID. Dedicated instances live on their own domains, so cookies cannot be shared and every instance is its own client. MCP clients (Claude, Cursor, and others) register themselves at runtime, and the MCP authorization spec revision of 2026-07-28 says how: OAuth 2.1, discovery, resource indicators, and Client ID Metadata Documents preferred over dynamic registration, which it now calls deprecated. Customers' own apps are third parties that need consent and privacy protection. Enterprise customers want their staff to use the company login and want to force it.

The constraints: a solo engineer with AI agents, so anything that adds a second user store or a separate Java service is a real operating cost; GA tier for auth, so key rotation, revocation, logout, and abuse must be designed, not left for later; AWS with EKS as the target; GDPR applies (personal data in tokens, sign in logs with IP addresses, data held for third parties). Compliance scope: GDPR. Audit logging of sign in and client administration is mandatory, not optional.

Not deciding has a concrete cost. Feature 38 cannot define its contract, feature 39 cannot sign tenants in, feature 77 (MCP) cannot authenticate, and each project would otherwise invent its own sign in, which becomes impossible to unify once customers exist. The issuer URL also appears in every token ever issued, so choosing it late or wrong breaks every integration built before the change.

## Options considered

Compared as full stacks for both directions: AFT as provider (outbound) and AFT accepting company logins (inbound).

### Option 1: Better Auth plugins end to end

`@better-auth/oauth-provider` plus `jwt` for the provider, the CIMD plugin for MCP registration, `@better-auth/sso` for inbound OIDC and SAML, the `organization` plugin for workspaces, all inside a dedicated `apps/auth` on the existing Postgres.

**Pros**:
- One user store, one session model, one database, one migration flow; the existing sign in methods and fixes (spec 0002) carry over.
- Covers every protocol feature this design needs: code plus PKCE, discovery, JWKS, rotation, revocation, introspection, both logout styles, custom claims, resource indicators, DCR, CIMD.
- No per connection or per user fees; inbound SSO cost does not grow with enterprise customers.
- TypeScript in the same monorepo, so agents and tests work the same way as everywhere else.

**Cons**:
- Young plugins: the 1.7 line renamed tables (`oauthApplication` to `oauthClient`) and the legacy OIDC plugins had several CVEs in 2026. Upgrades need care.
- Not OpenID certified as far as was checked; some edge features (pairwise `sub`, RFC 9207 `iss`) are unconfirmed and may need small extensions.
- We operate the identity provider ourselves: key rotation, incidents, and availability are ours.

### Option 2: Keycloak for both directions

Keycloak on EKS as the identity provider and SAML or OIDC broker, with Better Auth reduced to a client of it or removed.

**Pros**:
- Mature, widely deployed, full OIDC and SAML in both directions, certified, Apache 2.0.
- Admin console, identity brokering, and user federation out of the box.

**Cons**:
- A second user store: today's Better Auth users, sessions, OTP flow, and social accounts must move or be synced, which is a migration of the existing auth (feature A).
- A JVM service with its own database, clustering, and upgrade cadence for one engineer to run highly available.
- Theming and flows live in Keycloak templates, apart from the app's design system and tests.

### Option 3: Zitadel (self hosted or cloud)

Zitadel as a modern multi tenant identity platform with OIDC, SAML, and organization concepts built in.

**Pros**:
- Multi tenancy and organizations are first class, close to AFT's workspace model.
- Hosted option removes the operating load.

**Cons**:
- Also a second user store and a migration of existing auth.
- AGPL 3.0 for self hosting; cloud pricing ties a core cost to a vendor.
- Less control over the sign in UI and claims than an in app library.

### Option 4: Managed services (Amazon Cognito as provider plus WorkOS for inbound)

Cognito user pools issue tokens for all clients; WorkOS handles enterprise SSO connections and an admin portal.

**Pros**:
- AWS native and managed; no keys or token storage to operate.
- WorkOS's admin portal lets customers configure SSO themselves and handles many IdP quirks.

**Cons**:
- Two vendors plus the existing Better Auth, so three identity systems to reconcile.
- Cognito has limited support for dynamic registration and CIMD and for per client custom claims (unconfirmed for 2026), which MCP needs.
- WorkOS is priced per connection (about $125 a month each, unconfirmed), which grows with every enterprise customer.

## Rationale

The deciding force is that AFT already has a working Better Auth installation with users, sessions, social sign in, and fixes just shipped in spec 0002, and a solo engineer cannot afford a second identity system. Options 2, 3, and 4 all add a second user store and a migration of the existing auth before the first project can sign in. Option 1 adds plugins to the store we have, which is exactly what PLAN.md asked for. The landscape check confirmed that `@better-auth/oauth-provider` 1.7.12 covers each protocol feature the four kinds of client need, and that the CVEs of 2026 hit the legacy plugins it replaces, not this one (basis: AGENTS.md stack, PLAN.md critical files note, Better Auth oauth-provider docs).

The MCP requirement pushed two specific calls. Registration is CIMD first with DCR only as a fallback, because the 2026-07-28 MCP spec makes CIMD the SHOULD and DCR deprecated, while some shipped clients still only know DCR. Access tokens are short lived signed JWTs bound to a resource with RFC 8707, because MCP servers must accept only tokens for their own audience and must verify without calling AFT on every tool call (basis: MCP authorization spec 2026-07-28, OAuth 2.1, RFC 8707, RFC 9068 JWT access token profile).

Running the provider as its own `apps/auth` at `auth.remwa.tech` rather than inside the main app follows from blast radius: every project's sign in depends on it, so a marketing site deploy or outage must not take sign in down, and the issuer origin must outlive any refactor of the web app. Making the main site a plain OIDC client (child 0005) means the contract every project depends on is exercised by AFT's own busiest surface every day (basis: strangler pattern for the main site move, separation of the issuer origin). Inbound SSO through the `sso` plugin keeps enterprise users as ordinary Better Auth users who then sign in to projects like anyone else, so the outbound contract does not change (basis: Better Auth sso plugin docs).

### Decisions made by the architect (RECOMMEND items)

- **`amr` claim**: include `amr` values so a project can ask for step up (for example require `mfa` for billing). Runner up: `acr` levels, which need a policy catalog we do not have yet.
- **PKCE for confidential clients too**: required for all, as OAuth 2.1 does. Runner up: optional for confidential clients, rejected because it weakens code injection protection.
- **Code lifetime 60 seconds, single use, reuse revokes**: OAuth 2.1 guidance. Runner up: 10 minutes, rejected as needlessly long.
- **JWKS caching**: `Cache-Control: max-age=600` so projects pick up an emergency rotation within 10 minutes (A18). Runner up: one hour, rejected for slower incident response.
- **Private key protection**: the `jwt` plugin's encryption of private keys at rest with `BETTER_AUTH_SECRET`, with the secret only in Secrets Manager (feature 14). Runner up: KMS signing, rejected by the engineer for cost and custom code.
- **Feature flag**: `AUTH_OIDC_PROVIDER_ENABLED` env flag until scope feature 21 ships, then moved to the flag service. Runner up: wait for feature 21, rejected because it blocks staging.
- **A fifth client kind `first_party_service`**: the admin API's `client_credentials` callers need a kind with no user, no consent, and no `sub`; the confirmed four kinds did not cover it. Flagged for the engineer.
- **`AUTH_PLATFORM_CLIENT_IDS`**: the main site and `apps/sso-example` are first party but serve no single project; an explicit list allows their null `projectId` rather than weakening the check constraint.
- **CORS**: token, userinfo, revocation, and JWKS answer CORS for the exact redirect origins of public clients only; authorize is a browser redirect and needs none.
- **Observability**: structured logs with `clientId`, `kind`, `result`, `reasonCode`, never token values; metrics for authorize and token success rates, refresh reuse count, logout delivery failures, CIMD fetch failures; alerts on a token error rate over 5 percent for 10 minutes, any `failed` logout delivery, and any `refresh_reuse` burst over 20 in 5 minutes. Wired into features 22 and 23 when they exist; logs only until then.

## Cross check record (2026-10-22)

A read only review on a different model (Sonnet) found 32 issues (9 high, 21 medium, 2 low). The engineer chose to apply every recommended fix. The main changes:

- Every authorize now creates an AFT grant record (`OAuthGrantContext`, keyed on an AFT grant id with `sid`, client, workspace, scopes, resource), so first party clients that skip consent and refresh tokens still have a grant for logout and revocation.
- The main site keeps tokens in Redis server side sessions with single flight refresh, because a token cookie breaks in Server Components, can pass 4 KB, and parallel refreshes would trip reuse detection.
- SSO enforcement is tied to how the session signed in (`amr` contains `sso`), revokes non SSO sessions when switched on, and caps sessions with `maxSessionHours`; break glass users moved to their own table with guards.
- Every server side fetch goes through one hardened `safeFetch`, including OIDC discovery and its endpoints for inbound SSO; SAML is hardened (no IdP initiated, request binding, no external entities).
- Security headers (`frame-ancestors 'none'`), a logout confirm page, introspection limited to own tokens, a distinct `logout+jwt` type, an access token lifetime ceiling at verifiers, and a full discovery metadata list.
- Precise rules where the builder would otherwise guess: scope and grant type matrix per kind, `invalid_target`, refresh narrowing only, prompt and `max_age` table, pairwise sectors per DCR client and immutable sectors, trusted proxy depth for rate limits, preview clients, post logout URIs, admin host allow list, secret then rows ordering, user deletion cleanup, audit event types, IP truncation sizes, domain rechecks, role mapping syntax with `roleLocked`.
- Untestable criteria rewritten for injected clocks, a fake DNS resolver, manifest tests, and log assertions; the preview criterion is deferred until feature 20.
- Build order: key operations, rate limits, and sweeps moved into T2; T5 split into T5a (MCP) and T5b (customer apps); T6 after T4 and Redis; a production enable gate added.
- Considered and not taken (finding 30): keeping the main site on local sign in with a shared cookie, public `sub` for third parties, deferring customer apps, OIDC only inbound SSO. These reverse choices the engineer made in the design conversation. Whether the plugin's own hooks could replace `OAuthGrantContext` is checked at T1.

## Landscape evidence (fetched 2026-10-22)

Summary of the check run during the design conversation; the full notes are in `docs/.agent-cache/research/sso-architecture.md`.

- `@better-auth/oauth-provider`, `@better-auth/sso`, and `better-auth` were all at 1.7.12 on npm, none deprecated. The project is on 1.7.11; bump all three together.
- The older `oidcProvider` plugin and the in core MCP plugin are superseded; their 2026 advisories (CVE-2026-53512, CVE-2026-67336, CVE-2026-67333) do not apply to `oauth-provider` according to advisory summaries (not fetched).
- The plugin's docs name `oauthResource`, `oauthClientResource`, and `oauthConsent`; the upgrade guide names `oauthClient` and `oauthAccessToken`. Authorization code and refresh token table names were not confirmed; `npx auth generate` at T1 is the source of truth.
- The `sso` plugin supports OIDC and SAML 2.0 as service provider, DNS TXT domain verification with one week tokens, and organization provisioning with a default role and a `getRole` hook. It does not accept pending invitations.
- MCP authorization 2026-07-28: OAuth 2.1 required; RFC 8414 or OIDC discovery required; RFC 9728 protected resource metadata on MCP servers; CIMD SHOULD; DCR MAY and deprecated; RFC 8707 `resource` MUST; RFC 9207 `iss` SHOULD.
- Not confirmed: Keycloak, Zitadel, Cognito, WorkOS, and panva `oidc-provider` details beyond search snippets; WorkOS per connection pricing.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md`: stack (Better Auth 1.7, Prisma 7, Postgres), Tracer Bullet build approach, AWS rules
- `PLAN.md`: feature 18 contract ("SSO via AFT as OIDC provider"), critical files note (reuse Better Auth plugins), edge case catalog X and A
- `docs/scope/identity.md`, `docs/scope/delivery.md`, `docs/scope/mcp.md`: features 29, 37, 38, 39, 41, 44, 46, 48, 75, 77, 78
- Spec 0002 (auth defect fixes): provider resolver and same origin client rules that `apps/auth` inherits
- Spec 0003 (Route 53): the zone that will hold `auth` and `auth.staging`

**Practices & standards**:
- OAuth 2.1 (draft), PKCE S256, exact redirect matching, loopback redirects for native apps (RFC 8252)
- OpenID Connect Core and Discovery; pairwise subject identifiers; RP initiated logout; back channel logout
- RFC 7591 dynamic client registration; Client ID Metadata Documents draft; RFC 8707 resource indicators; RFC 9068 JWT access tokens; RFC 7009 revocation; RFC 7662 introspection; RFC 9207 issuer identification
- Refresh token rotation with reuse detection; zero downtime key rotation (X12)
- Transactional outbox for logout delivery (X4); SSRF defenses for server side fetches
- Strangler pattern for moving the main site; GDPR data minimization and retention

**Links** (web verified during the design conversation):
- Better Auth OAuth provider plugin: https://better-auth.com/docs/plugins/oauth-provider
- Better Auth SSO plugin: https://better-auth.com/docs/plugins/sso
- npm `@better-auth/oauth-provider` latest: https://registry.npmjs.org/@better-auth/oauth-provider/latest
- npm `@better-auth/sso` latest: https://registry.npmjs.org/@better-auth/sso/latest
- npm `better-auth` latest: https://registry.npmjs.org/better-auth/latest
- MCP authorization spec, 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
