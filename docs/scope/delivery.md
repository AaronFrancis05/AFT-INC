# Epic: Project delivery (customer CI/CD)

Back to the [scope index](index.md).

How a purchase turns into code the customer owns. Since spec [0007](../specs/0007-lean-hosting-customer-delivery/index.md) (2026-10-24), AFT no longer hosts anything for customers: it renders the project with the customer's form answers and pushes it into the customer's own private GitHub repo with deploy recipes, and an optional updates subscription sends new versions as pull requests. The build detail lives in spec 0007 child 0002. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 1: Browse, buy, receive (core loop)

### 38. Project manifest and publishing · in-progress · GA
The rules every project must follow to be sold on AFT: an `aft-project.json` manifest (options, render rules, targets, env), and a publish step that pins a version to a commit and proves it renders safely.
**Done when:** publishing resolves the tag to a commit SHA and refuses unless the manifest validates, no workflow files exist, every target is enabled, and conformance renders (defaults, all toggles off, hostile input) re-parse and pass the secret scan (D10, D28); a version can be yanked (D26).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (manifest, AC-20).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop project manifest and publishing`
   - [ ] `ProjectManifest` schema, `ProjectVersion` table, `Project.sourceRepo` (AC-20)
   - [ ] AFT Source GitHub App, the admin publish endpoint with conformance for `compose` (AC-20)
   - [ ] Hostile fixture, static validators, the yank endpoint (AC-20, D26)
- [ ] Verify it: `/check verify project manifest and publishing`
- [ ] Test it: `/test project manifest and publishing`
- [ ] Review it (fresh model): `/check review project manifest and publishing`
- [ ] Document it: `/document project manifest and publishing`
- [ ] Ship it: squash merge with all checks green

### 39. Shared SaaS tenant provisioning · dropped
Dropped by spec 0007: AFT no longer hosts projects for customers.

### 142. Render and push thread · in-progress · GA · from spec 0007
The tracer bullet for delivery: connect an empty private repo through the AFT Delivery app, render the project with answers, scan it, and push one commit.
**Done when:** the connect flow refuses foreign installations, all repository installs, public and non empty repos (AC-23, D13, D27); the initial delivery starts by itself once paid and connected, renders logic free with encodings, and pushes with the `git` binary using a one repo token (AC-24, AC-25); a secret finding blocks the push (AC-26, D21); renders run one at a time within limits (AC-36, D22); no project code runs (AC-19); GitHub outages retry for 24 hours (D14); a protected default branch falls back to `aft/initial` (D19).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 1). Payment stubbed by an admin "mark paid" until feature 35.
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop render and push thread`
   - [ ] Purchase, answers, connection, and delivery tables with forced RLS (AC-24)
   - [ ] AFT Delivery app and the connect flow with every check (AC-23)
   - [ ] Render workflow with encodings, assets, `.aft/delivery.json`, limits (AC-19, AC-25, AC-36)
   - [ ] gitleaks with the pinned config, the `git` push wrapper, automatic initial delivery (AC-24, AC-26)
- [ ] Verify it: `/check verify render and push thread`
- [ ] Test it: `/test render and push thread`
- [ ] Review it (fresh model): `/check review render and push thread`
- [ ] Document it: `/document render and push thread`
- [ ] Ship it: squash merge with all checks green

### 143. Purchase form and answers · in-progress · GA · from spec 0007
The form each project defines, filled before checkout, with image uploads and secrets generated in the browser.
**Done when:** the form is generated from the manifest and validated server side with strict rules (AC-21, X8); images go up through a size capped presigned POST and are type checked; answers are versioned; `.env.example` lists every variable and generated secrets never reach AFT (AC-27).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 3).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop purchase form and answers`
   - [ ] Generated form, validators, answer revisions (AC-21)
   - [ ] Presigned POST uploads through the worker, image slot checks (AC-21)
   - [ ] Browser secret generator and `.env.example` (AC-27)
- [ ] Verify it: `/check verify purchase form and answers`
- [ ] Test it: `/test purchase form and answers`
- [ ] Review it (fresh model): `/check review purchase form and answers`
- [ ] Document it: `/document purchase form and answers`
- [ ] Ship it: squash merge with all checks green

## Slice 5: Delivery breadth

### 62. Deploy recipes, first hosting platform · in-progress · GA
Per target deploy files in every project (`deploy/<target>/` with its own `DEPLOY.md`), starting with Docker Compose and one hosting platform; each further target is enabled only after a real deploy.
**Done when:** the reference project carries a Compose recipe and one PaaS recipe (`vercel`, or `render` when the project needs Postgres plus a worker) that the engineer has deployed and recorded in `docs/runbooks/targets.md`; conformance runs each target's static validator; the target picker shows only enabled targets (D20).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 4).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop deploy recipes first hosting platform`
   - [ ] PaaS recipe and `DEPLOY.md` in the reference project, real deploy recorded (AC-20, AC-24)
   - [ ] Static validator in conformance, `ENABLED_TARGETS` updated (AC-20, D20)
- [ ] Verify it: `/check verify deploy recipes first hosting platform`
- [ ] Test it: `/test deploy recipes first hosting platform`
- [ ] Review it (fresh model): `/check review deploy recipes first hosting platform`
- [ ] Document it: `/document deploy recipes first hosting platform`
- [ ] Ship it: squash merge with all checks green

### 63. Contract conformance suite · dropped
Folded into feature 38: conformance runs as part of publishing (spec 0007 AC-20).

### 64. Instance model and state machine · dropped
Dropped by spec 0007: no hosted instances.

### 65. Tenant namespace isolation · dropped
Dropped by spec 0007: no hosted instances.

### 66. Instance deploy through GitOps · dropped
Dropped by spec 0007: no hosted instances.

### 67. Subdomains, DNS, and TLS · dropped
Dropped by spec 0007: customers host on their own domains.

### 68. Provisioning status UI · dropped
Replaced by the delivery status on the purchase page (features 142 and 144).

### 69. Per tenant secrets · dropped
Replaced by secrets generated in the customer's browser (spec 0007 AC-27).

### 70. Instance teardown · dropped
Dropped by spec 0007: no hosted instances.

### 71. Instance upgrades and rollback · dropped
Replaced by update pull requests (feature 145).

### 72. Suspend and resume instances · dropped
Dropped by spec 0007: no hosted instances.

### 73. Instance backups and restore · dropped
Dropped by spec 0007: customers back up their own hosting.

### 74. Custom domains · dropped
Dropped by spec 0007: customers point their own domains at their own hosting.

### 144. Zip delivery and retries · in-progress · GA · from spec 0007
A zip of the same render for customers without GitHub, and a retry path for failed or blocked deliveries.
**Done when:** an owner gets a presigned zip link valid 1 hour, kept 30 days and rendered again after (AC-28); a failed delivery can be retried by the owner and a blocked one by a platform admin with the reviewed fingerprints allowed (AC-39, D21); every mutating call honours `Idempotency-Key` (X1).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 5).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop zip delivery and retries`
   - [ ] Zip channel and its lifecycle (AC-28)
   - [ ] Retry endpoint and idempotency keys (AC-39)
- [ ] Verify it: `/check verify zip delivery and retries`
- [ ] Test it: `/test zip delivery and retries`
- [ ] Review it (fresh model): `/check review zip delivery and retries`
- [ ] Document it: `/document zip delivery and retries`
- [ ] Ship it: squash merge with all checks green

### 145. Update pull requests · in-progress · GA · from spec 0007
New versions reach subscribers as pull requests that merge the change between versions into the customer's current code.
**Done when:** each subscriber gets a PR built from the base in `.aft/delivery.json`, whatever merge style they used (AC-29, D18); conflicts land as markers with an email (AC-32, D16); missing answers use defaults or wait for the owner (AC-31, D17); PR merges and closes are tracked from webhooks; updates per purchase run in order and are paced.
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 6).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop update pull requests`
   - [ ] Version fan out, ordering per purchase, pacing (AC-29)
   - [ ] Patch based merge onto the customer's head and the PR (AC-29, D18)
   - [ ] Conflicts, `needs_answers`, and `pull_request` webhooks (AC-31, AC-32)
- [ ] Verify it: `/check verify update pull requests`
- [ ] Test it: `/test update pull requests`
- [ ] Review it (fresh model): `/check review update pull requests`
- [ ] Document it: `/document update pull requests`
- [ ] Ship it: squash merge with all checks green

### 146. Critical fixes and lost repos · in-progress · GA · from spec 0007
Security fixes reach every buyer, and a lost, revoked, or public repo falls back to zips.
**Done when:** a critical version reaches every buyer as a `security` PR or zip notice (AC-30, D23); an uninstalled app, deleted, removed, or public repo marks the connection and switches updates to zips (AC-34, D15); an owner can replace the repo (D24); unpublished projects keep buyer access (D25).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 7).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop critical fixes and lost repos`
   - [ ] Critical version selection and delivery to non subscribers (AC-30)
   - [ ] Installation and repository webhooks, zip fallback, repo replacement (AC-34, D24)
- [ ] Verify it: `/check verify critical fixes and lost repos`
- [ ] Test it: `/test critical fixes and lost repos`
- [ ] Review it (fresh model): `/check review critical fixes and lost repos`
- [ ] Document it: `/document critical fixes and lost repos`
- [ ] Ship it: squash merge with all checks green

### 147. Delivery roles and audit · in-progress · GA · from spec 0007
Only owners act on purchases and deliveries; everything is audited.
**Done when:** every write checks the owner role (403 otherwise), members can read, other workspaces get 404 (AC-35, X15), and every purchase, answer, connection, delivery, refund, dispute, and subscription change is audited (AC-37).
Spec: [0007](../specs/0007-lean-hosting-customer-delivery/index.md), child 0002 (build step 8).
- [x] Design it (spec): `/architect lean ec2 hosting and customer-hosted delivery`
- [ ] Build it: `/develop delivery roles and audit`
   - [ ] Owner checks and cross workspace 404 on every endpoint (AC-35)
   - [ ] Audit entries (AC-37)
- [ ] Verify it: `/check verify delivery roles and audit`
- [ ] Test it: `/test delivery roles and audit`
- [ ] Review it (fresh model): `/check review delivery roles and audit`
- [ ] Document it: `/document delivery roles and audit`
- [ ] Ship it: squash merge with all checks green
