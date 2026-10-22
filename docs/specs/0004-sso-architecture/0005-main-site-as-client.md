# 0004.0005. The main site becomes an OIDC client

Part of [0004, AFT as the single sign on provider](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Today `remwa.tech` signs people in itself. After this change it sends them to `auth.remwa.tech` like every other app and keeps its own small server side session made from the tokens it gets back; the browser holds only an opaque session id. The switch is behind a setting, so it can be turned back in one step until the new path has run cleanly in production for 14 days, and only then is the old local sign in code deleted.

## Requirements

**User stories**:
- As a customer, I want to sign in once and use both the AFT dashboard and my projects, so that I never sign in twice.
- As the engineer, I want the main site to use the same contract as projects, so that the contract is tested by our own busiest page every day.

**Acceptance criteria**:
- **AC-45**: With `WEB_AUTH_MODE=oidc`, visiting a protected page or `/auth/sign-in` on the main site redirects to AFT's authorize endpoint (code plus PKCE, scopes `openid profile email offline_access org`, `redirect_uri` `${WEB_BASE_URL}/api/oidc/callback`), keeping `state`, `nonce`, the PKCE verifier, and `returnTo` in a signed, `HttpOnly` cookie that lives 10 minutes; the callback checks `state`, `nonce`, and `iss`, stores the tokens in Redis under a random session id (TTL 7 days), sets only that id in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, and lands on `returnTo` or `/dashboard`.
- **AC-46**: Token refresh runs only in the proxy (`proxy.ts`) or a route handler, never in a Server Component, when the access token has less than 60 seconds left, under a per session Redis lock (single flight: parallel requests wait up to 5 seconds and reuse the result); if the refresh fails, the Redis session is deleted and the user is sent to sign in with the current path as `returnTo`.
- **AC-47**: Sign out on the main site deletes the Redis session and sends the user to AFT's end session endpoint with `id_token_hint` and `post_logout_redirect_uri` `${WEB_BASE_URL}/`; the main site's back channel logout endpoint verifies the logout token (including `typ: logout+jwt`) and deletes every Redis session with that `sid`; if Redis is unreachable, protected pages fail closed (sign in page with a "temporarily unavailable" notice) and public pages render signed out.
- **AC-48**: Existing users keep their accounts and data (the main site's `sub` is `user.id`, same database); the old local sign in, sign up, and reset pages on the main site redirect to their `auth.remwa.tech` equivalents; at cutover existing local sessions end once and users sign in again.
- **AC-49**: Setting `WEB_AUTH_MODE=local` restores today's local sign in with no data change (shown by a staging drill); the cutover runbook checklist in this spec records the production switch date, and the local auth code is deleted in a separate pull request only after the checklist shows 14 days in `oidc` mode with no rollback.

## Feature design

**Data model sketch**: no schema change. Redis keys: `web:session:<id>` (tokens, `sid`, `sub`, `org_id`, TTL 7 days), `web:sid:<sid>` (set of session ids, for back channel logout), `web:refresh-lock:<id>` (5 second lock).

**API surface** (main site):
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/auth/sign-in` | GET | `returnTo?` (same origin path only) | redirect to authorize, flow cookie | none | none |
| `/api/oidc/callback` | GET | `code`, `state`, `iss` | session cookie, redirect | flow cookie | 400 on bad `state`, `nonce`, or `iss` |
| `/auth/sign-out` | POST | CSRF token | redirect to end session | session cookie | none |
| `/api/oidc/backchannel-logout` | POST | `logout_token` | 200 | signed logout token | 400 on invalid token |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| sign in | client ID and secret | `WEB_OIDC_CLIENT_ID`, `WEB_OIDC_CLIENT_SECRET` (platform client, listed in `AUTH_PLATFORM_CLIENT_IDS`) |
| sign in | issuer | `WEB_OIDC_ISSUER` (the environment's `AUTH_ISSUER_URL`) |
| sign in | redirect and post logout URIs | `WEB_BASE_URL` (`http://localhost:3000`, `https://staging.remwa.tech`, `https://remwa.tech`), registered on the client by the seed script |
| sign in | `state`, `nonce`, verifier, `returnTo` | flow cookie signed with `WEB_SESSION_SECRET` |
| session | user, workspace, role | ID token `sub`, `org_id`, `org_role`, kept in the Redis session |
| session | store | Redis (`REDIS_URL`) |
| logout | sessions for a `sid` | `web:sid:<sid>` set |
| mode | which path | `WEB_AUTH_MODE` |

**Key invariants**:
- In `oidc` mode the main site never accepts a password or OTP.
- Tokens never reach the browser; the cookie holds only an opaque id.
- Only one refresh per session runs at a time.
- `returnTo` is a same origin path, never a full URL.

**Security model**: the main site is a confidential `first_party_shared` platform client. CSRF is covered by `state`, `nonce`, PKCE, `SameSite=Lax`, and a CSRF token on sign out. The back channel endpoint accepts only logout tokens signed by the issuer with `aud` equal to the main site's client ID. Redis failure fails closed for protected pages.

**Configuration required**:
- `WEB_AUTH_MODE`: `local` or `oidc`
- `WEB_BASE_URL`: the main site origin per environment
- `WEB_OIDC_ISSUER`, `WEB_OIDC_CLIENT_ID`, `WEB_OIDC_CLIENT_SECRET`
- `WEB_SESSION_SECRET`: 32 bytes, signs the flow cookie and session id cookie
- `REDIS_URL`: shared with the rest of the platform (required in `oidc` mode)

**Critical test scenarios**:
- Sign in through AFT lands on the dashboard with the right workspace, and the cookie holds no token, verifies **AC-45**
- Ten parallel requests near expiry cause exactly one refresh; a revoked refresh token signs out, verifies **AC-46**
- Sign out at AFT ends the main site session through back channel logout; Redis down fails closed, verifies **AC-47**
- An existing user signs in and sees their old data; old auth URLs redirect, verifies **AC-48**
- Flip back to `local` on staging and sign in the old way, verifies **AC-49**

## Cutover runbook checklist

- [ ] Staging: `WEB_AUTH_MODE=oidc`, full sign in, refresh, sign out, back channel tests pass
- [ ] Staging: rollback drill to `local` and back
- [ ] Production: switch date recorded here and in MEMORY.md
- [ ] Production: 14 days with no rollback, then the local auth code removal pull request

## Build plan

1. T6: OIDC sign in, flow cookie, callback, Redis sessions behind `WEB_AUTH_MODE`; satisfies **AC-45**
2. T6: refresh in the proxy with the single flight lock; satisfies **AC-46**
3. T6: sign out and back channel logout by `sid`, fail closed on Redis errors; satisfies **AC-47**
4. T6: redirects from old auth pages; cutover runbook on staging, then production; satisfies **AC-48**
5. T6: rollback drill on staging; after 14 clean days in production, delete the local auth code in a separate pull request; satisfies **AC-49**

## Rationale (short)

The strangler pattern fits: the new path runs beside the old one behind a switch, and the old code goes only once the new path is proven. Server side sessions in Redis avoid three problems a token cookie would have: Server Components cannot set cookies, three JWTs can exceed the 4 KB cookie limit, and parallel refreshes would trip refresh reuse detection and revoke the grant. Making the main site an ordinary client is what keeps the contract honest.
