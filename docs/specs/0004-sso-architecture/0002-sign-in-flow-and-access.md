# 0004.0002. Sign in flow, workspace picker, entitlement gate, and consent

Part of [0004, AFT as the single sign on provider](index.md). Shared rules are in the index *Cross child contract*.

## Summary

This is what a person sees between clicking "Sign in with AFT" and landing back in the app. AFT signs them in if needed, works out which workspace they are acting for (asking only when there is a real choice), refuses politely when that workspace has no access to the project, and asks for consent only when the app is not AFT's own. People can see and revoke the third party apps they approved.

## Requirements

**User stories**:
- As a customer in one workspace, I want to land in the project without extra screens, so that sign in feels instant.
- As a consultant in several workspaces, I want to pick which client's workspace I am entering, and have AFT remember it, so that I do not pick every time.
- As a user of a third party app, I want to see who is asking for what before I approve, so that I am not tricked by a fake app.

**Acceptance criteria**:
- **AC-13**: An authorize request without an AFT session shows the AFT sign in page (email, OTP, enabled social providers, and SSO routing from child 0006); after sign in the same authorize request resumes with its `state`, `nonce`, and PKCE values intact.
- **AC-14**: For gated kinds (`first_party_shared` with a `projectId`, `first_party_dedicated`), the eligible workspaces are the user's memberships where `checkProjectAccess(orgId, clientId)` allows; for `first_party_dedicated` only the allow list `ownerOrgId` can be eligible. Platform clients (`AUTH_PLATFORM_CLIENT_IDS`) treat every membership as eligible, and a user with none gets a personal workspace created first. With exactly one eligible workspace and no `prompt=select_account`, no picker is shown and `OAuthGrantContext.organizationId` is set to it.
- **AC-15**: With more than one eligible workspace, or with `prompt=select_account`, the picker lists each eligible workspace's name and the user's role, preselects `ClientWorkspaceChoice` when present, and saving a choice upserts `ClientWorkspaceChoice` (A13).
- **AC-16**: With no eligible workspace, AFT shows a no access page naming the app, listing the user's workspaces, linking to subscribe, and offering "Back to app", which redirects to the client with `error=access_denied` and `error_description=no_entitlement`; no code or token is issued (A14).
- **AC-17**: For `third_party_app` and `mcp_dynamic` clients, the picker covers all memberships (no entitlement gate) and appears only when `org` is requested; without `org`, no picker is shown and no workspace claims are issued.
- **AC-18**: For third party kinds, AFT shows a consent page with the client name, logo, the redirect host, an "Unverified app" label unless `OAuthClientProfile.verified` is true, each requested scope in plain words, and the chosen workspace; approving stores `oauthConsent`; denying redirects with `error=access_denied`; a later request for a scope not yet consented asks again (A15).
- **AC-19**: First party kinds never show a consent page.
- **AC-20**: Account settings on `apps/auth` list every third party client the user consented to, with scopes, workspace, and last use; revoking deletes the consent, calls `revokeGrants({ userId, clientId })`, and writes a `revoke` event.
- **AC-21**: A submitted workspace or consent form whose `organizationId` is not one of the user's eligible workspaces returns `404` and issues nothing (X15); every form carries CSRF protection and is tied to the pending authorize request.
- **AC-67**: `prompt` and `max_age` behave per this table: `prompt=none` with no AFT session returns `login_required`, and with a session but a needed picker or consent returns `interaction_required` (never shows a page); `prompt=login`, or a session whose `authTime` is older than `max_age` seconds, forces a fresh sign in and updates `authTime`; `prompt=consent` shows consent again for third party kinds and is ignored for first party kinds; `prompt=select_account` forces the picker; any other value fails with `invalid_request`.
- **AC-22**: The sign in, picker, no access, consent, and connected apps pages have zero serious or critical axe violations, work by keyboard alone, link every label to its input, and read their text from the message file (WCAG 2.2 AA).

## Feature design

**Data model sketch**: reads `member`, `organization`, `OAuthClientProfile`, `oauthConsent`; writes `OAuthGrantContext` (one per grant), `ClientWorkspaceChoice` (T3), `oauthConsent`, `SignInEvent`.

**State transitions** (one authorize request): `received` → `signed_in` → `workspace_resolved` (auto, picked, or none needed) → `consented` (third party) or `skipped` (first party) → `code_issued`. Side exits: `no_access` (A14) and `denied` (user refused consent), both ending in a redirect with `error=access_denied`.

**API surface** (pages on `apps/auth`; each form posts as a server action bound to the pending authorize request id):
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/authorize/workspace` | GET, POST | pending request id; `organizationId` on POST | picker page; on POST continue authorize | AFT session | 404 (not eligible), 410 (request expired) |
| `/authorize/no-access` | GET, POST | pending request id | page; POST redirects with `access_denied` | AFT session | 410 |
| `/authorize/consent` | GET, POST | pending request id; `decision` (`approve`, `deny`) | consent page; continue or `access_denied` | AFT session | 404, 410 |
| `/settings/connected-apps` | GET | none | list of consents | AFT session | none |
| `/settings/connected-apps/{clientId}` | DELETE | `clientId` | 204 | AFT session | 404 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| picker | workspace names, roles | `organization.name`, `member.role` |
| picker | eligibility | `checkProjectAccess(orgId, clientId)`; for dedicated, the allow list `ownerOrgId` for that client (until features 37 and 64); platform clients, all memberships |
| prompt handling | `prompt`, `max_age` | authorize request params, compared with `session.authTime` |
| picker | preselected workspace | `ClientWorkspaceChoice` for (user, client) |
| no access page | app name | `oauthClient.name` |
| no access page | subscribe link | the project page on the main site when `projectId` is set and feature 33 exists; until then `https://remwa.tech/projects` |
| consent page | name, logo | `oauthClient.name`, logo URI (CIMD metadata for CIMD clients) |
| consent page | redirect host | host of the `redirect_uri` in the request |
| consent page | verified label | `OAuthClientProfile.verified` |
| consent page | scope wording | the message file, key `scopes.<scope>`; unknown resource scopes use the description in `oauthResource` |
| connected apps | last use | `OAuthClientProfile.lastTokenAt` for the client, and the newest `SignInEvent` of type `token` or `refresh` for (user, client) |
| any step | pending request | the plugin's stored authorize request, referenced by an opaque id with a 10 minute lifetime |

**Key invariants**:
- No code is issued for a gated client unless `checkProjectAccess` allowed the chosen workspace at that moment.
- `OAuthGrantContext.organizationId` is always a workspace the user was a member of when the grant was made.
- Consent is never skipped for third party kinds, and never shown for first party kinds.

**Security model**: every page requires an AFT session and a live pending request owned by that session. Workspace IDs from the client are never trusted; eligibility is recomputed on submit. Return URLs are only the client's registered redirect URIs. Personal data shown is the user's own.

**Configuration required**: none new (uses `AUTH_ENTITLEMENT_ALLOWLIST` from child 0001).

**Critical test scenarios**:
- Signed out user resumes the same authorize after sign in, verifies **AC-13**
- One workspace, no picker; two workspaces, picker preselects the last choice; `prompt=select_account` forces it, verifies **AC-14**, **AC-15**
- No entitled workspace shows no access, and Back to app returns `access_denied`, verifies **AC-16**
- MCP client with and without `org`, verifies **AC-17**
- Third party consent approve, deny, new scope asks again; unverified label shown, verifies **AC-18**, **AC-19**
- Revoking a connected app kills its refresh token, verifies **AC-20**
- Each row of the prompt table, including `prompt=none` errors and `max_age` forcing sign in, verifies **AC-67**
- Tampered `organizationId` returns 404, verifies **AC-21**
- axe and keyboard checks on each page, verifies **AC-22**

## Build plan

1. T1: sign in resume on `apps/auth` (copy the existing auth pages into `apps/auth`; the main site keeps its own until child 0005), single workspace auto selection, platform client personal workspace rule, `OAuthGrantContext` write; satisfies **AC-13**, **AC-14**
2. T3: migration 3 (`ClientWorkspaceChoice`); picker page and eligibility via `checkProjectAccess`; prompt and `max_age` handling; satisfies **AC-14**, **AC-15**, **AC-21**, **AC-67**
3. T3: no access page and `access_denied` return; satisfies **AC-16**
4. T5a: consent page, scope wording in the message file, unverified label; third party picker rules; satisfies **AC-17**, **AC-18**, **AC-19**, **AC-21**
5. T5b: connected apps page with revoke through `revokeGrants`; satisfies **AC-20**
6. Each slice: axe and keyboard tests for the pages it adds; satisfies **AC-22**

## Rationale (short)

Putting the workspace in the token at sign in keeps every project simple: it maps one `org_id` to one tenant and never builds its own switcher. Remembering the last choice per client removes the picker's friction for consultants without hiding it. Gating at AFT means a project can trust any valid token, which is the safer default at GA, while third party and MCP clients are gated by scopes and per tool entitlements instead, because "access to a project" means nothing for them.
