# 0004.0006. Inbound enterprise SSO for workspaces

Part of [0004, AFT as the single sign on provider](index.md). Shared rules are in the index *Cross child contract*.

## Summary

A company on a business plan can connect its own identity provider (Okta, Microsoft Entra ID, Google Workspace, any OIDC or SAML 2.0 provider) to its AFT workspace. After proving it owns its email domain, staff who type a company email are sent to the company login, join the workspace automatically with a mapped role, and can be forced to use it. While forced, the workspace is reachable only through an SSO sign in, and sessions are capped. At least one owner keeps a password plus 2FA way in, so a broken provider never locks the company out. Once signed in, these users reach every project through the same OIDC flow as everyone else.

## Requirements

**User stories**:
- As a company IT admin, I want my staff to use our Okta login for AFT, so that joining and leaving is controlled in one place.
- As a workspace owner, I want to require company login for our workspace, so that nobody uses a forgotten personal password.
- As a staff member, I want to type my work email and be sent to the right login, so that I do not need to know what SSO is.

**Acceptance criteria**:
- **AC-50**: The SSO settings page and its actions are available only when `checkWorkspaceFeature(orgId, "sso.inbound")` allows; otherwise the page shows an upgrade message and the actions return `403` with `plan_required`.
- **AC-51**: Owners and admins can create an OIDC connection (issuer URL; client ID; client secret) or a SAML connection (metadata XML upload, or a metadata URL); members get `404` (X15). Every outbound fetch for a connection (the OIDC discovery document, and the `jwks_uri`, `token_endpoint`, and `userinfo_endpoint` it names; SAML metadata URLs) goes through `safeFetch`; the discovery document's `issuer` must equal the configured issuer. A new connection starts as `draft`.
- **AC-52**: "Test sign in" runs a full sign in against the provider without creating users or members and shows the claims received; only after a successful test can the connection move to `active`, recording `lastTestedAt`; any later change to its issuer, client credentials, certificate, or metadata returns it to `draft`.
- **AC-53**: An owner adds a domain and gets a TXT record `_aft-verification.<domain>` with a token valid 7 days; "Verify" checks DNS (through an injectable resolver, faked in tests) and marks it verified; a domain already verified by another workspace, or one in the blocked public domain list file `packages/auth/src/sso/public-email-domains.txt`, cannot be added (A23).
- **AC-54**: On AFT's sign in page, an email whose domain is verified and linked to an `active` connection sends the user to that provider; any other email gets the normal methods; a "Sign in with SSO" option accepts a workspace slug for users without a matching domain.
- **AC-55**: On every SSO path (domain or slug), an assertion whose email domain is not verified by that workspace is refused with a clear message (A24). The first accepted SSO sign in creates the user (`email_verified` true) and a membership with `provisionedBySsoProviderId` set and the role from the first matching mapping rule, else `defaultRole`; no rule can grant `owner`.
- **AC-56**: Mapping rules are an ordered list validated with zod on save: `claim` is a JSON pointer into the OIDC claims or the SAML attribute map (keyed by attribute name), `equals` is a string that matches a string claim exactly or is contained in an array claim, and `role` is `member` or `admin`. Rules apply on every SSO sign in to members with `provisionedBySsoProviderId` set and `roleLocked` false, never to owners; an admin editing a member's role by hand sets `roleLocked` true.
- **AC-57**: An SSO sign in whose email matches an existing AFT user links to that user only when the email's domain is verified by this workspace, and emails the user a notice; otherwise it refuses with a message to sign in the usual way and ask their admin to verify the domain (A21).
- **AC-58**: The SSO identity is keyed on (connection, provider `sub`); name and picture update on every sign in; the email updates only when the new domain is verified by the workspace and no other AFT user holds it, else the change is shown to workspace admins (A22).
- **AC-59**: An owner can turn enforcement on only when the workspace has a verified domain, an `active` connection, and at least one `BreakGlassUser` who is an owner with 2FA enrolled; while enforced, users with a matching email cannot use password, OTP, or social sign in and see "Your company requires sign in with <provider name>", while break glass users can.
- **AC-60**: When the provider does not answer within `AUTH_SSO_PROVIDER_TIMEOUT_MS` or returns an error, the user sees "Your company sign in (<provider name>) is not responding, try again or contact your admin", existing sessions keep working, and break glass owners can sign in and turn enforcement off (A20).
- **AC-61**: An `active` connection cannot be deleted or disabled while enforcement is on (`409`); removing a member in AFT calls `revokeGrants({ userId, organizationId })`; an SSO response carrying an error (the provider refused the user) creates no session and writes a failed `sso_login` event.
- **AC-62**: SAML responses must be signed, IdP initiated sign in is refused (only responses to an AFT request are accepted), and `InResponseTo`, `Destination`, `Audience`, and the validity window (60 seconds of clock skew) are checked; a replayed or stale assertion, or XML with external entities, is rejected; every SSO attempt and every settings change writes an `sso_login` or `sso_admin` event with `ssoProviderId`, `result`, and `reasonCode` on failure.
- **AC-69**: While a workspace is enforced, AFT issues that workspace's `org_*` claims (and lists it in the picker) only for a session whose `amr` includes `sso`, so members with other email domains and older password sessions must sign in with SSO to act in it; switching enforcement on calls `revokeGrants({ organizationId })` for every non break glass member; grants and AFT sessions for SSO members end after `maxSessionHours` (default 168) (A25).
- **AC-70**: While enforced, removing or demoting the last valid break glass owner, or that owner turning off 2FA, is refused with `409` and a message naming the rule (A26).
- **AC-71**: A daily job rechecks the TXT record of every verified domain whose `lastDomainCheckAt` is older than 30 days; a domain whose record is gone for two checks in a row is unverified, enforcement for it stops, and the owners are emailed (A23).

## Feature design

**Data model sketch**: plugin `ssoProvider` (domain verification fields, plus `status`, `lastTestedAt`, `lastDomainCheckAt` through `additionalFields`); `member` fields `provisionedBySsoProviderId`, `roleLocked`; `WorkspaceSsoPolicy` with `maxSessionHours`; `BreakGlassUser`; `account` rows with the connection as provider and the provider `sub` as account id; `verification` for SAML replay protection.

**State transitions**: connection `draft` → `active` (after a successful test) → `disabled`; any change to its settings → `draft`. Domain `pending` → `verified` → `unverified` (two failed rechecks). Policy: `enforced` false ↔ true (on only under the AC-59 conditions; off always allowed for owners).

**API surface** (pages and server actions on `apps/auth`):
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/settings/workspaces/{orgId}/sso` | GET | none | connections, domains, policy | owner or admin | 403 `plan_required`, 404 |
| `.../sso/connections` | POST | `type` (`oidc`, `saml`), issuer or metadata, client credentials, display name | connection in `draft` | owner or admin | 403, 404, 422 |
| `.../sso/connections/{id}/test` | POST | none | redirect to provider; result page with claims | owner or admin | 422 |
| `.../sso/connections/{id}` | PATCH, DELETE | settings, `status` | connection | owner or admin | 409 while enforced |
| `.../sso/domains` | POST | `domain` | TXT name and value | owner | 409 taken, 422 public domain |
| `.../sso/domains/{domain}/verify` | POST | none | verified or not yet | owner | 404 |
| `.../sso/policy` | PUT | `enforced`, `defaultRole`, `roleMappingRules`, `maxSessionHours` | policy | owner | 409 conditions unmet, 422 |
| `.../sso/break-glass` | POST, DELETE | `userId` | list | owner | 409 (AC-70), 422 not an owner with 2FA |
| SSO sign in start (plugin) | GET, POST | `email` or `orgSlug` | redirect to provider | none | 404 no connection, 429 |
| SSO callback and SAML ACS (plugin) | GET, POST | provider response | AFT session | none | sign in error page |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| plan gate | allowed | `checkWorkspaceFeature(orgId, feature)`; until feature 37, `AUTH_SSO_INBOUND_ALLOWLIST` |
| routing | connection for an email | verified domain on `ssoProvider` with `status` `active` |
| domain check | verified domains | `ssoProvider` domain verification state for this workspace |
| JIT | role | `WorkspaceSsoPolicy.roleMappingRules` against the claims, else `defaultRole` |
| mapping scope | which members | `member.provisionedBySsoProviderId` not null and `member.roleLocked` false |
| enforcement | session used SSO | `session.amr` contains `sso` |
| enforcement | break glass | `BreakGlassUser` joined to `member.role = owner` and the 2FA enrollment from feature 46 |
| session cap | hours | `WorkspaceSsoPolicy.maxSessionHours` |
| error message | provider name | display name entered at setup |
| public domains | blocked list | `packages/auth/src/sso/public-email-domains.txt`, versioned in the repo |
| recheck | due domains | `ssoProvider.lastDomainCheckAt` |

**Key invariants**:
- An enforced workspace always has at least one valid break glass owner with 2FA.
- A domain is verified by at most one workspace.
- No mapping or provisioning path grants `owner`.
- An SSO identity is never accepted for an email outside the workspace's verified domains.
- While enforced, no token carries that workspace's claims unless the session used SSO.

**Security model**: only owners and admins of the workspace manage connections; only owners manage domains, the policy, and break glass users. Provider client secrets and SAML certificates are stored encrypted by the plugin and never shown again. All outbound fetches use `safeFetch`; XML parsing has external entities off. GDPR: only the claims needed for the profile and role mapping are kept.

**Configuration required**:
- `AUTH_SSO_INBOUND_ALLOWLIST`: workspaces allowed inbound SSO until feature 37
- `AUTH_SSO_PROVIDER_TIMEOUT_MS`: default `10000`

**Critical test scenarios**:
- Plan gate on and off, verifies **AC-50**
- OIDC and SAML connections against test providers (a mock OIDC provider and a SAML test IdP); discovery naming a private `jwks_uri` is refused; issuer mismatch refused; test sign in and activation; an edit returns to draft, verifies **AC-51**, **AC-52**
- Domain verification with a fake resolver, a taken domain, a listed public domain, verifies **AC-53**
- Email routing to the provider and slug fallback, verifies **AC-54**
- Slug path with an unverified email domain refused; first sign in creates member with mapped role; owner never granted, verifies **AC-55**
- JSON pointer and array contains rules; a role locked member is not overwritten, verifies **AC-56**
- Clash with verified and unverified domains, verifies **AC-57**
- Email change at the provider, verifies **AC-58**
- Enforcement blocks password for the domain, allows break glass; provider timeout message, verifies **AC-59**, **AC-60**
- Delete while enforced returns 409; removal revokes grants; provider error creates no session, verifies **AC-61**
- Unsigned, IdP initiated, replayed, wrong audience, and XXE SAML responses rejected, verifies **AC-62**
- Enforcement on revokes password sessions; a password session gets no workspace claims; `maxSessionHours` ends a grant, verifies **AC-69**
- Last break glass owner removal and 2FA disable refused, verifies **AC-70**
- Two failed rechecks unverify a domain with an injected clock, verifies **AC-71**

## Build plan

1. T7: add `@better-auth/sso` (same version line), migration 6 (`ssoProvider` and `member` fields, `WorkspaceSsoPolicy`, `BreakGlassUser`), `checkWorkspaceFeature` with the allow list stub; satisfies **AC-50**
2. T7: settings page for OIDC connections through `safeFetch`, test sign in, activation, draft on edit; satisfies **AC-51**, **AC-52**
3. T7: domains, verification, the public domain list, the daily recheck; email routing on the sign in page; satisfies **AC-53**, **AC-54**, **AC-71**
4. T7: JIT provisioning with the verified domain rule, mapping rules with `roleLocked`, clash and email change rules, provider error handling; satisfies **AC-55**, **AC-56**, **AC-57**, **AC-58**, **AC-61**
5. T7: SAML connections with signature, replay, and request binding rules; satisfies **AC-51**, **AC-62**
6. T7 (after feature 46): enforcement with break glass guards, `amr` gated workspace claims, revocation on enable, session cap, provider failure handling, delete guard; satisfies **AC-59**, **AC-60**, **AC-61**, **AC-69**, **AC-70**

## Rationale (short)

Inbound SSO makes enterprise staff ordinary AFT users, so every project sees them through the same OIDC contract with no extra work. Domain verification is the line between convenience and account takeover: routing, linking, provisioning, and enforcement all depend on it, on every path. Enforcement is tied to how the session signed in (`amr`), not just to the email typed on the sign in page, so it cannot be dodged with an old session or a different email. The break glass owner is the price of enforcement that never locks a customer out. SCIM (automatic removal when the company deletes a user) is deliberately left for a follow up feature; until then the session cap bounds how long a removed employee can keep access.
