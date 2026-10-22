# 0004.0004. Session lifecycle: refresh, revocation, and logout

Part of [0004, AFT as the single sign on provider](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Tokens live short and refresh often, so AFT gets a chance to say no whenever access changes. Each refresh token works once; a stolen copy used later kills the whole grant. When someone is removed from a workspace, loses a subscription, signs out, or their AFT session ends, AFT revokes the matching grants at once and tells every first party project in the background (back channel logout), retrying until the project hears it. Projects can also send a user to AFT to sign out everywhere, safely.

## Requirements

**User stories**:
- As a workspace owner, I want a removed member to lose access to every project quickly, so that offboarding is real (A6).
- As a user, I want signing out of AFT to sign me out of AFT's projects too, so that a shared computer is safe.
- As a project developer, I want a simple standard call when a user signs out, so that I do not poll AFT.

**Acceptance criteria**:
- **AC-36**: Each refresh returns a new refresh token and access token; the old refresh token used again within 10 seconds returns the same new refresh token and a freshly minted access token (no plaintext token is stored to do this; if the plugin cannot return the same refresh token, the grace window instead accepts the old token once more and issues the same family's next token, decided at T2); used after 10 seconds it fails (A12).
- **AC-37**: A refresh token reused after the grace window revokes every token of that grant, sets `OAuthGrantContext.revokedAt`, writes a `refresh_reuse` event, and the newest token of that grant then also fails with `invalid_grant` (A12).
- **AC-38**: With an injected clock, a refresh token unused for 30 days, or a grant older than 90 days (or `maxSessionHours` for an SSO enforced workspace), fails with `invalid_grant`.
- **AC-39**: At every refresh AFT checks that the user is still a member of `OAuthGrantContext.organizationId` and, for gated kinds, that `checkProjectAccess` still allows it; if not, the refresh fails with `invalid_grant` (`reasonCode` `membership_lost` or `no_entitlement`) and the grant is revoked; a role change shows as the new `org_role` in the refreshed tokens.
- **AC-40**: `revokeGrants(filter)` throws on an empty filter; otherwise it revokes all matching refresh tokens and consents, sets `revokedAt` on the matching grants, and inserts one `LogoutDelivery` per affected first party grant with a `backchannelLogoutUri`, all in one transaction (X4). It is called on: AFT sign out (`{ sid }`); AFT session expiry or deletion, found by the daily session sweep (`{ sid }`); user deletion (`{ userId }`); member removal or downgrade, through organization plugin hooks (`{ userId, organizationId }`, A6); connected app revoke (`{ userId, clientId }`); SSO enforcement switched on (child 0006). It is the documented entry point for features 37, 41, and 44.
- **AC-41**: For each queued delivery, the client's `backchannelLogoutUri` receives a form encoded POST with a `logout_token`: a JWT with header `typ: logout+jwt`, signed like ID tokens, with `iss`, `aud` the client ID, `iat`, `exp` (2 minutes), `jti`, `sub`, `sid` from the grant, and the back channel logout event claim, and no `nonce`; a 2xx answer marks the delivery `delivered`. Deliveries are sent through `safeFetch`.
- **AC-42**: With an injected clock, a failed delivery retries at about 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, and 24 hours with jitter and a 5 second timeout per attempt; after the sixth failure the row is `failed` and an `error` level log line `logout_delivery_failed` with `clientId` and `jti` is written (asserted in a test), which feeds the alert once feature 23 exists (A19).
- **AC-43**: The end session endpoint accepts an `id_token_hint` that is expired or signed by a key no longer active, as long as its signature (against current or retained keys), `iss`, and `aud` are valid. With a valid hint and a `post_logout_redirect_uri` exactly in the client's `postLogoutRedirectUris`, it ends the AFT session, calls `revokeGrants({ sid })`, and redirects with `state`. With no valid hint, it shows a confirm page with a CSRF token and acts only on its POST. An unregistered `post_logout_redirect_uri` shows AFT's signed out page instead of redirecting.
- **AC-44**: `apps/sso-example` verifies a logout token (including `typ`) and ends its local session for that `sid`; an end to end test shows the user signed out of the example app within 60 seconds of signing out at AFT.

## Feature design

**Data model sketch**: plugin refresh token table (rotation, family), `OAuthGrantContext` (grant id, `sid`, client, workspace, scopes, resource, `revokedAt`), `LogoutDelivery` (index data model), `SignInEvent`.

**State transitions**:
- Grant: `active` → `revoked` (reuse, revocation, membership or entitlement lost, idle, or absolute expiry).
- Refresh token: `active` → `rotated` (10 second grace) → `revoked`.
- `LogoutDelivery`: `pending` → `delivered`; `pending` → `pending` (attempts plus one, `nextAttemptAt` moved) → `failed` after 6 attempts.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| token (refresh grant) | POST | `refresh_token`, `resource?`, `scope?` (narrowing only) | new tokens | client auth per kind | `invalid_grant`, `invalid_scope`, `invalid_target` |
| revocation | POST | `token` | 200 | client auth | `invalid_client` |
| end session (from discovery) | GET, POST | `id_token_hint?`, `post_logout_redirect_uri?`, `state?`, CSRF token on POST | redirect, confirm page, or signed out page | AFT session cookie if present | none (never reveals session state) |
| client's back channel URI (outbound) | POST | `logout_token` (form encoded) | expect 2xx | signed JWT | retried |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| refresh | grant facts | `OAuthGrantContext` by the grant id on the refresh token row |
| refresh | still a member, role | `member` row for (user, organization) |
| refresh | still entitled | `checkProjectAccess(orgId, clientId)` |
| refresh | absolute limit | `OAuthGrantContext.createdAt` plus 90 days, or `WorkspaceSsoPolicy.maxSessionHours` when enforced |
| sign out, expiry | which grants | `OAuthGrantContext` rows with that `sid` |
| logout token | `sid`, `sub` | `OAuthGrantContext.sid`; `user.id` (first party only, so always public) |
| logout token | target URL | `OAuthClientProfile.backchannelLogoutUri` |
| end session | allowed redirect | `OAuthClientProfile.postLogoutRedirectUris` |
| retries | schedule | `LogoutDelivery.attempts`, `nextAttemptAt` |
| session expiry trigger | expired sessions | daily sweep over the plugin `session` table (`expiresAt` passed), then delete |

**Key invariants**:
- A refresh never succeeds for a revoked grant, or for a user who is no longer a member of the grant's workspace.
- Revocation and the logout outbox rows commit together or not at all.
- `revokeGrants` never runs with an empty filter.
- Back channel logout goes only to first party kinds.

**Security model**: refresh and revocation require client authentication per kind. Logout tokens have their own `typ` so they can never pass as ID or access tokens, and carry no personal data beyond `sub` and `sid`. The confirm page stops logout CSRF. Outbound POSTs go only to registered `https` URIs through `safeFetch`.

**Configuration required**:
- `AUTH_LOGOUT_WORKER_ENABLED`: `true` on the one process that runs the delivery loop and the session sweep

**Critical test scenarios**:
- Rotation, grace, and reuse revocation, verifies **AC-36**, **AC-37**
- Idle, absolute, and `maxSessionHours` expiry with an injected clock, verifies **AC-38**
- Removed member and lost entitlement fail on refresh; role change shows in new tokens, verifies **AC-39**
- Each `revokeGrants` caller, and an empty filter throwing, verifies **AC-40**
- Logout reaches a test receiver with `typ: logout+jwt`; a down receiver retries then fails with the log line, verifies **AC-41**, **AC-42**
- End session with an expired hint, no hint (confirm page), registered and unregistered redirects, verifies **AC-43**
- End to end sign out of the example app, verifies **AC-44**

## Build plan

1. T2: refresh rotation config (grace 10 seconds, idle 30 days, absolute 90 days or `maxSessionHours`) and reuse revocation with events; check the plugin's grace behavior first; satisfies **AC-36**, **AC-37**, **AC-38**
2. T2: refresh time membership and entitlement recheck from `OAuthGrantContext`; satisfies **AC-39**
3. T2: migration 2 (`LogoutDelivery`); `revokeGrants` with the transactional outbox, organization plugin hooks, sign out hook, and session expiry sweep; satisfies **AC-40**
4. T2: delivery loop (a single process of the `apps/auth` image with `AUTH_LOGOUT_WORKER_ENABLED`, polling every 10 seconds with `FOR UPDATE SKIP LOCKED`; moves into the feature 24 worker when it exists); satisfies **AC-41**, **AC-42**
5. T2: end session endpoint with hint rules, confirm page, and redirect validation; satisfies **AC-43**
6. T2: back channel logout receiver in `apps/sso-example` and the end to end test; satisfies **AC-44**

## Rationale (short)

Short access tokens plus rotating refresh tokens bound the damage of any leak to minutes, and every refresh is a checkpoint for membership and entitlement. Keying everything on one grant record, created at authorize for every client, means logout works for first party clients that never ask for a refresh token or see a consent screen. Back channel logout works without a browser and without third party cookies, which front channel logout no longer can. The outbox keeps revocation and notification consistent: a project that is down still hears about the logout later, and AFT has already cut the refresh path, so the gap is at most the project's own session.
