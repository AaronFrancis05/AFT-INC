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
