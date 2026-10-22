# 0004.0001. Authorization server core at the issuer URL

Part of [0004, AFT as the single sign on provider](index.md). Shared rules (client kinds, tokens, scopes, claims, data model) are in the index *Cross child contract*.

## Summary

This builds `apps/auth`, the service at `auth.remwa.tech` that every client trusts. It publishes discovery and signing keys, issues signed tokens with the agreed claims, rotates its keys safely, gives third party apps a private user ID per app, rate limits abuse, sets strict security headers, records every sign in event, and cleans up when a user is deleted. It is the spine the other children hang off, and its first thin slice is the tracer bullet T1.

## Requirements

**User stories**:
- As a project developer, I want to point any standard OIDC library at AFT's issuer and have sign in just work, so that I write no AFT specific code.
- As an MCP server, I want to verify access tokens locally and reject tokens meant for someone else, so that I never call AFT on every request.
- As the AFT operator, I want to rotate or revoke signing keys without downtime, so that a leaked key is contained within minutes.

**Acceptance criteria**:
- **AC-1**: `GET {issuer}/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server` return metadata whose `issuer` equals `AUTH_ISSUER_URL` exactly, whose endpoints are on the issuer origin, and which contain at least: `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `registration_endpoint`, `revocation_endpoint`, `introspection_endpoint`, `end_session_endpoint`; `response_types_supported` `["code"]`; `grant_types_supported` `["authorization_code","refresh_token","client_credentials"]`; `code_challenge_methods_supported` `["S256"]`; `id_token_signing_alg_values_supported` `["RS256"]`; `subject_types_supported` `["public","pairwise"]`; `token_endpoint_auth_methods_supported` `["client_secret_basic","none"]`; `scopes_supported` (the index scope table, without resource scopes); `backchannel_logout_supported` and `backchannel_logout_session_supported` `true`; `authorization_response_iss_parameter_supported` `true`; `client_id_metadata_document_supported` `true`. A missing key fails a contract test that reads this list.
- **AC-2**: `apps/sso-example`, using `openid-client` with only the issuer URL, client ID, and secret, completes code plus PKCE sign in; the ID token verifies against JWKS with RS256 and carries the right `iss`, `aud`, `nonce`, `sub`, `sid`, `auth_time`, `amr`, and with `org` scope `org_id`, `org_slug`, `org_role`; `amr` and `auth_time` equal the `session.amr` and `session.authTime` written at sign in.
- **AC-3**: An authorize request without PKCE, or with `plain`, fails with `invalid_request`; a code redeemed twice fails with `invalid_grant` and the tokens from the first redemption are revoked; a code older than 60 seconds (injected clock) fails with `invalid_grant`.
- **AC-4**: Every access token is a JWT with header `typ: at+jwt` and `exp - iat` of 600 seconds, with `aud` equal to the requested registered `resource` or else the `client_id`; an unregistered `resource` fails with `invalid_target`; `verifyAccessToken(token, { audience })` in `packages/auth` rejects a token whose `aud` differs or whose `exp - iat` exceeds 600 seconds.
- **AC-5**: With an injected clock, `npm run auth:keys:rotate` adds a new RS256 key to JWKS that starts signing 7 days later; the old key stops signing at that moment and leaves JWKS 7 days after it stopped (its deactivation time is stored); tokens signed by either key verify throughout (X12); JWKS responses send `Cache-Control: public, max-age=600`.
- **AC-6**: `npm run auth:keys:emergency -- --kid <kid> --since <ISO time>` removes the key from JWKS at once, activates a fresh key, revokes every refresh token issued since the given time, and writes a `key_admin` event with the operator identity; a token signed by the removed key then fails verification (A18).
- **AC-7**: For `third_party_app` and `mcp_dynamic` clients, `sub` is the stored `PairwiseSubject.sub` for (sector, user); two clients in different sectors get different `sub` values for one user, two clients in one sector get the same; first party kinds get `user.id`; a client's sector never changes after creation.
- **AC-8**: Scope claims appear only when that scope was granted; a scope that is unknown or not allowed for the client's kind (index scope table) fails the request with `invalid_scope`; a refresh asking for more scopes or another resource than the original grant fails with `invalid_scope` or `invalid_target`.
- **AC-9**: Over the limits, endpoints return `429` with `Retry-After` (X7): authorize 30 failed requests per minute per IP; token 60 per minute per (client, IP) and 3000 per minute per client; registration 10 per hour per IP; SSO start 20 per minute per IP. The client IP is the `x-forwarded-for` entry at `AUTH_TRUSTED_PROXY_DEPTH` from the right, never a value the client can set.
- **AC-10**: Every authorize, token, refresh, revoke, logout, and admin action writes one `SignInEvent` with `type`, `result`, `reasonCode` on failure, and `actor` for admin types, never a token, code, or secret value; with an injected clock, the daily sweep truncates IPs older than 30 days to IPv4 /24 or IPv6 /48 and deletes rows older than 180 days.
- **AC-11**: A token issued by staging fails verification against production's issuer and JWKS; `apps/auth` refuses to start when `AUTH_ISSUER_URL` is missing, has a trailing slash, or is not `https` outside `NODE_ENV=development`.
- **AC-12**: With `AUTH_OIDC_PROVIDER_ENABLED` not `true`, every OAuth and discovery endpoint returns `404`, while the email, OTP, and social sign in pages keep working.
- **AC-63**: Every HTML response from `apps/auth` sends `Content-Security-Policy` with `frame-ancestors 'none'` and an `img-src` limited to the issuer origin and `data:`, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Strict-Transport-Security` outside development (clickjacking of consent and the picker).
- **AC-64**: Deleting a user (X16 path) calls `revokeGrants({ userId })`, queues back channel logouts, deletes their `PairwiseSubject`, `ClientWorkspaceChoice`, consents, and grants, sets `SignInEvent.userId` to null, and writes an `account_delete` event.
- **AC-65**: Introspection returns `{ "active": false }` for any token whose `aud` or `client_id` is not the calling client.
- **AC-66**: `BETTER_AUTH_SECRET` can be rotated with the old value kept as `BETTER_AUTH_SECRET_PREVIOUS` (stored private keys stay readable and are encrypted again with the new value on next use); a scheduled check alerts (log at `error` until feature 23) when the active signing key is older than 83 days.

## Feature design

**Data model sketch**: plugin tables from `npx auth generate`, the `session` fields `amr` and `authTime`, `OAuthClientProfile`, `OAuthGrantContext`, `SignInEvent` (T1), `PairwiseSector`, `PairwiseSubject` (T5a), exactly as in the index data model.

**API surface** (paths are whatever the plugin publishes in discovery; clients must read discovery and never hard code paths):
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/.well-known/openid-configuration` | GET | none | OIDC metadata (AC-1 list) | public | 404 when flag off |
| `/.well-known/oauth-authorization-server` | GET | none | RFC 8414 metadata | public | 404 when flag off |
| JWKS (`jwks_uri`) | GET | none | public keys | public | none |
| authorize | GET | `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `nonce`, `code_challenge`, `code_challenge_method=S256`, `resource?`, `prompt?`, `max_age?` | redirect with `code`, `state`, `iss` | AFT session (redirects to sign in) | `invalid_request`, `invalid_scope`, `invalid_target`, `unauthorized_client`, `access_denied`, `login_required`, `interaction_required`, 429 |
| token | POST | `grant_type` (allowed per kind), `code`, `code_verifier`, `redirect_uri`, `refresh_token`, `resource?`, `scope?` | `access_token`, `id_token`, `refresh_token?`, `expires_in`, `token_type` | client auth per kind | `invalid_grant`, `invalid_client`, `invalid_scope`, `invalid_target`, `unauthorized_client`, 429 |
| userinfo | GET | bearer access token | scope claims | bearer | 401 |
| revocation | POST | `token`, `token_type_hint?` | 200 | client auth | `invalid_client` |
| introspection | POST | `token` | `active`, claims (own tokens only) | confidential client auth | `invalid_client` |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| discovery | `issuer` | `AUTH_ISSUER_URL` |
| any token | `sub` (first party) | `user.id` |
| any token | `sub` (third party) | `PairwiseSubject.sub`, created on first issue as `base64url(HMAC_SHA256(AUTH_PAIRWISE_SALT, sector.identifier + ":" + user.id))` |
| any token | sector | `OAuthClientProfile.sectorId`, set once at registration (child 0003 AC-34) |
| any token | grant facts (workspace, `sid`, scopes, resource) | `OAuthGrantContext` by the grant id on the token row |
| ID token | `org_id`, `org_slug`, `org_role` | `OAuthGrantContext.organizationId` joined to `organization.slug` and `member.role` at issue time |
| ID token | `amr`, `auth_time` | `session.amr`, `session.authTime`, written by a Better Auth database hook when a session is created: `pwd` for password, `otp` for email OTP, the provider id for social, `sso` for the `sso` plugin, plus `mfa` when 2FA passed |
| ID token | `sid` | `OAuthGrantContext.sid` (the AFT `session.id` at authorize; stays fixed for the grant even if the session token rotates) |
| access token | `ent` | `checkProjectAccess(orgId, clientId)` result (`plan`, `features`) |
| access token | `aud` | registered `resource`, else `client_id` |
| JWKS | keys, `kid`, activation and deactivation times | `jwks` table via the `jwt` plugin, plus the times kept by the rotate script |
| rate limit | client IP | `x-forwarded-for` at `AUTH_TRUSTED_PROXY_DEPTH` |
| rate limit | counters | Redis (`REDIS_URL`); database store when unset in development |
| events | `actor` | the service client id, or the operator's AWS identity (`aws sts get-caller-identity` ARN) for scripts |

**Key invariants**:
- `iss` in every token and response equals `AUTH_ISSUER_URL`.
- No token is signed with a key absent from JWKS; a key leaves JWKS only 7 days after it stopped signing, except by AC-6.
- Every token's `sub` for a third party client comes from `PairwiseSubject`, never `user.id`.
- Every token row maps to exactly one `OAuthGrantContext`.
- `SignInEvent` holds no secret values.

**Security model**: discovery and JWKS are public. Authorize requires an AFT session (else the sign in page, with the return URL validated against the issuer origin). Token, revocation, and introspection require client authentication per kind; introspection only for confidential clients and only for their own tokens. Keys are encrypted at rest with `BETTER_AUTH_SECRET`. All pages send AC-63 headers. GDPR: tokens carry only the claims for granted scopes; events follow the 30 and 180 day rules; user deletion follows AC-64.

**Configuration required**:
- `AUTH_ISSUER_URL`: the issuer, per environment
- `BETTER_AUTH_URL`: same value as the issuer for `apps/auth`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_SECRET_PREVIOUS?`: session secret and private key encryption, with a rotation slot
- `AUTH_PAIRWISE_SALT`: 32 random bytes, base64, Secrets Manager only, permanent
- `AUTH_OIDC_PROVIDER_ENABLED`: `true` to expose the provider
- `AUTH_PLATFORM_CLIENT_IDS`: comma list of first party clients allowed a null `projectId`
- `AUTH_ENTITLEMENT_ALLOWLIST`: JSON in the index shape, used until feature 37
- `AUTH_TRUSTED_PROXY_DEPTH`: number of trusted proxies in front of `apps/auth` (1 behind the AWS load balancer, 0 locally)
- `REDIS_URL`: rate limit storage (optional in development)

**Critical test scenarios**:
- Discovery contract test against the AC-1 key list; happy path with `apps/sso-example`, verifies **AC-1**, **AC-2**
- Failure: plain PKCE, reused code, expired code with an injected clock, verifies **AC-3**
- Audience and lifetime: token for resource A rejected by B; unregistered resource gives `invalid_target`; a forged long lived token rejected, verifies **AC-4**
- Rotation with an injected clock; emergency removal breaks old tokens, verifies **AC-5**, **AC-6**
- Pairwise across sectors and within one, verifies **AC-7**
- Permission: a third party client asking for `entitlements` or `aft:clients.admin` gets `invalid_scope`; widening on refresh refused, verifies **AC-8**
- Abuse: limits trip with a spoofed `x-forwarded-for` ignored, verifies **AC-9**
- Events and retention sweep with an injected clock, verifies **AC-10**
- Cross environment token rejected; bad issuer config refuses to boot, verifies **AC-11**
- Flag off returns 404, verifies **AC-12**
- Header check on every page, verifies **AC-63**
- User deletion cleans grants, subjects, and events, verifies **AC-64**
- Introspection of another client's token is inactive, verifies **AC-65**
- Secret rotation keeps keys readable; an 84 day old key triggers the error log, verifies **AC-66**

## Build plan

1. T1: add `@better-auth/oauth-provider` and `jwt` to `packages/auth` (bump `better-auth` and the plugins to the same version, 1.7.12 or later); run `npx auth generate`; record the generated names and the T1 checks from the index Follow-up in this spec; satisfies **AC-1**, **AC-2**
2. T1: create `apps/auth` (Next.js, `packages/auth`), issuer config guard, flag guard, security headers; satisfies **AC-11**, **AC-12**, **AC-63**
3. T1: migration 1 (plugin tables, `session` fields, `OAuthClientProfile`, `OAuthGrantContext`, `SignInEvent`); the session hook writing `amr` and `authTime`; satisfies **AC-2**, **AC-10**
4. T1: RS256 key config, discovery routes with the full key list, JWKS cache header, `iss` in authorize responses; satisfies **AC-1**, **AC-5**
5. T1: grant id creation at authorize; claims builders for `org`, `entitlements`, `amr`, `sid`; scope matrix and refresh narrowing; satisfies **AC-2**, **AC-8**
6. T1: PKCE and code rules, default audience, `invalid_target`, `verifyAccessToken` with the lifetime ceiling, introspection restriction; satisfies **AC-3**, **AC-4**, **AC-65**
7. T1: `apps/sso-example` with `openid-client`, seeded as a platform client; satisfies **AC-2**
8. T1: `recordSignInEvent`; satisfies **AC-10**
9. T2: retention sweep, user deletion cleanup; satisfies **AC-10**, **AC-64**
10. T2: `auth:keys:rotate`, `auth:keys:emergency`, the key age check, secret rotation slot, and a staging drill; satisfies **AC-5**, **AC-6**, **AC-66**
11. T2: rate limits on Redis with trusted proxy depth, database store in development; satisfies **AC-9**
12. T5a: migration 5 and pairwise subject computation; satisfies **AC-7**

## Rationale (short)

The plugin covers the protocol; AFT adds only what makes it a product: per kind rules, a grant record that ties every token to a workspace and a session, workspace claims, pairwise IDs, key operations, headers, and events. Keeping endpoint paths behind discovery means a plugin upgrade that moves a path does not break clients. If the plugin cannot override `sub` for pairwise IDs, emit `iss` in the authorization response, or issue JWT access tokens without a `resource`, `/develop` stops and routes back here rather than patching the plugin.
