# 0004.0003. Client registry: provisioning, developer console, CIMD and DCR

Part of [0004, AFT as the single sign on provider](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Every app that signs in through AFT is a registered client. AFT's own pipelines create clients for showcase projects, dedicated instances, and preview environments through an internal API, and the secret goes straight into AWS Secrets Manager. Workspace owners create clients for their own apps in a developer console. MCP clients identify themselves with a metadata URL (CIMD) or, for older clients, register dynamically. Strict redirect rules, cleanup, and staff verification keep the registry safe.

## Requirements

**User stories**:
- As the provisioning pipeline, I want to create, update, rotate, and delete a client with one authenticated call, so that every tenant and instance gets its own client without a human touching a secret.
- As a workspace owner, I want to register my app and get credentials once, so that my users can sign in with AFT.
- As an MCP client, I want to connect with only my metadata URL, so that the user does not have to register me by hand.

**Acceptance criteria**:
- **AC-23**: `POST /internal/v1/clients` with a `client_credentials` access token whose `aud` is `aft-internal` and which holds `aft:clients.admin` creates a first party client (`kind`, `projectId`, `instanceId`, or `previewId` per the index kind table, `name`, `redirectUris`, `postLogoutRedirectUris`, `backchannelLogoutUri`). AFT first creates the Secrets Manager secret at `aft/<env>/oauth-clients/<clientId>`, then writes the client rows in one transaction, and a daily sweep deletes any secret under that prefix with no client row; the response returns `clientId` and the secret ARN, never the secret. Redirect, post logout, and back channel hosts must be under a domain in `AUTH_ADMIN_ALLOWED_REDIRECT_DOMAINS` or a custom domain verified for that instance (feature 67), else `422`.
- **AC-24**: Repeating the create with the same `Idempotency-Key` returns the first result (X1); creating a second active client for the same `instanceId` or `previewId` returns the existing client with `200`, never a duplicate.
- **AC-25**: `POST /internal/v1/clients/{id}/rotate-secret` stores a new secret as the current Secrets Manager version and keeps the old secret valid for 24 hours (`previousSecretHash`, `previousSecretExpiresAt`, checked by the plugin or a token endpoint hook), after which only the new one works (X12); verified with an injected clock.
- **AC-26**: `PATCH /internal/v1/clients/{id}` replaces redirect, post logout, or back channel URIs under the AC-23 host rules (custom domains, feature 67), never the sector; `DELETE` sets `disabledAt`, revokes all its tokens and consents at once, and the row is purged 90 days later (X11).
- **AC-27**: Any `/internal/v1` call without a valid token for `aft-internal` holding `aft:clients.admin` returns `403`; the ingress manifest for `apps/auth` routes no `/internal` path, and a NetworkPolicy allows `/internal` traffic only from the pipeline namespaces (checked by a manifest test); every admin call writes an `admin_client` event with the calling client as `actor`.
- **AC-28**: In workspace settings, owners and admins can create, edit, rotate, and delete `third_party_app` clients (name, logo URL, redirect URIs, post logout URIs, public or confidential); a confidential secret is shown exactly once; members get `404` (X15); deleting the workspace disables its clients (X16).
- **AC-29**: Every registration path rejects a redirect or post logout URI that is not an exact absolute URI, contains a fragment or wildcard, or uses `javascript:`, `data:`, or `file:`. `https` is required except: `http://127.0.0.1`, `http://[::1]`, and `http://localhost` for public native or MCP clients, matched ignoring the port (RFC 8252), and the same loopback hosts for confidential clients only when `AUTH_ENVIRONMENT=local`. Custom schemes are allowed only for public native clients with a reverse domain scheme. Matching is otherwise an exact string match.
- **AC-30**: An authorize request whose `client_id` is an `https` URL is treated as CIMD: AFT fetches it through `safeFetch` (HTTPS only, private, loopback, and link local addresses blocked after DNS resolution, 5 second timeout, 5 KB limit, no redirects), caches by HTTP headers up to 24 hours, requires the document's `client_id` to equal the URL, and allows only `grant_types` `authorization_code` and `refresh_token`; any failure returns `invalid_client` (A16). The `OAuthClientProfile` (kind `mcp_dynamic`, sector the URL host) is created only when the user reaches the consent page, never on an unauthenticated request.
- **AC-31**: Dynamic registration works without a session only for public clients (`token_endpoint_auth_method: none`) with `grant_types` limited to `authorization_code` and `refresh_token`, creates kind `mcp_dynamic` with its own new sector (so DCR clients never share a pairwise `sub`), and is limited to 10 per IP per hour; any other request is rejected with `invalid_client_metadata` (A17).
- **AC-32**: With an injected clock, a daily sweep deletes `mcp_dynamic` clients (DCR and CIMD) that never got a token within 24 hours of creation or have had no token for 30 days (`lastTokenAt`), with their tokens and consents (A17).
- **AC-33**: `npm run auth:clients:verify -- <clientId>` (production operator access required) sets `verified`, `verifiedAt`, `verifiedBy` (the operator's AWS identity ARN), and `verifiedMetadataHash` (a SHA-256 of the client's name, logo, and redirect set), and writes a `client_verify` event; whenever a later edit or a refetched CIMD document changes that hash, `verified` returns to false and the Unverified label comes back.
- **AC-34**: A third party client with redirect URIs on more than one host must provide a `sector_identifier_uri` (fetched with `safeFetch`) whose list contains every redirect URI, else registration fails with `invalid_client_metadata`; a client with one host uses that host as its sector; an edit that adds a host outside the sector list is rejected, and the sector never changes.
- **AC-35**: (deferred until feature 20 exists) The preview pipeline creates one client per preview on the staging issuer through AC-23 with a `previewId`, and deletes it through AC-26 when the preview is torn down.
- **AC-68**: Client logos are never loaded from the client's host in the viewer's browser: AFT fetches each logo once through `safeFetch` (PNG, JPEG, or WebP only, at most 256 KB), stores it, and serves it from the issuer origin; a failed fetch shows a neutral placeholder.

## Feature design

**Data model sketch**: `OAuthClientProfile` (index data model, including `previewId`, `postLogoutRedirectUris`, `verifiedMetadataHash`, `previousSecretHash`, `previousSecretExpiresAt`), `PairwiseSector` for third party kinds, and the plugin `oauthClient` (name, redirect URIs, secret hash, grant types). Logos are stored as files in the object store chosen by scope feature 12 (local disk in development), keyed by `clientId`.

**State transitions** (client): `active` → `disabled` (delete or sweep) → purged after 90 days. Secret: `current` → `previous` (24 hours) → gone. Verification: `unverified` → `verified` → `unverified` (metadata hash changed).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/internal/v1/clients` | POST | `kind`, `projectId?`, `instanceId?`, `previewId?`, `name`, `redirectUris[]`, `postLogoutRedirectUris[]`, `backchannelLogoutUri?`, header `Idempotency-Key` | `clientId`, `secretArn` | bearer, `aud` `aft-internal`, scope `aft:clients.admin` | 403, 409 (kind and link mismatch), 422 |
| `/internal/v1/clients/{id}` | PATCH | `redirectUris?`, `postLogoutRedirectUris?`, `backchannelLogoutUri?`, `name?` | client | same | 403, 404, 422 |
| `/internal/v1/clients/{id}` | DELETE | none | 204 | same | 403, 404 |
| `/internal/v1/clients/{id}/rotate-secret` | POST | header `Idempotency-Key` | `secretArn`, `previousValidUntil` | same | 403, 404 |
| `/settings/workspaces/{orgId}/developer/clients` | GET, POST | name, logo URL, redirect URIs, post logout URIs, `public` flag, `sector_identifier_uri?` | list; created client with secret once | AFT session, owner or admin | 404, 422 |
| `/settings/workspaces/{orgId}/developer/clients/{id}` | PATCH, DELETE, POST `rotate` | as above | client; secret once on rotate | same | 404, 422 |
| registration endpoint (from discovery) | POST | RFC 7591 metadata | client metadata | none (public clients only) | `invalid_client_metadata`, 429 |
| `/logos/{clientId}` | GET | none | stored logo | public | 404 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| create | `clientId`, secret | generated by the plugin; secret 32 random bytes |
| create | `secretArn` | Secrets Manager `CreateSecret` at `aft/<env>/oauth-clients/<clientId>`, by the `apps/auth` IAM role limited to that prefix |
| create | `<env>` | `AUTH_ENVIRONMENT` (`local`, `staging`, `production`) |
| create | allowed hosts | `AUTH_ADMIN_ALLOWED_REDIRECT_DOMAINS` (for example `remwa.tech`), plus the instance's verified custom domains from feature 67 |
| create | idempotent result | `Idempotency-Key` stored per the engineering standards spec (feature 7); until it exists, a unique (`instanceId` or `previewId`) lookup plus the key in a 24 hour Redis entry |
| bootstrap | the first `first_party_service` client and its secret | the seed script `npm run auth:seed`, run once per environment by an operator, which writes the secret to Secrets Manager at `aft/<env>/oauth-clients/<clientId>` for the pipeline role to read |
| internal API | token audience | resource `aft-internal`, registered in `oauthResource` by the seed script |
| rotate | old secret validity | `previousSecretHash`, `previousSecretExpiresAt` |
| CIMD | name, logo, redirect URIs, post logout URIs | the fetched metadata document (`post_logout_redirect_uris` when present, else none) |
| CIMD | sector | URL host of the `client_id` |
| DCR | sector | a new `PairwiseSector` per client, identifier `dcr:<clientId>` |
| verify | `verifiedBy` | operator AWS identity ARN |
| sweep | last use | `OAuthClientProfile.lastTokenAt`, updated on every token or refresh |
| console | who may manage | `member.role` in (`owner`, `admin`) for `orgId` |

**Key invariants**:
- One active client per `instanceId` and per `previewId`.
- The kind and link columns always match the index check constraint.
- A client's sector never changes.
- A secret is never written to logs, events, or responses except the one time console display.
- Every redirect and post logout URI on every client passes AC-29.

**Security model**: the internal API trusts only `aft-internal` tokens with `aft:clients.admin`, which only `first_party_service` clients can hold, and is unreachable from the public ingress. Its callers can only register hosts on AFT domains or verified custom domains, so a stolen pipeline credential cannot create a first party client (which skips consent) for an attacker's site. The console is limited to owners and admins of the workspace; other workspaces get 404. Every server side fetch goes through `safeFetch`. DCR and CIMD clients are public, code and refresh only.

**Configuration required**:
- `AUTH_ENVIRONMENT`: names the Secrets Manager prefix and turns on local loopback rules
- `AUTH_ADMIN_ALLOWED_REDIRECT_DOMAINS`: comma list of domains first party clients may use
- `AWS_REGION`: `eu-west-1`
- IAM: the `apps/auth` service role may `secretsmanager:CreateSecret`, `PutSecretValue`, `DeleteSecret`, `TagResource`, `ListSecrets` only on `aft/<env>/oauth-clients/*` (defined with scope feature 14)

**Critical test scenarios**:
- Pipeline creates, retries with the same key, rotates (injected clock), and deletes a client; a foreign redirect host gets 422, verifies **AC-23**, **AC-24**, **AC-25**, **AC-26**
- Calls without the scope or audience are refused; the manifest test finds no `/internal` ingress route, verifies **AC-27**
- Owner creates a client and sees the secret once; a member gets 404, verifies **AC-28**
- A table of good and bad redirect URIs, including loopback with a changed port and a confidential loopback in local and staging, verifies **AC-29**
- CIMD to a private IP, a redirecting URL, a 6 KB document, a mismatched `client_id`, a `client_credentials` grant; no profile row before consent, verifies **AC-30**
- DCR public succeeds with its own sector, confidential fails, eleventh in an hour gets 429, verifies **AC-31**
- Sweep removes stale DCR and CIMD clients and keeps active ones, verifies **AC-32**
- Verify script sets the label; a changed CIMD logo clears it, verifies **AC-33**
- Multi host client without a sector URI fails; an edit adding an outside host fails, verifies **AC-34**
- Preview create and teardown (when feature 20 exists), verifies **AC-35**
- Consent page logo comes from the issuer origin, verifies **AC-68**

## Build plan

1. T1: seed script creates the `apps/sso-example` platform client, the `aft-internal` resource, and the first `first_party_service` client; the shared redirect validator; satisfies **AC-29**
2. T4: `/internal/v1/clients` create, update, delete, idempotency, host rules, secret first then rows, orphan secret sweep; ingress and NetworkPolicy manifests with a test; satisfies **AC-23**, **AC-24**, **AC-26**, **AC-27**
3. T4: migration 4 (secret and preview columns) and rotation with the overlap window; satisfies **AC-25**
4. T5a: CIMD plugin wired behind `safeFetch`, profile at consent; satisfies **AC-30**
5. T5a: DCR for public clients with per client sectors, rate limit, and the daily sweep; satisfies **AC-31**, **AC-32**
6. T5a: logo fetch and serving; verify script with the metadata hash; satisfies **AC-68**, **AC-33**
7. T5b: developer console pages and sector rules; satisfies **AC-28**, **AC-34**
8. After feature 20: preview pipeline hook; satisfies **AC-35**

## Rationale (short)

Clients are infrastructure for first party apps, so pipelines own them and humans never handle their secrets. Writing the secret from `apps/auth` straight into Secrets Manager (rather than returning it to the pipeline) keeps it out of pipeline logs, and creating the secret before the rows means a crash leaves only an orphan secret that the sweep removes, never a client nobody can use. Limiting admin callers to AFT and verified domains matters because first party clients skip consent. CIMD first follows the 2026-07-28 MCP spec; DCR stays narrow (public clients only, rate limited, swept, own sector) because it is deprecated and attracts junk. Strict redirect rules close the open redirect and `javascript:` class of bugs that hit the legacy Better Auth plugins in 2026.
