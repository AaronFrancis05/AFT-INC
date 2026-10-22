# Epic: Identity and workspaces

Back to the [scope index](index.md).

Who the user is, which workspace they act in, and what they may do. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Already built

### A. Email and password auth · existing
Sign up, sign in, email verification by OTP, forgot and reset password, change password, profile, sign out, plus Google and GitHub sign in. Feature 2 fixes its known defects; features 30 and 44 to 46 harden it. code in `lib/auth.ts`, `lib/auth-client.ts`, `components/auth/`, `app/(auth)/`

## Slice 1: Browse, subscribe, use (core loop)

### 29. Organizations and personal workspaces · needs a decision · GA
Every customer acts inside a workspace: a personal one for individuals, shared ones for teams and enterprises.
**Done when:** each new user gets a personal workspace, the active workspace lives in the session (A9), and every workspace owned record is invisible to other workspaces, returning 404 (X15).
- [ ] Design it (spec): `/architect organizations and personal workspaces`

### 30. Route protection · needs a decision · GA
Protected areas are guarded once, on the server, before any page renders.
**Done when:** signed out users are redirected from every protected area, and a user who lost access is denied on their next request (A6).
- [ ] Design it (spec): `/architect route protection`

## Slice 2: Identity breadth

### 41. Members and roles · needs a decision · GA
Workspaces have owners, admins, and members with clear permissions.
**Done when:** roles limit what each member can do, a removed or downgraded member loses access at once (A6), and the last owner cannot leave or delete their account until ownership moves (A7).
- [ ] Design it (spec): `/architect members and roles`

### 42. Invitations · needs a decision · GA
Invite people to a workspace by email.
**Done when:** an invite can be sent, accepted, revoked, and resent; expired, revoked, reused, or wrong email invites are rejected with a clear message (A8).
- [ ] Design it (spec): `/architect invitations`

### 43. Workspace switcher and settings · needs a decision
Move between workspaces and manage each one.
**Done when:** a user can switch workspaces from anywhere, a URL for another workspace switches explicitly (A9), and owners can rename the workspace and see its members.
- [ ] Design it (spec): `/architect workspace switcher and settings`

### 44. Session security · needs a decision · GA
Sessions and one time codes are safe against reuse and guessing.
**Done when:** OTPs are single use with an attempt limit and cooldown (A3); a failed email send shows a retry, not a fake success (A4); a sign up with an email that already exists has a decided behavior (today it answers "Account created!" to hide existing accounts, and emails that user a fresh OTP; found in `/check verify auth defect fixes`, 2026-10-21) (A4); a password change signs out other sessions and sends a notice (A5); users can see and revoke their sessions.
- [ ] Design it (spec): `/architect session security`

### 45. Social sign in linking · needs a decision · GA
Google and GitHub accounts link safely to existing users.
**Done when:** a social sign in links to an existing account only when the provider email is verified (A1), and GitHub users with a private email still sign in with their verified primary email or get a clear block (A2).
- [ ] Design it (spec): `/architect social sign in linking`

### 46. Two factor authentication · needs a decision · GA
Optional second factor, required for workspace owners of paid plans if they choose.
**Done when:** users can enroll an authenticator app, sign in with it, use backup codes, and recover; owners can require it for their workspace.
- [ ] Design it (spec): `/architect two factor authentication`

### 47. API keys · needs a decision · GA
Developers call AFT and subscribed projects with scoped keys.
**Done when:** keys are shown once, stored hashed, carry a visible prefix, scopes, and expiry, record last use, and revoke instantly (A10).
- [ ] Design it (spec): `/architect api keys`

### 48. Audit log · needs a decision · GA
Every privileged action is recorded and visible to workspace owners.
**Done when:** role changes, key creation and revocation, billing changes, and deploys write an entry with who, what, and when, and owners can filter the log.
- [ ] Design it (spec): `/architect audit log`

## Slice 2b: AFT as the sign in provider (from spec 0004)

AFT becomes the OIDC provider for its projects, dedicated instances, MCP clients, and customers' apps, and accepts company logins. One feature per tracer bullet slice of spec [0004](../specs/0004-sso-architecture/index.md); build them in order. Prerequisites: features 4 and 29 before 133; 12 before 134 reaches production and before 139; 46 before the enforcement part of 140; 20 before the preview hook in 136.

### 133. SSO thin thread (T1) · in-progress · GA
`apps/auth` at the issuer URL signs a user in to `apps/sso-example` with code plus PKCE and returns verified RS256 tokens carrying the workspace.
**Done when:** discovery lists every required key, the example app signs in with only the issuer, client ID, and secret, tokens carry `org_id` and `amr`, PKCE and code rules hold, wrong audience tokens fail, staging tokens fail in production, and the provider is off unless flagged (A14 stub gate).
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), children [0001](../specs/0004-sso-architecture/0001-authorization-server-core.md), [0002](../specs/0004-sso-architecture/0002-sign-in-flow-and-access.md), [0003](../specs/0004-sso-architecture/0003-client-registry.md)
- [ ] Build it: `/develop sso thin thread`
   - [ ] Plugins, `apps/auth`, config and flag guards, security headers, migration 1 (AC-1, AC-11, AC-12, AC-63)
   - [ ] Keys, discovery, grant record, claims, scopes, PKCE, audience, introspection (AC-2, AC-3, AC-4, AC-5, AC-8, AC-65)
   - [ ] Sign in resume and single workspace selection, seed script, `apps/sso-example`, sign in events (AC-2, AC-10, AC-13, AC-14, AC-29)
- [ ] Verify it: `/check verify sso thin thread`
- [ ] Test it: `/test sso thin thread`
- [ ] Review it (fresh model): `/check review sso thin thread`
- [ ] Document it: `/document sso thin thread`
- [ ] Ship it: squash merge with all checks green, then staging behind `AUTH_OIDC_PROVIDER_ENABLED`

### 134. SSO lifecycle and operations (T2) · in-progress · GA
Refresh tokens rotate and catch reuse, access changes revoke grants, logouts reach every first party project, and keys, limits, and retention run safely.
**Done when:** reuse revokes the grant (A12), a removed member's refresh fails (A6), sign out reaches projects with retries (A19), emergency key rotation works (A18), limits return 429 (X7), deleted users leave no grants (X16), and secrets rotate without downtime (X12).
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), children [0004](../specs/0004-sso-architecture/0004-session-lifecycle-and-logout.md), [0001](../specs/0004-sso-architecture/0001-authorization-server-core.md)
- [ ] Build it: `/develop sso lifecycle and operations`
   - [ ] Rotation, reuse, expiry, refresh rechecks (AC-36, AC-37, AC-38, AC-39)
   - [ ] `revokeGrants`, migration 2, delivery loop, end session, example app receiver (AC-40 to AC-44)
   - [ ] Key scripts and age check, secret rotation slot, rate limits, retention sweep, user deletion (AC-5, AC-6, AC-9, AC-10, AC-64, AC-66)
- [ ] Verify it: `/check verify sso lifecycle and operations`
- [ ] Test it: `/test sso lifecycle and operations`
- [ ] Review it (fresh model): `/check review sso lifecycle and operations`
- [ ] Document it: `/document sso lifecycle and operations`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag

### 135. SSO workspace picker and access gate (T3) · in-progress · GA
Users with several workspaces pick one (remembered per app); users without access get a clear no access page.
**Done when:** the picker appears only with a real choice and remembers it (A13), no entitled workspace gives a no access page and `access_denied` (A14), tampered workspace ids return 404 (X15), and `prompt` and `max_age` follow the spec table.
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), child [0002](../specs/0004-sso-architecture/0002-sign-in-flow-and-access.md)
- [ ] Build it: `/develop sso workspace picker and access gate`
   - [ ] Migration 3, picker, eligibility, prompt handling (AC-14, AC-15, AC-21, AC-67)
   - [ ] No access page and accessibility checks (AC-16, AC-22)
- [ ] Verify it: `/check verify sso workspace picker and access gate`
- [ ] Test it: `/test sso workspace picker and access gate`
- [ ] Review it (fresh model): `/check review sso workspace picker and access gate`
- [ ] Document it: `/document sso workspace picker and access gate`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag

### 136. SSO client provisioning API (T4) · in-progress · GA
Pipelines create, update, rotate, and delete first party clients, with secrets going straight to Secrets Manager.
**Done when:** creates are idempotent (X1), only allowed hosts register, secrets rotate with a 24 hour overlap (X12), deleted clients lose all tokens (X11), the API is unreachable from outside the cluster, and preview clients follow previews (after feature 20).
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), child [0003](../specs/0004-sso-architecture/0003-client-registry.md)
- [ ] Build it: `/develop sso client provisioning api`
   - [ ] Admin API, host rules, secret then rows, orphan sweep, manifests (AC-23, AC-24, AC-26, AC-27)
   - [ ] Migration 4 and secret rotation (AC-25)
   - [ ] Preview hook after feature 20 (AC-35)
- [ ] Verify it: `/check verify sso client provisioning api`
- [ ] Test it: `/test sso client provisioning api`
- [ ] Review it (fresh model): `/check review sso client provisioning api`
- [ ] Document it: `/document sso client provisioning api`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag

### 137. SSO for MCP clients (T5a) · in-progress · GA
MCP clients connect with a metadata URL or dynamic registration, users consent, and each app sees a private user ID.
**Done when:** CIMD fetches are SSRF safe (A16), dynamic registration is public only, rate limited, and swept (A17), consent shows the redirect host and unverified label (A15), and pairwise IDs differ across sectors.
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), children [0003](../specs/0004-sso-architecture/0003-client-registry.md), [0002](../specs/0004-sso-architecture/0002-sign-in-flow-and-access.md), [0001](../specs/0004-sso-architecture/0001-authorization-server-core.md)
- [ ] Build it: `/develop sso for mcp clients`
   - [ ] Migration 5 and pairwise subjects (AC-7)
   - [ ] CIMD, DCR, sweep, logos, verify script (AC-30, AC-31, AC-32, AC-33, AC-68)
   - [ ] Consent page and third party picker rules (AC-17, AC-18, AC-19)
- [ ] Verify it: `/check verify sso for mcp clients`
- [ ] Test it: `/test sso for mcp clients`
- [ ] Review it (fresh model): `/check review sso for mcp clients`
- [ ] Document it: `/document sso for mcp clients`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag

### 138. Sign in with AFT for customer apps (T5b) · in-progress · GA
Workspace owners register their own apps, and users see and revoke the apps they approved.
**Done when:** owners and admins manage clients and see a secret once, members get 404 (X15), multi host apps need a sector list, deleting a workspace disables its clients (X16), and revoking a connected app kills its tokens.
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), children [0003](../specs/0004-sso-architecture/0003-client-registry.md), [0002](../specs/0004-sso-architecture/0002-sign-in-flow-and-access.md)
- [ ] Build it: `/develop sign in with aft for customer apps`
   - [ ] Developer console and sector rules (AC-28, AC-34)
   - [ ] Connected apps page (AC-20)
- [ ] Verify it: `/check verify sign in with aft for customer apps`
- [ ] Test it: `/test sign in with aft for customer apps`
- [ ] Review it (fresh model): `/check review sign in with aft for customer apps`
- [ ] Document it: `/document sign in with aft for customer apps`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag

### 139. Main site signs in through AFT (T6) · in-progress · GA
`remwa.tech` becomes an OIDC client of `auth.remwa.tech`, with server side sessions and a one step rollback.
**Done when:** the main site signs in, refreshes once per session under load, signs out everywhere, keeps existing users and data, and can flip back to local sign in until 14 clean days in production.
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), child [0005](../specs/0004-sso-architecture/0005-main-site-as-client.md)
- [ ] Build it: `/develop main site signs in through aft`
   - [ ] Sign in, callback, Redis sessions, single flight refresh (AC-45, AC-46)
   - [ ] Sign out, back channel, fail closed (AC-47)
   - [ ] Redirects, cutover runbook, rollback drill, later code removal (AC-48, AC-49)
- [ ] Verify it: `/check verify main site signs in through aft`
- [ ] Test it: `/test main site signs in through aft`
- [ ] Review it (fresh model): `/check review main site signs in through aft`
- [ ] Document it: `/document main site signs in through aft`
- [ ] Ship it: squash merge with all checks green, then staging, then the production cutover runbook

### 140. Enterprise SSO for workspaces (T7) · in-progress · GA
Companies connect Okta, Entra ID, or any OIDC or SAML provider, verify their domain, provision staff just in time, and can enforce SSO with a break glass owner.
**Done when:** only verified domains route and provision (A23, A24), email clashes link only on verified domains (A21), IdP email changes are safe (A22), enforcement requires an SSO session and revokes others (A25), a down IdP leaves break glass working (A20), the last break glass owner is protected (A26), and SAML is signed, bound, and replay safe.
- [x] Design it (spec): `/architect sso architecture`
Spec [0004](../specs/0004-sso-architecture/index.md), child [0006](../specs/0004-sso-architecture/0006-enterprise-inbound-sso.md)
- [ ] Build it: `/develop enterprise sso for workspaces`
   - [ ] Migration 6, plan gate, OIDC connections, test and draft rules (AC-50, AC-51, AC-52)
   - [ ] Domains, routing, rechecks, provisioning, mapping, clash and email rules (AC-53 to AC-58, AC-61, AC-71)
   - [ ] SAML hardening (AC-62)
   - [ ] Enforcement, break glass, session cap, after feature 46 (AC-59, AC-60, AC-69, AC-70)
- [ ] Verify it: `/check verify enterprise sso for workspaces`
- [ ] Test it: `/test enterprise sso for workspaces`
- [ ] Review it (fresh model): `/check review enterprise sso for workspaces`
- [ ] Document it: `/document enterprise sso for workspaces`
- [ ] Ship it: squash merge with all checks green, then staging behind the flag
