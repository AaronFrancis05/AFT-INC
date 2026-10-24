# 0007.0002. Delivering a purchased project to the customer's own hosting

Part of [0007](index.md). Shared rules are in the index *Cross child contract*. Acceptance criteria continue the umbrella numbering at AC-20.

## Summary

A customer picks a project, fills in a form the project defines (name, colours, logo, switches, settings), and pays once, optionally adding an updates subscription. AFT copies the project from your private GitHub repo, fills in their answers, adds deploy files for the hosts the project supports, checks for leaked secrets, and pushes it into an empty private repo the customer created and connected through the AFT Delivery GitHub App (or offers a zip). Each later version reaches subscribers as a pull request built by merging the change between versions into the customer's current code, so their own edits are kept.

## Requirements

**User stories**:
- As a workspace owner, I want to customize a project before I get it so that it arrives with my branding and settings.
- As a workspace owner, I want the code in my own private GitHub repo with deploy files for my host so that I can run it on my own account.
- As a subscriber, I want new versions as pull requests so that I can review them against my own changes.
- As the AFT engineer, I want delivery to never run customer or project code on AFT's server and never store cloud keys.

**Acceptance criteria**:

Publishing and rendering
- **AC-20**: Publishing a version (platform admin, feature 127) resolves the git tag to a `commitSha` once and renders by that SHA only. It refuses to publish unless all of these pass (D10):
  - `aft-project.json` at that commit passes the `ProjectManifest` zod schema (the manifest table below).
  - No path under `.github/workflows/` or `.github/actions/` exists.
  - Every `targets` entry is in `ENABLED_TARGETS`.
  - Conformance renders succeed for three fixtures, every declared target, and the pinned gitleaks config. The fixtures are all defaults, all toggles off, and the hostile fixture: quotes, newlines, `</script>`, `${}`, and the maximum lengths.
  - Every rendered `.json` and `.yaml`/`.yml` file parses again.
  - Each target's static validator passes (`docker compose config`; the PaaS's own validator).
  - No unknown `{{aft.` placeholder remains.
- **AC-21**: The form is generated from the version's `options`, and answers are validated server side with the same schema (422 with the field path). The validators are:
  - `color` matches `^#[0-9a-fA-F]{6}$`
  - `url` is `https:` only
  - `text` defaults to a maximum of 200 characters and `textarea` to 2,000
  - all answers together are at most 32 KB
  - image slots accept only their declared `accept` types up to 2 MB and their `maxWidth` by `maxHeight`, read from the file header without decoding the image (X8)
- **AC-25**: Rendering is logic free and runs no project code (AC-19):
  - Only files listed in `renderRules.files` are touched.
  - Each placeholder carries an encoding: `{{aft.key|json}}`, `{{aft.key|html}}`, `{{aft.key|yaml}}`, `{{aft.key|text}}` (no escaping, allowed only for `color`, `toggle`, and `select`). `\{{aft.` renders a literal `{{aft.`.
  - Paths in `renderRules.includeWhen` are dropped when their toggle is false.
  - Asset slots are copied byte for byte to their manifest paths, and the sniffed type must match the output extension.
  - `.aft/delivery.json` (project, version, `answersRevision`) is written into every render.
  - The only child processes the delivery code may start are `git` and `gitleaks`, through one wrapper module; a lint rule enforces it.
- **AC-36**: Renders run one at a time (DBOS queue concurrency 1). Each render stops at 3 minutes and refuses output over 50 MB or 5,000 files with `RENDER_TOO_LARGE` (D22). It works in `/var/lib/aft/render/<deliveryId>`, which is deleted in a `finally`.

Checkout and refunds
- **AC-22**: Checkout runs in three steps:
  1. `POST /api/purchases` creates a `draft` with the preferred target, and the owner uploads images and saves answers.
  2. `POST /api/purchases/:id/checkout` creates one Stripe Checkout Session that expires after 30 minutes, on the workspace's Stripe customer. It sets `automatic_tax` on, `billing_address_collection=required`, and `tax_id_collection` on. The mode is `payment` for the purchase alone, or `subscription` with the one time Price added as an extra line item when the owner also picks updates (monthly or yearly).
  3. A repeat call while the session is open returns the same `checkoutUrl` (B3).

  The purchase becomes `paid` only from a verified webhook (`checkout.session.completed` with `payment_status=paid`, or `checkout.session.async_payment_succeeded`), never from the redirect (B4). `amountCents` is the one time Price's `unit_amount`. A workspace may buy the same project again; each purchase is a separate copy and license.
- **AC-33**: An owner may request a refund only while no delivery has finished and none is running. Refund start is one conditional update: `paid` to `refund_pending` only when `firstDeliveredAt` is null and no delivery is in a non terminal state. AFT then refunds the whole first payment through Stripe, cancels any updates subscription immediately, and sets `refunded`. Starting a delivery requires `status in ('paid','delivered')` in the same transaction that creates the `Delivery` row. After delivery the refund request returns 409 `ALREADY_DELIVERED`, and checkout says this before payment (B33). Cancelling updates through the Stripe portal takes effect at period end (B7).
- **AC-38**: A dispute (`charge.dispute.created`) sets `Purchase.disputedAt`, stops all update deliveries for that purchase, and alerts the engineer; a won dispute (`charge.dispute.closed` with `won`) clears it (B36).

Connecting a repo and delivering
- **AC-23**: To connect a repo, the owner creates an empty private repo and installs the AFT Delivery app choosing *Only select repositories*. In the setup callback AFT checks all of these and stores only `installationId`, `repoId`, `repoFullName`, and `defaultBranch`:
  - the signed `state` (purchase, user, 30 minute expiry)
  - that the signed in session user equals `state.userId`
  - the user's ownership of the installation (OAuth during installation, then `GET /user/installations`); the user token is then discarded
  - that `repository_selection` is not `all` (else `SELECT_ONE_REPO`)
  - that the chosen `repoId` is in `GET /installation/repositories`
  - that the repo is private (else `REPO_NOT_PRIVATE`)
  - that the repo has no commits (else `REPO_NOT_EMPTY`, D13)
- **AC-24**: The initial delivery starts by itself when a purchase is `paid` and has an `active` connection, whichever happens last. The steps are:
  1. Render the newest non yanked version with the same major as `purchasedVersionId`, using the latest answers.
  2. Write every supported target's recipe under `deploy/<target>/`, plus a root `DEPLOY.md` assembled from each target's `deploy/<target>/DEPLOY.md` with the preferred target first.
  3. Run gitleaks.
  4. Check again that the repo is empty and private.
  5. Push one commit to the default branch with the `git` binary over HTTPS. A credential helper supplies an installation token scoped to `repository_ids:[repoId]` with `contents:write`; the token is never in argv or logs, and AFT never force pushes.

  It sets `firstDeliveredAt`, `deliveredVersionId`, and `status=delivered`. The workflow id is `deliver:<purchaseId>:initial:<attempt>`, so a repeat of the same attempt pushes nothing new (X1, D3).
- **AC-26**: Any gitleaks finding (pinned `packages/contracts/gitleaks.toml` with path allowlists for `.env.example` and fixtures, plus the project's `.gitleaksignore`) blocks the push. It sets `blocked_secret`, alerts the engineer with the rule id, file path, and fingerprint (never the value), and shows the owner "delivery paused, AFT has been notified". A platform admin can retry after review, allowing those exact fingerprints for that delivery only (D21).
- **AC-27**: No secret value is ever committed or stored by AFT. `.env.example` lists every `envSpec` variable with its description. Values marked `generate` are created in the owner's browser on the delivery page (`crypto.getRandomValues`, at least 32 bytes) and shown with a copy button; they never reach AFT.
- **AC-28**: The owner can request a zip of the same render at any time. AFT returns a presigned S3 URL valid for 1 hour, keeps the zip 30 days, and renders it again on demand after that. The first zip link counts as delivery for `firstDeliveredAt`.
- **AC-39**: `POST /api/deliveries/:id/retry` creates the next attempt of a `failed` delivery (owner) or a `blocked_secret` delivery (platform admin). Every mutating endpoint accepts and honours an `Idempotency-Key` header (X1).

Updates
- **AC-29**: Publishing a version emails every buyer of that project. For each purchase with an `active` updates subscription, an `active` connection, and no `disputedAt`, the worker:
  1. Reads `.aft/delivery.json` from the default branch head, which gives the base version and answers revision (fallback: `deliveredVersionId` and its answers, noted in the PR).
  2. Renders the base and the new version.
  3. Merges the difference into a shallow clone of the head file by file with `git merge-file`, writing conflict markers where both sides changed.
  4. Pushes branch `aft/update-<version>` and opens a PR titled `AFT update <version>` with the changelog and a list of files with conflicts. Files deleted on the customer's side stay deleted and are listed. A still open older AFT update PR is closed as superseded.

  The workflow id is `update:<purchaseId>:<versionId>`. Updates for one purchase run in order (queue partition key `purchaseId`). Update PRs are paced at no more than one every 10 seconds across all customers.
- **AC-30**: A version marked `critical` goes to every buyer of the project, subscribed or not, as a PR labelled `security` (or a zip notice with no connection). The target version is the newest critical version greater than the version in the customer's `.aft/delivery.json`, with the same major and minor if one exists, otherwise the newest critical version.
- **AC-31**: When the new version needs a required option that the stored answers lack, the manifest `default` is used and listed in the PR body. Without a default, the delivery waits in `needs_answers`, owners get an email with a link to the form, and submitting answers resumes it (D17).
- **AC-32**: An update PR with conflict markers is `conflict_pr_open`, and owners get an email with steps to resolve it. When GitHub's `mergeable` is still unknown, the delivery is `pr_open` and is checked again on the next `pull_request` webhook. A `pull_request` `closed` webhook marks the delivery `merged` (and advances `deliveredVersionId`) or `closed`. This is D16.
- **AC-34**: When the app is uninstalled, the repo deleted, removed from the installation, or made public, the connection becomes `revoked` (or `public` for the last case). This happens from the `installation`, `installation_repositories`, or `repository` webhook, or from the next failed call. Owners are emailed, billing continues, and each new version is offered as a zip until a private repo is connected again (D15).

Roles and audit
- **AC-35**: Only owners can create purchases, edit answers, start checkout, connect or replace a repo, start or retry a delivery, request a zip, request a refund, or open the billing portal (403 for admins and members). All members can read purchases and delivery status. Another workspace's id returns 404 (X15).
- **AC-37**: Every purchase change, answer revision, repo connect and replace, delivery, retry, refund, dispute, and subscription change writes an audit log entry with the actor and the ids.

### Edge cases (new, added to the PLAN.md catalog)

- **D13** The repo has commits at connect time, or gets one before the push → refuse with `REPO_NOT_EMPTY` and ask for a new empty repo.
- **D14** GitHub is down, rate limited, or times out → DBOS step retries with exponential backoff and jitter for up to 24 hours, then `failed`; the owner and the engineer are emailed; retry per AC-39 (X6).
- **D15** The app is uninstalled, the repo deleted, removed from the installation, or made public → AC-34.
- **D16** An update conflicts with the customer's edits → AC-32.
- **D17** The options schema changes between versions → AC-31; an option removed in the new version is ignored and noted in the PR body.
- **D18** The customer squash merges, rebases, or edits `.aft/delivery.json` → updates still work because they read the base version from that file on the current head; if it is missing or unreadable, AFT uses `deliveredVersionId` and says so in the PR.
- **D19** The default branch rejects the initial push (a ruleset on the empty repo) → push branch `aft/initial` instead, mark the delivery done, and tell the owner to make it the default branch; if that push also fails, `failed` with `DEFAULT_BRANCH_PROTECTED`.
- **D20** The chosen target can't host the project, or isn't enabled → the picker shows only manifest targets in `ENABLED_TARGETS`; the API rejects others with 422 `TARGET_NOT_SUPPORTED`.
- **D21** The secret scan finds something → AC-26.
- **D22** A render exceeds limits → AC-36; publishing renders the same project, so this alerts the engineer as a bug.
- **D23** The updates subscription renews unpaid (`past_due`) or lapses while an update PR is open → the open PR stays; no new update PRs; critical fixes still arrive (AC-30).
- **D24** An owner replaces the repo → the old connection becomes `replaced`; the new empty private repo gets a `redeliver` of the currently delivered version with the latest answers; only the new repo gets updates.
- **D25** The project is unpublished or deprecated (C1) → existing buyers keep repo and zip access to versions they own; updates continue until the end of life notice expires.
- **D26** A version is yanked → it is never offered, delivered, or used as an update target; open PRs for it are closed with a note; buyers who already have it get the next version as a normal update.
- **D27** Someone passes an installation id or repo id they don't own, or a stale or foreign `state` → AC-23's checks fail, nothing is stored, 403.
- **D28** A tag is moved after publishing → ignored; renders use the stored `commitSha`.
- **B33** A refund is requested after delivery, or while a delivery runs → AC-33.
- **B34** The webhook arrives before the purchase row commits, or twice → webhooks are stored by event id first (X2); the purchase is found by `stripeCheckoutSessionId`, retried until it exists.
- **B35** An updates renewal fails → Stripe dunning; the subscription becomes `past_due` then `canceled`; D23 applies.
- **B36** A charge is disputed after delivery → AC-38.

## Decision

Logic free rendering pinned to a commit SHA, from your private project repos (read through the AFT Source app). The render is pushed with the `git` binary through the AFT Delivery app into an empty private repo the customer creates. Every enabled recipe is included. Updates are patch based: the change between versions is merged onto the customer's current code. One Stripe Checkout with Stripe Tax covers the purchase plus optional updates. No cloud keys, no hosting by AFT. Launch targets are `compose` plus one PaaS; the others are enabled one at a time after a real deploy.

### Choices made while writing (RECOMMEND items, updated after the cross check)

- **Secrets generated in the browser** (AC-27): AFT never holds them. Runner up: server generated and stored encrypted until first view.
- **Two GitHub Apps** (engineer's pick): AFT Source (`contents:read` on your project repos only) and AFT Delivery (`contents:write`, `pull_requests:write`, `metadata:read`, on customer repos). Every token is scoped to one repo id and minimal permissions. AFT never asks for `workflows:write`, so recipes can't add GitHub Actions.
- **Ownership check through OAuth during installation** (AC-23, D27). Runner up: matching the webhook sender, which races the redirect.
- **One Checkout Session with Stripe Tax** (AC-22, engineer's pick): one payment step. The refund target is the session's `payment_intent` in `payment` mode, or the first invoice's payment in `subscription` mode, resolved with the API version pinned in `packages/billing`.
- **Patch based updates** (engineer's pick, D18): the base version is read from `.aft/delivery.json` on the customer's head, so updates survive squash merges and rebases. Runner up: a long lived `aft/base` branch, which breaks on squash merges.
- **`git` binary for pushes** (AC-24): GitHub's file and git data APIs hit secondary rate limits long before 5,000 files.
- **`ENABLED_TARGETS` starts as `compose` plus one PaaS** (engineer's pick; `vercel` unless the first project needs Postgres plus a worker, then `render`). A target is enabled only after the engineer deploys the reference project on it and records the date in `docs/runbooks/targets.md`.
- **AWS recipe** (when enabled) is a CloudFormation template for one EC2 instance running the project's Compose file, copying child 0001's pattern. App Runner closed to new customers (2026-04-30, per AWS's notice; search summary only), and ECS Express Mode needs a load balancer plus RDS, about $50 a month or more.

## Feature design

**Manifest `aft-project.json`** (zod schema `ProjectManifest` in `packages/contracts`):

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | `1` | required |
| `name`, `version` | string, semver | `version` equals the git tag without `v` |
| `options[]` | `{ key, label, type: text \| textarea \| color \| image \| toggle \| select \| url \| email, required, default?, maxLength?, choices?, accept?, maxWidth?, maxHeight?, help? }` | `key` matches `^[a-z][a-zA-Z0-9]*$`, unique; `image` requires `accept` (subset of png, jpeg, webp), `maxWidth`, `maxHeight` |
| `renderRules.files[]` | glob list | the only files where placeholders are replaced; UTF-8 text only |
| `renderRules.includeWhen` | map of glob to toggle key | a path is dropped when its toggle is false |
| `renderRules.assets` | map of image option key to output path | output extension must match `accept` |
| `targets[]` | subset of `compose \| vercel \| render \| railway \| aws_ec2 \| fly \| digitalocean`, each in `ENABLED_TARGETS` | recipe files live in the project repo under `deploy/<target>/`, each with its own `DEPLOY.md` |
| `needs` | `{ postgres, worker, cron }` booleans | shown on the target picker |
| `envSpec[]` | `{ name, description, required, secret, generate?: hex32 \| base64_32 }` | becomes `.env.example` and the browser generator list |

**Data model** (confirmed 2026-10-24, then changed by the cross check fixes the engineer approved):

| Entity | Fields | Rules |
|---|---|---|
| `Project` (feature 31, additions) | `sourceRepo` text (owner/name, read by AFT Source); `stripePurchasePriceId`, `stripeUpdatesMonthlyPriceId`, `stripeUpdatesYearlyPriceId` text (feature 32) | |
| `Organization` (feature 29, addition) | `stripeCustomerId` text null, unique | created at first checkout unless feature 35 already did |
| `ProjectVersion` | `id` uuid pk; `projectId` fk; `version` text; `gitTag` text; `commitSha` char(40); `manifest` jsonb; `optionsSchemaVersion` int; `changelog` text; `critical` bool default false; `yankedAt` null; `publishedAt` | unique (`projectId`, `version`); catalog data, no RLS |
| `Purchase` | `id`; `organizationId` fk; `projectId` fk; `purchasedVersionId` fk; `deliveredVersionId` fk null; `preferredTarget` enum; `status` enum `draft` · `pending_payment` · `paid` · `delivered` · `refund_pending` · `refunded` · `cancelled`; `stripeCheckoutSessionId` unique null; `stripeCheckoutExpiresAt` null; `stripePaymentIntentId` null; `stripeInvoiceId` null; `amountCents` int null; `currency` char(3) null; `firstDeliveredAt` null; `disputedAt` null; `createdByUserId` fk; `createdAt` | forced RLS; repeat purchases allowed |
| `PurchaseAnswers` | `id`; `purchaseId` fk; `organizationId`; `revision` int; `answers` jsonb (≤ 32 KB); `validatedAgainstVersionId` fk; `createdByUserId`; `createdAt` | append only; unique (`purchaseId`, `revision`); image answers hold S3 keys; forced RLS |
| `RepoConnection` | `id`; `purchaseId` fk; `organizationId`; `provider` `github`; `installationId` bigint; `repoId` bigint; `repoFullName`; `defaultBranch`; `status` `pending` · `active` · `revoked` · `public` · `replaced`; `lastError` null; `createdAt` | partial unique (`purchaseId`) where status = `active`; no tokens stored; forced RLS |
| `Delivery` | `id`; `purchaseId` fk; `organizationId`; `kind` `initial` · `update` · `redeliver`; `channel` `github` · `zip`; `attempt` int; `fromVersionId` fk null; `projectVersionId` fk; `answersId` fk; `repoConnectionId` fk null; `status` (below); `commitSha` null; `branch` null; `prNumber` null; `prUrl` null; `conflictFiles` jsonb null; `allowedFindings` jsonb null; `zipObjectKey` null; `workflowId` unique; `error` null; `createdAt`, `finishedAt`, `mergedAt` | forced RLS |
| `UpdatesSubscription` | `id`; `purchaseId` fk unique; `organizationId`; `stripeSubscriptionId` unique; `interval` `month` · `year`; `status` mirrors Stripe; `currentPeriodEnd` | forced RLS |

**State transitions**:
- Purchase:
  - `draft` → `pending_payment` (checkout session created)
  - `pending_payment` → `draft` (session expired, B2)
  - `pending_payment` → `paid` (webhook)
  - `paid` → `delivered` (first push or zip)
  - `paid` → `refund_pending` → `refunded` (AC-33)
  - `draft` → `cancelled` (owner discards)
- Delivery:
  - main path: `queued` → `rendering` → `scanning` → `pushing` → `done` (initial, zip)
  - update path: `pushing` → `pr_open` · `conflict_pr_open`, then → `merged` · `closed`
  - from `queued`: → `needs_answers` → `queued`
  - from `scanning`: → `blocked_secret`
  - from any active state: → `failed`
  - `failed` and `blocked_secret` move on only through a new attempt (AC-39)
- RepoConnection:
  - `pending` → `active` (AC-23 checks pass)
  - `active` → `revoked` · `public` (D15)
  - `public` → `active` (repo made private again)
  - `active` → `replaced` (D24)

**API surface** (in `apps/web` unless noted; owner = workspace role owner; every mutating call accepts `Idempotency-Key`):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/purchases` | POST | `projectId`, `preferredTarget` | `purchaseId` (`draft`) | owner | 403, 422 `TARGET_NOT_SUPPORTED` |
| `/api/purchases` | GET | `cursor`, `limit` ≤ 50 | `items[]`, `nextCursor` | member | none |
| `/api/purchases/:id` | GET | none | purchase, latest answers, connection, deliveries, subscription | member | 404 |
| `/api/purchases/:id/uploads` | POST | `optionKey`, `contentType` | presigned S3 POST (5 minutes, `content-length-range` 1 to 2 MB, key prefix fixed), from the worker's `/internal/presign` | owner | 422 |
| `/api/purchases/:id/answers` | POST | `answers` | `revision` | owner | 422 |
| `/api/purchases/:id/checkout` | POST | `updates`: `none` · `month` · `year` | `checkoutUrl` (same URL while open) | owner | 409 not `draft`, 422 answers incomplete |
| `/api/purchases/:id/github/install` | GET | none | redirect to the AFT Delivery install URL with signed `state` | owner | 409 already active |
| `/api/github/setup` | GET | `installation_id`, `code`, `state` | redirect to the purchase page | signed state plus session | 403 (D27), 409 `SELECT_ONE_REPO` |
| `/api/purchases/:id/repo` | POST | `repoId` | connection | owner | 409 `REPO_NOT_EMPTY`, `REPO_NOT_PRIVATE`; 403 repo not in installation |
| `/api/purchases/:id/deliveries` | POST | `channel` (`zip`, or `github` for `redeliver`) | `deliveryId` (202) | owner | 409 not paid or no active repo |
| `/api/deliveries/:id` | GET | none | status, `prUrl`, `commitSha`, `conflictFiles`, `error` | member | 404 |
| `/api/deliveries/:id/retry` | POST | none | new `deliveryId` | owner (`failed`), platform admin (`blocked_secret`) | 409 wrong state |
| `/api/deliveries/:id/zip` | GET | none | presigned URL (1 hour) | owner | 409 not ready |
| `/api/purchases/:id/refund` | POST | none | `status` | owner | 409 `ALREADY_DELIVERED`, `DELIVERY_RUNNING` |
| `/api/purchases/:id/updates` | POST | `interval` | `checkoutUrl` (add updates later) | owner | 409 active |
| `/api/purchases/:id/billing-portal` | POST | none | Stripe portal URL | owner | 409 no customer |
| `/api/webhooks/stripe` | POST | events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` | 200 | Stripe signature | 400 |
| `/api/webhooks/github` | POST | events: `installation`, `installation_repositories`, `repository`, `pull_request` | 200 | `X-Hub-Signature-256` (per app secret) | 401 |
| `/api/admin/projects/:id/versions` | POST | `gitTag`, `critical`, `changelog` | `versionId` | platform admin (feature 127) | 422 manifest or conformance |
| `/api/admin/versions/:id/yank` | POST | `reason` | 204 | platform admin | 404 |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| checkout | prices | `Project.stripePurchasePriceId` and the updates price ids (feature 32) |
| checkout | Stripe customer | `Organization.stripeCustomerId`, created on first checkout if null |
| checkout | `amountCents`, `currency` | the one time Price's `unit_amount` and `currency` |
| webhook | refund target | `payment` mode: `session.payment_intent`; `subscription` mode: `session.invoice`, then that invoice's payment intent (pinned API version) |
| form | fields | `ProjectVersion.manifest.options` of the newest non yanked version |
| uploads | presigned POST | worker `/internal/presign` with the instance role (child 0001); bucket CORS allows `https://remwa.tech` |
| setup callback | which purchase and user | signed `state` (HMAC with `GITHUB_STATE_SECRET`: `purchaseId`, `userId`, expiry 30 minutes) and the session |
| setup callback | ownership | `GET /user/installations` with the code exchanged user token |
| connect | single repo, private, empty | `repository_selection` from the installation; `GET /repos/{owner}/{repo}` `private`; commits list returns 409 `Git Repository is empty` |
| render | source | AFT Source token (`contents:read`, one repo id), tarball at `ProjectVersion.commitSha` from `Project.sourceRepo` |
| render | answers | newest `PurchaseAnswers` row; defaults from the manifest (AC-31) |
| render | assets | S3 objects at the answer keys, type checked against the slot |
| push | token | AFT Delivery installation token minted per job, `repository_ids:[repoId]`, `contents:write` (plus `pull_requests:write` for updates), via a credential helper |
| update | base version and answers | `.aft/delivery.json` on the default branch head, else `Purchase.deliveredVersionId` |
| update PR state | mergeable, merged | `GET /pulls/{n}` `mergeable`, then `pull_request` webhooks |
| delivery page | generated secrets | `envSpec[].generate`, in the browser |
| `DEPLOY.md` | content and order | each `deploy/<target>/DEPLOY.md`, preferred target first |
| refund allowed | delivered or running | `Purchase.firstDeliveredAt` and non terminal `Delivery` rows |
| critical target | which version | AC-30 rule over non yanked `ProjectVersion` rows |
| emails | recipients | workspace members with role owner (feature 29) |

**Key invariants**:
- No project or customer code runs on AFT; rendering is substitution and copying; only `git` and `gitleaks` are spawned.
- AFT stores no GitHub token and no cloud credential; tokens live inside one job and cover one repo.
- At most one active repo connection per purchase; every delivery points at an exact version, commit SHA, and answers revision.
- `refunded` is reachable only while nothing was delivered and nothing is running.
- AFT never force pushes and never writes to the default branch after the initial delivery; updates are always pull requests.

**Security model**: owners act, members read, and cross workspace ids return 404 (AC-35). Two GitHub Apps with minimal, per repo tokens; their private keys and webhook secrets live in Parameter Store and are readable only by the worker (child 0001). Webhooks are verified by signature and stored by event id before processing (X2). Uploads are size capped at the S3 policy and type checked by the worker (AC-21). The secret scan protects both AFT's sources and the customer (AC-26). Customer data held: answers, uploaded images, and repo ids; GDPR deletion (X16) removes them and keeps invoices. Checkout shows the license (use by the buying workspace, no resale, no public repo) and the refund rule.

**Configuration required** (Parameter Store `/aft/prod/<app>/`):
- AFT Delivery: `GITHUB_DELIVERY_APP_ID`, `GITHUB_DELIVERY_APP_SLUG`, `GITHUB_DELIVERY_PRIVATE_KEY`, `GITHUB_DELIVERY_CLIENT_ID`, `GITHUB_DELIVERY_CLIENT_SECRET`, `GITHUB_DELIVERY_WEBHOOK_SECRET`
- AFT Source: `GITHUB_SOURCE_APP_ID`, `GITHUB_SOURCE_PRIVATE_KEY`, `GITHUB_SOURCE_INSTALLATION_ID`
- `GITHUB_STATE_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test keys refused in production, B13)
- `DELIVERY_BUCKET`: private S3 bucket for uploads and zips (30 day expiry on `zips/`, CORS for `https://remwa.tech`)
- Code constants: `ENABLED_TARGETS`, `RENDER_MAX_BYTES` (50 MB), `RENDER_MAX_FILES` (5,000), `RENDER_TIMEOUT_MS` (180,000), `ANSWERS_MAX_BYTES` (32 KB), `ZIP_URL_TTL_SECONDS` (3,600), `GITHUB_RETRY_WINDOW_HOURS` (24), `UPDATE_PR_MIN_INTERVAL_MS` (10,000), `CHECKOUT_SESSION_TTL_MINUTES` (30)

**Critical test scenarios**:
- Happy path: an owner creates a draft, uploads a logo, answers, buys with updates (Stripe test mode with tax), and connects an empty private test repo. They get one commit on `main` with their brand, logo, the enabled recipes, and `.aft/delivery.json`. Verifies AC-21 to AC-25 and AC-27.
- Update across merge styles: publish 1.1.0. Three subscribers each get a PR, one each who merged 1.0 normally, squash merged, or rebased. Unrelated edits merge cleanly, and a conflicting edit gives `conflict_pr_open` with markers listed. Merging the PR marks it `merged`. Verifies AC-29, AC-32, D18.
- Schema change: 1.2.0 adds a required option without a default; the delivery waits in `needs_answers` and resumes after the owner answers. Verifies AC-31.
- Escaping: the hostile fixture renders into JSON, YAML, and HTML files that still parse and contain the literal text. Verifies AC-20, AC-25.
- Secret leak: a fake AWS key in a project file blocks publish; injected at render, it blocks the push without logging the value, and an admin retry with the allowed fingerprint succeeds. Verifies AC-20, AC-26, AC-39.
- Refund race: a refund request while a delivery is `rendering` returns 409 `DELIVERY_RUNNING`. Before delivery it succeeds. After the first zip link it returns 409. Verifies AC-28, AC-33.
- Security: each of these returns 403 or 409 and stores nothing: a forged `installation_id`, a foreign `state`, an "All repositories" installation, a public repo, a non empty repo. An admin gets 403 on delivery, and another workspace's purchase returns 404. Verifies AC-23, AC-35, D13, D27.
- Critical fix: a non subscriber on 1.0.0 receives 1.0.1 marked critical as a `security` PR. Verifies AC-30.
- Dispute: `charge.dispute.created` stops the next update and alerts. Verifies AC-38.

## Build plan

Tracer Bullet: step 1 is one thin real thread from a published version to a commit in a customer repo; later steps thicken it.

1. **Thread: publish and push one project.** This step covers:
   - the migration for the entities above
   - the `ProjectManifest` schema
   - both GitHub Apps (manual setup in `docs/runbooks/github-apps.md`)
   - the admin publish endpoint with conformance for `compose`
   - the render workflow with encodings and assets
   - gitleaks with the pinned config
   - the `git` push wrapper
   - the connect flow with every AC-23 check
   - the automatic initial delivery to the default branch

   Payment is stubbed by an admin "mark paid". Satisfies **AC-19**, **AC-20**, **AC-23**, **AC-24**, **AC-25**, **AC-26**, **AC-36**.
2. **Checkout, tax, refunds, disputes.** Draft purchases, the checkout endpoint, Stripe Tax, webhooks, `refund_pending`, and disputes. Satisfies **AC-22**, **AC-33**, **AC-38**.
3. **Form and answers.** The generated form, presigned POST uploads through the worker, answer revisions, the browser secret generator, and `.env.example`. Satisfies **AC-21**, **AC-27**.
4. **First PaaS target.** Its recipe and `DEPLOY.md` in the reference project, a static validator in conformance, a real deploy by the engineer, then add it to `ENABLED_TARGETS`. Satisfies **AC-20**, **AC-24**.
5. **Zip channel and retries.** Satisfies **AC-28**, **AC-39**.
6. **Updates.** Version fan out, patch based merge, PRs, conflicts, defaults and `needs_answers`, per purchase ordering, pacing, `pull_request` webhooks, yanking. Satisfies **AC-29**, **AC-31**, **AC-32**.
7. **Critical fixes and lost or public repos.** Satisfies **AC-30**, **AC-34**.
8. **Roles and audit.** Owner checks on every write, audit entries, 404 across workspaces. Satisfies **AC-35**, **AC-37**.

Prerequisites: features 4 (monorepo), 24 (DBOS worker), 29 (organizations and roles), 31 and 32 (catalog and prices), 127 (admin catalog, at least the publish action), and child 0001's path to live.

## Consequences

- Delivery needs no per host API code: recipes are files, and adding a host means deploying it once and adding a folder to the project repos.
- Updates work with any merge style, but conflict markers land in a PR branch the customer must clean up before merging.
- Every project you sell must be written for placeholders with encodings and a manifest, and must carry a deployed and recorded recipe for each target it claims.
- Customers who don't use GitHub get zips and lose the PR experience.
- Revenue after the sale depends on the updates subscription being worth paying for; Stripe Tax adds a small fee per transaction.

## Rationale (short)

The engineer chose git push plus recipes, a manifest form, and one time plus updates pricing. Logic free rendering with encodings keeps AFT's server from running project code while keeping rendered files valid. A customer created empty private repo, plus per repo tokens from a separate write app, limits what a leaked key or a mistake can reach, and avoids needing a user access token with repository administration rights to create repos (installation tokens carry no user identity; confirm against the GitHub App docs at build step 1). Reading the base version from `.aft/delivery.json` on the customer's head gives each update a correct base no matter how earlier PRs were merged.
