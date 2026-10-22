# 0004. Make AFT the single sign on provider (OIDC) for every app

**Date**: 2026-10-22
**Status**: Accepted

## Summary

AFT becomes the place where people sign in for every app around it: AFT's own showcase projects, each customer's dedicated instance, MCP clients such as Claude or Cursor, and apps customers build themselves. It speaks OpenID Connect (OIDC, the standard "Sign in with X" protocol) from its own address, `https://auth.remwa.tech`, using Better Auth's `oauth-provider` plugin on the stack we already run. It also lets a company sign its staff in to AFT with their own Okta or Entra ID (inbound enterprise SSO) through Better Auth's `sso` plugin. This umbrella holds the shared contract (issuer, tokens, claims, scopes, data model, build order); six child specs hold the buildable parts.

## Structure

Each child is complete enough to build from on its own. Shared rules live in this file under *Cross child contract*; a child never overrides them.

| Child | What it is | Decision it supports |
|---|---|---|
| [0001-authorization-server-core.md](0001-authorization-server-core.md) | `apps/auth` at the issuer URL: discovery, signing keys and rotation, token formats, claims, scopes, pairwise subject IDs, rate limits, security headers, sign in events, user deletion, environments | Better Auth `oauth-provider` plus `jwt`, RS256, one issuer per environment |
| [0002-sign-in-flow-and-access.md](0002-sign-in-flow-and-access.md) | What a user sees while signing in to a client: prompt handling, workspace picker, entitlement gate, no access page, consent, connected apps | Workspace chosen at sign in and put in the token; AFT refuses access without entitlement; consent for third party clients only |
| [0003-client-registry.md](0003-client-registry.md) | Every OAuth client: kinds, the internal admin API for pipelines, the developer console, CIMD and dynamic registration, redirect rules, verification, cleanup | Pipelines create first party clients; CIMD first with DCR fallback; exact redirect match |
| [0004-session-lifecycle-and-logout.md](0004-session-lifecycle-and-logout.md) | Refresh rotation and reuse detection, revocation when access changes (A6), back channel and RP initiated logout | Short JWTs, rotating refresh tokens, pushed logout to first party clients |
| [0005-main-site-as-client.md](0005-main-site-as-client.md) | Moving `remwa.tech` from local Better Auth sign in to being an OIDC client of `auth.remwa.tech` | The main site follows the same path as every project |
| [0006-enterprise-inbound-sso.md](0006-enterprise-inbound-sso.md) | Workspaces connect their own OIDC or SAML identity provider: setup, domain verification, enforcement with break glass, just in time members, role mapping | Better Auth `sso` plugin, self serve by owners, gated by an entitlement flag |

## Requirements

Requirements live in each child spec. Acceptance criteria are numbered across the whole umbrella so an ID is never ambiguous: child 0001 holds AC-1 to AC-12 and AC-63 to AC-66, 0002 holds AC-13 to AC-22 and AC-67, 0003 holds AC-23 to AC-35 and AC-68, 0004 holds AC-36 to AC-44, 0005 holds AC-45 to AC-49, 0006 holds AC-50 to AC-62 and AC-69 to AC-71. AC-63 onward were added by the cross check on 2026-10-22.

New edge case IDs defined by this umbrella (to be added to the PLAN.md catalog, see Follow-up):

- **A12** A refresh token is presented again after it was rotated → within 10 seconds return the same new refresh token with a fresh access token; after that revoke the whole grant and log `refresh_reuse`.
- **A13** A user has several workspaces that may use a client → picker shown, last choice remembered per client; none eligible → no access page.
- **A14** A client's workspace has no entitlement to the project → authorize refuses with a no access page, never a token.
- **A15** A third party client claims a trusted name or logo → consent always shows the redirect host and an "Unverified app" label until staff verify it; a changed metadata document clears the verification.
- **A16** A Client ID Metadata Document URL, or any other server side fetch (sector URI, SAML metadata, OIDC discovery and its endpoints), points at a private address, is slow, huge, or redirects → fetch refused.
- **A17** Dynamic registration is spammed → 10 per IP per hour, unused clients deleted.
- **A18** A signing key leaks → emergency rotation runbook removes it from JWKS at once and revokes refresh tokens from the exposure window.
- **A19** A first party project is down when a logout is pushed → retried 6 times over 24 hours, then `failed` with an error log and alert.
- **A20** SSO is enforced and the company IdP is down → clear error; break glass owners sign in with password plus 2FA.
- **A21** An enterprise SSO email matches an existing AFT user → linked only when the domain is verified by that workspace.
- **A22** A user's email changes at their IdP → identity keyed on the IdP subject; email updates only when verified and free.
- **A23** Two workspaces claim the same email domain → only one can verify it; routing and enforcement use verified domains only; a lapsed domain is unverified on recheck.
- **A24** An identity provider asserts an email outside the workspace's verified domains → the assertion is refused on every path, including the workspace slug path.
- **A25** SSO enforcement is switched on while members hold password sessions or long refresh tokens → those sessions and grants are revoked, and workspace claims require an SSO sign in from then on.
- **A26** The last break glass owner is removed, demoted, or turns off 2FA while enforcement is on → the change is refused.

## Decision

**Chosen option**: Option 1: Better Auth plugins end to end (see [rationale.md](rationale.md)).

AFT runs its own OIDC and OAuth 2.1 provider at `https://auth.remwa.tech` as `apps/auth`, built on `@better-auth/oauth-provider` with RS256 signed short lived JWTs, CIMD first client registration with a DCR fallback, workspace and entitlement checks at sign in, and back channel logout, and accepts company logins through `@better-auth/sso`.

**Implementation skills**: `vitest` (`antfu/skills`, `.claude/skills/vitest/`) · `react-testing-library` (`pproenca/dot-skills`, `.claude/skills/react-testing-library/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.claude/skills/playwright-best-practices/`) · `playwright-cli` (`microsoft/playwright-cli`, `.claude/skills/playwright-cli/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Authorization server | Better Auth `@better-auth/oauth-provider` (pin the same minor as `better-auth`, 1.7.12 or later) plus the `jwt` plugin | Reuses the users, sessions, and Postgres we already run, covers code plus PKCE, discovery, JWKS, refresh rotation, revocation, introspection, both logout styles, custom claims, and resource indicators. |
| Client ID Metadata Documents | Better Auth CIMD plugin, wrapped by AFT's hardened fetcher (child 0003) | The 2026-07-28 MCP authorization spec prefers CIMD; DCR stays as a fallback for older MCP clients. |
| Inbound enterprise SSO | Better Auth `@better-auth/sso` (same version line) | OIDC and SAML 2.0 per workspace, DNS domain verification, provisioning into the organization plugin, no per connection fee. |
| Workspaces and roles | Better Auth `organization` plugin (designed in scope feature 29) | The `sso` plugin integrates with it natively; this umbrella reads `organization` and `member` (roles owner, admin, member) and adds two `member` fields through `additionalFields`. |
| Deploy unit | `apps/auth`, its own Next.js app in the monorepo, using `packages/auth` | Sign in for every project survives a web app outage or deploy, and scales and rate limits on its own. |
| Issuer URLs | local `http://localhost:3001`, staging `https://auth.staging.remwa.tech`, production `https://auth.remwa.tech` | The issuer is in every token and can never change once clients trust it; one per environment keeps staging tokens out of production. |
| Signing | RS256, 90 day rotation, new key published 7 days before use, old key kept until 7 days after it stops signing | Every OIDC client library verifies RS256 (the OIDC default). |
| Token and session storage | PostgreSQL through Prisma (the plugin tables plus the AFT tables below); Redis for rate limits, the main site's server side sessions, and short caches | Same database and migration flow as the rest of auth. |
| Rate limit counters | Redis (ElastiCache from scope feature 12) as Better Auth secondary storage; the database store locally until Redis exists | Shared across `apps/auth` replicas (X7). |
| Outbound fetches | One hardened fetcher in `packages/auth` (HTTPS only, private address block after DNS resolution, size and time limits, no redirects) used by CIMD, sector URIs, logout delivery, SAML metadata, and OIDC discovery and its endpoints | One place to get SSRF right (A16). |
| First reference client | `apps/sso-example`, a minimal Next.js app using a standard OIDC library (`openid-client`), not Better Auth | Proves the contract with zero AFT internals; becomes the reference implementation for scope feature 38. |
| Auth UI | Existing shadcn `radix-lyra` components, WCAG 2.2 AA, text in a message file | Matches today's auth pages; ready for scope feature 28 translations. |

## Cross child contract

### Issuer and discovery
- `iss` is exactly the environment's issuer URL (no trailing slash). Discovery is served at `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` on the issuer origin, JWKS at the path the discovery document names. The full required metadata list is in child 0001 AC-1.
- Which app serves sign in at each slice: until T6, both the main site (local Better Auth, as today) and `apps/auth` serve sign in pages, sharing the database; `apps/auth` is the only one that issues OIDC tokens. From T6 on, `apps/auth` is the only sign in surface, once `WEB_AUTH_MODE=oidc` is on.
- Google and GitHub OAuth apps must list each issuer's callback: `http://localhost:3001/api/auth/callback/{google,github}`, `https://auth.staging.remwa.tech/api/auth/callback/{google,github}`, `https://auth.remwa.tech/api/auth/callback/{google,github}`. Email links (OTP, reset) point at the issuer origin once a flow runs on `apps/auth`. Each app has its own `BETTER_AUTH_URL`.

### Client kinds
| `kind` | Who | Link columns | Auth at token endpoint | Grant types | Consent | Entitlement gate | `sub` | Back channel logout |
|---|---|---|---|---|---|---|---|---|
| `first_party_shared` | A showcase project serving many tenants | `projectId` (or none for a platform client in `AUTH_PLATFORM_CLIENT_IDS`); `previewId` too for a preview copy | `client_secret_basic` | code, refresh | skipped | yes; platform clients by membership only | public | yes |
| `first_party_dedicated` | One customer instance | `instanceId` | `client_secret_basic` | code, refresh | skipped | yes (owning workspace only) | public | yes |
| `third_party_app` | A customer's own app | `workspaceId` | `client_secret_basic`, or none when public | code, refresh | shown | no | pairwise | no |
| `mcp_dynamic` | An MCP client (CIMD or DCR) | none | none (public, PKCE) | code, refresh | shown | no (per tool entitlements in feature 78) | pairwise | no |
| `first_party_service` | A pipeline or internal service | none | `client_secret_basic` | `client_credentials` only | none | no | none (no user) | no |

Platform clients (the main site and `apps/sso-example`) are `first_party_shared` with no `projectId`; they are gated by workspace membership only, get no `ent` claim, and a user with no workspace gets a personal workspace created at sign in (feature 29's rule), so they never reach a no access dead end.

### Grants and tokens
- Authorization code with PKCE `S256` is required for every client, confidential or public. Codes are single use and live 60 seconds; a reused code revokes the tokens issued from it.
- Each successful authorize creates one AFT grant id, stored in `OAuthGrantContext` and carried on the plugin's code, access token, and refresh token rows (by the plugin's reference field, or a mapping if the generated schema has none; confirmed at T1). Everything that needs "which workspace, which session, which client" for a token reads this row.
- Access token: a signed JWT (`typ: at+jwt`), 10 minutes; verifiers also reject any token whose `exp - iat` exceeds 600 seconds. ID token: 10 minutes. Logout token: `typ: logout+jwt`. Refresh token: opaque, issued only with `offline_access`, rotates on every use, 30 day idle limit, 90 day absolute limit (A12 reuse rule); for an SSO enforced workspace the absolute limit is the smaller of 90 days and `WorkspaceSsoPolicy.maxSessionHours`.
- AFT's own browser session on the issuer stays at 7 days (Better Auth default), capped by `maxSessionHours` for SSO enforced members.
- Resource indicators (RFC 8707): a client asking for an API sends `resource`; the access token `aud` is that resource and APIs accept only their own audience. A `resource` not registered in `oauthResource` fails with `invalid_target`. With no `resource`, `aud` is the `client_id`. If T1 finds the plugin issues opaque tokens without `resource`, AFT sets each client's default audience to its `client_id` (the plugin's valid audience setting) so every access token is a JWT; if that is impossible, `/develop` routes back here.
- A refresh may only keep or narrow the original grant's scopes and resource, never widen them.
- Introspection answers only for tokens whose `aud` or `client_id` is the calling client; anything else returns `{ "active": false }`.

### Scopes
| Scope | Adds | Allowed kinds |
|---|---|---|
| `openid` | Required. `sub`, `sid`, `auth_time`, `amr` | all user facing kinds |
| `profile` | `name`, `picture` | all user facing kinds |
| `email` | `email`, `email_verified` | all user facing kinds |
| `offline_access` | A refresh token | all user facing kinds |
| `org` | `org_id`, `org_slug`, `org_role` for the workspace chosen at sign in (consented for third party kinds) | all user facing kinds |
| `entitlements` | `ent` (`{ plan, features[] }`) for the client's project | `first_party_shared` with a `projectId`, `first_party_dedicated` |
| `<resource>:<action>` | API scopes, registered per resource server in `oauthResource` (names decided in features 75 and 77) | kinds the resource allows |
| `aft:clients.admin` | the internal admin API | `first_party_service` only |

A scope not allowed for the client's kind, or unknown, fails the request with `invalid_scope`; nothing is silently dropped. Scope names match `^[a-z][a-z0-9_.]*(:[a-z][a-z0-9_.]*)?$`.

### Claims
- ID token: `iss`, `sub`, `aud`, `exp`, `iat`, `auth_time`, `nonce` (echoed when sent), `sid`, `amr` (values `pwd`, `otp`, `google`, `github`, `sso`, `mfa`), plus the scope claims above.
- Access token: `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, `client_id`, `scope`, plus `org_id` and `org_role` when `org` was granted, and `ent` when `entitlements` was granted.
- `amr` and `auth_time` come from fields written onto the AFT session at sign in (child 0001); `sid` is the AFT session id recorded on the grant.
- Workspace claims are computed from `OAuthGrantContext` at issue and again at every refresh, so a role change shows up on the next refresh and a lost membership fails the refresh (child 0004). For an SSO enforced workspace, workspace claims are issued only when the session's `amr` includes `sso`.

### Data model target (AFT owned)
Plugin owned tables are generated with `npx auth generate` and are not redesigned here: `user`, `session`, `account`, `verification`, `organization`, `member`, `oauthClient`, `oauthAccessToken`, `oauthRefreshToken` (name as generated), `oauthConsent`, `oauthResource`, `oauthClientResource`, `jwks`, `ssoProvider`. AFT adds fields to three of them through the plugins' `additionalFields`:

- `session`: `amr` text[], `authTime` timestamptz (written at sign in by a database hook)
- `member`: `provisionedBySsoProviderId?` (set when created by SSO), `roleLocked` bool default false (set when an admin edits the role by hand)
- `ssoProvider`: `status` enum (`draft`, `active`, `disabled`) default `draft`, `lastTestedAt?`, `lastDomainCheckAt?`

| Entity | Fields | Relationships | Rules |
|---|---|---|---|
| `OAuthClientProfile` | `clientId` PK, `kind` enum, `workspaceId?`, `projectId?`, `instanceId?`, `previewId?`, `sectorId?`, `postLogoutRedirectUris` text[] default `{}`, `verified` bool default false, `verifiedAt?`, `verifiedBy?`, `verifiedMetadataHash?`, `backchannelLogoutUri?`, `lastTokenAt?`, `previousSecretHash?`, `previousSecretExpiresAt?`, `disabledAt?`, `createdAt`, `updatedAt` | 1:1 `oauthClient` (cascade); N:1 `organization` (restrict); N:1 `PairwiseSector` | Check constraint per kind (table above). Unique (`instanceId`) and unique (`previewId`) where `disabledAt` is null. `sectorId` never changes after creation. `projectId` and `instanceId` gain foreign keys when features 31 and 64 add those tables. Soft delete via `disabledAt`, purged 90 days later. |
| `OAuthGrantContext` | `grantId` PK (AFT generated at authorize), `clientId`, `userId`, `sid`, `organizationId?`, `scopes` text[], `resource?`, `createdAt`, `revokedAt?` | N:1 `oauthClient`, `user`, `organization` (all cascade) | One row per authorize. Index (`userId`, `clientId`), (`sid`), (`organizationId`, `userId`). |
| `ClientWorkspaceChoice` | `userId`, `clientId`, `organizationId`, `updatedAt` | N:1 each (cascade) | Unique (`userId`, `clientId`). Preselects the picker. |
| `PairwiseSector` | `id` PK, `identifier` unique | 1:N profiles, 1:N subjects | Third party kinds only. |
| `PairwiseSubject` | `id` PK, `sectorId`, `userId`, `sub` unique, `createdAt` | N:1 sector, N:1 `user` (cascade) | Unique (`sectorId`, `userId`). |
| `WorkspaceSsoPolicy` | `organizationId` PK, `enforced` bool default false, `defaultRole` enum (`member`, `admin`) default `member`, `roleMappingRules` jsonb default `[]`, `maxSessionHours` int default 168, `updatedBy`, `createdAt`, `updatedAt` | 1:1 `organization` (cascade) | `maxSessionHours` between 1 and 2160. Mapping never grants `owner`. |
| `BreakGlassUser` | `organizationId`, `userId`, `createdAt`, `createdBy` | N:1 `organization`, N:1 `user` (both cascade) | PK (`organizationId`, `userId`). The user must be an owner with 2FA. While enforced, at least one row must stay valid (A26). |
| `LogoutDelivery` | `id` PK, `clientId`, `userId`, `grantId`, `sid?`, `logoutTokenJti` unique, `status` enum (`pending`, `delivered`, `failed`), `attempts` int default 0, `nextAttemptAt`, `lastError?`, `createdAt`, `deliveredAt?` | N:1 `oauthClient`, `user`, `OAuthGrantContext` (cascade) | Index (`status`, `nextAttemptAt`). |
| `SignInEvent` | `id` PK, `occurredAt`, `type` enum (`authorize`, `consent`, `token`, `refresh`, `refresh_reuse`, `revoke`, `logout`, `sso_login`, `admin_client`, `client_verify`, `key_admin`, `sso_admin`, `account_delete`), `result` enum (`success`, `failure`), `reasonCode?`, `userId?`, `organizationId?`, `clientId?`, `ssoProviderId?`, `actor?` (operator or service identity for admin types), `ip`, `ipTruncatedAt?`, `userAgent` | N:1 user, organization, client (all SET NULL) | Never stores tokens, codes, or secrets. IP truncation keeps an IPv4 /24 or IPv6 /48. Indexes (`userId`, `occurredAt`), (`clientId`, `occurredAt`), (`organizationId`, `occurredAt`). |

### Shared interfaces
- `checkProjectAccess(orgId, clientId): Promise<{ allowed: boolean; plan?: string; features: string[] }>` in `packages/auth`. Until scope feature 37 ships, it reads `AUTH_ENTITLEMENT_ALLOWLIST`, shaped `{ "<clientId>": { "ownerOrgId"?: "<orgId>", "orgs": { "<orgId>": { "plan": "<plan>", "features": ["..."] } } } }`; for a dedicated client, only `ownerOrgId` can be allowed. Platform clients skip it. Feature 37 swaps the body, never the signature.
- `checkWorkspaceFeature(orgId, feature): Promise<boolean>` in `packages/auth`, used for `sso.inbound`. Until feature 37 it reads `AUTH_SSO_INBOUND_ALLOWLIST`.
- `recordSignInEvent(event)` in `packages/auth`: the only writer of `SignInEvent`.
- `revokeGrants(filter)` in `packages/auth`, where `filter` has at least one of `userId`, `organizationId`, `clientId`, `sid` (an empty filter throws): revokes matching refresh tokens and consents, marks grants `revokedAt`, and queues back channel logouts in one transaction. Called on AFT sign out (by `sid`), AFT session expiry or deletion (by `sid`, from the daily sweep), user deletion (by `userId`), connected app revoke, member removal or downgrade, SSO enforcement switch on, and later by features 37, 41, and 44.
- `safeFetch(url, options)` in `packages/auth`: the hardened fetcher (A16).

### Build order (Tracer Bullet)
Each slice is thin and end to end, and ships to staging behind `AUTH_OIDC_PROVIDER_ENABLED`.

1. **T1, thin thread** (child 0001 core, 0003 seed script, 0002 with one workspace): `apps/auth` locally then on staging, one seeded client for `apps/sso-example`, code plus PKCE, RS256 ID and access tokens with `org_id`, the allow list gate, sign in events, security headers. Migration 1: plugin tables and `session` fields, `OAuthClientProfile`, `OAuthGrantContext`, `SignInEvent`.
2. **T2, lifecycle and operations** (child 0004, plus 0001 keys, rate limits, retention sweep, user deletion): refresh rotation and reuse, `revokeGrants`, back channel and RP initiated logout, key rotation scripts and reminder, Redis rate limits. Migration 2: `LogoutDelivery`.
3. **T3, access** (child 0002 in full): prompt handling, workspace picker, no access page, `ClientWorkspaceChoice`. Migration 3.
4. **T4, provisioning** (child 0003 admin API): `client_credentials`, the admin API, secrets into Secrets Manager, rotation overlap, `previewId`. Migration 4: the `OAuthClientProfile` secret and preview columns.
5. **T5a, MCP** (children 0002 consent, 0003 CIMD and DCR, 0001 pairwise): Migration 5: `PairwiseSector`, `PairwiseSubject`.
6. **T5b, customer apps** (child 0003 console, 0002 connected apps).
7. **T6, main site** (child 0005), after T4 and with Redis available.
8. **T7, enterprise SSO** (child 0006). Migration 6: `ssoProvider` and `member` fields, `WorkspaceSsoPolicy`, `BreakGlassUser`.

**Production enable gate** (all must be true before `AUTH_OIDC_PROVIDER_ENABLED=true` in production): T1 to T4 done; key rotation and emergency scripts drilled on staging; rate limits on Redis; retention and session expiry sweeps running; alerts from rationale wired (feature 23) or, until then, a daily log review recorded in MEMORY.md; `auth.remwa.tech` DNS and certificate live.

### Prerequisites (not built here)
- Scope feature 4 (monorepo migration) before T1, so `apps/auth` and `packages/auth` exist.
- Scope feature 29 (organization plugin, personal workspaces) before T1 ships with `org` claims; T1 may run with one personal workspace per user if 29 is still in progress.
- Spec 0003 (Route 53) live, plus records and certificates for `auth.staging.remwa.tech` and `auth.remwa.tech` (scope feature 13 later slices).
- Hosting for staging (scope features 10, 11, 18) before T1 reaches staging; T1 runs locally first.
- Scope feature 12 (Redis) before T2 reaches production and before T6; scope feature 46 (2FA) before T7 enforcement; scope feature 20 (previews) before the preview hook in child 0003.

## Consequences

**Positive**:
- One sign in and one user base for every AFT product, dedicated instance, agent, and partner app.
- Projects verify tokens locally with JWKS, so AFT is not on every request's hot path.
- MCP clients connect with the current spec's preferred registration (CIMD) and still work with older ones (DCR).
- Enterprise customers get SSO and enforcement without a per connection vendor bill.

**Negative / tradeoffs**:
- AFT now runs an identity provider at GA: key rotation, incident runbooks, and abuse of open registration become our job.
- Access stays valid up to 10 minutes after revocation; projects needing instant cutoff must call introspection.
- The plugins' table names and options can change between minors (the 1.7 `oauthApplication` to `oauthClient` rename shows this); every Better Auth upgrade needs a schema diff review.
- `apps/auth` is a second deployable that must stay highly available; if it is down, nobody can start a new session anywhere.
- The main site moves from local sign in to OIDC and gains server side sessions in Redis, a migration with its own risk (child 0005 uses a flag and a rollback path).
- `AUTH_PAIRWISE_SALT` can never be rotated without changing every third party user ID; it is permanent.

**Neutral**:
- The umbrella depends on five unbuilt features (4, 12, 20, 29, 37). The allow list stubs keep T1 real until 37.
- Six migrations, one per slice that needs schema.

## Follow-up

- [x] Engineer approved (2026-10-22, on accepting the spec) the additions made after the data model confirmation (initially four, then more from the cross check): `OAuthGrantContext` (now keyed on an AFT grant id with `sid`, `clientId`, scopes, resource); the `OAuthClientProfile` columns `previousSecretHash`, `previousSecretExpiresAt`, `previewId`, `postLogoutRedirectUris`, `verifiedMetadataHash`; the fifth kind `first_party_service`; `ssoProvider` `status`, `lastTestedAt`, `lastDomainCheckAt`; `session` `amr`, `authTime`; `member` `provisionedBySsoProviderId`, `roleLocked`; `WorkspaceSsoPolicy.maxSessionHours`; `BreakGlassUser` replacing `breakGlassUserIds`.
- [ ] Add A12 to A26 to the edge case catalog in PLAN.md (through `/scope` or an `/architect` update; PLAN.md is not edited here).
- [x] Scope: enrolled the slices T1 to T7 as features 133 to 140 in the identity epic, linked to these children (2026-10-22).
- [ ] Scope feature 29 spec must adopt the Better Auth organization plugin, roles owner, admin, member, and a personal workspace for every user, or route back here.
- [ ] Scope feature 64 spec must define how a dedicated instance's own end users relate to the owning workspace (members only, or a separate tenant user list); until then only owning workspace members can sign in.
- [ ] Scope feature 38 spec should cite child 0001's contract and `apps/sso-example` as the reference implementation.
- [ ] Scope feature 13: add `auth` and `auth.staging` records and ACM certificates.
- [ ] Inbound SCIM provisioning (automatic deprovisioning from the IdP) as its own feature after T7.
- [ ] Verify at T1 build time, routing back here if any is missing: pairwise `sub` override; RFC 9207 `iss` in the authorization response; RS256 key config in the `jwt` plugin; JWT access tokens without `resource`; back channel logout `sid` support; how the AFT grant id rides on plugin rows; whether the plugin's organization aware hooks and reference field could replace `OAuthGrantContext` (if so, update this spec rather than building both).
- [ ] Verify at T2: the plugin can return the same rotated refresh token within the grace window; at T4: the plugin accepts a second secret hash during the overlap (else a token endpoint hook checks `previousSecretHash`).
- [ ] `docs/.agent-cache/research/sso-architecture.md` (landscape check, fetched 2026-10-22) is not gitignored; decide whether research caches are committed.

## Rationale

Reasoning, options, landscape evidence, cross check record, and references: see [rationale.md](rationale.md).
