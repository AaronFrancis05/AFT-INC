# 0003. Move remwa.tech DNS to Route 53

**Date**: 2026-10-21
**Status**: In Progress

## Summary

This spec moves the DNS for remwa.tech (the address book that tells the internet where the domain's services live) from name.com to AWS Route 53, while the domain registration stays at name.com. Before creating anything, it sets up a proper admin sign in for AWS (AWS Organizations plus IAM Identity Center), so no AWS resource is created as the root user. The five email records Resend needs are copied exactly and checked before the switch, and the old records stay in place for 7 days so the move can be undone. It is a thin first slice of scope feature 13: no website, certificates, or CDN yet.

## Context

The engineer owns `remwa.tech` at name.com, which today also serves its DNS (nameservers `ns1bqx`, `ns2dfg`, `ns3qtx`, `ns4hmp.name.com`). PLAN.md puts the platform's public entry on Route 53, ACM, and CloudFront, and scope feature 13 (edge, DNS, and certificates) owns that. A CloudFront distribution on the apex (`remwa.tech` itself) needs a Route 53 alias record, and automatic certificate validation and ExternalDNS (D5, feature 20) also need the zone in AWS. So the zone has to move eventually. Moving it now, while nothing is hosted, is the cheapest time: the only live traffic is email.

That email is the risk. `aft.remwa.tech` is verified in Resend (eu-west-1) and sends the sign up and reset codes. Public lookups and the name.com records page (screenshot, 2026-10-21, first four rows) show these records, all created 2026-10-20:

| Name | Type | Value | TTL |
|---|---|---|---|
| `rsend.aft.remwa.tech` | CNAME | `rsend-euw1.forge.rmta.net` | 300 |
| `send.aft.remwa.tech` | CNAME | `send.forge.rmta.net` | 300 |
| `aft.remwa.tech` | MX | `10 inbound-smtp.eu-west-1.amazonaws.com` | 300 |
| `resend._domainkey.aft.remwa.tech` | TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC2Pz265wS95HodMuDgVq/2QYMpuIC8aN6GGhbKW3LgzFajSciXso7DCngh832yE4+ZmmJW+geX31mMvzMI82cMNuG2f90bbpigZJy93nRaZH8otS/UF3XV183Y+ZuBcCW++VVLAv91XEfzmXSFj0FCdBiVNeptgw/qeJpSNdqH5QIDAQAB` | 300 |
| `_dmarc.remwa.tech` | TXT | `v=DMARC1; p=none;` | (from the export) |

The apex has no A, MX, or TXT record, and DNSSEC is off (no DS record at the `.tech` registry). Public lookups can't list a whole zone (they missed `rsend.aft.remwa.tech` until the records page showed it), so the full list comes from the name.com **Export DNS records (CSV)** button. name.com's **URL Forwarding** and **Email Forwarding** are separate features that aren't shown as rows in that table, and they stop working once the nameservers move, so both must be checked and found empty (or replaced) before the switch. A record missed before the nameserver switch breaks email for as long as resolvers cache the new nameservers.

Second force: the AWS CLI profile `remwa` signs in as the account root user (MEMORY.md, 2026-10-19, open risk: "create an admin identity before any real resources"). Root actions are unrestricted and hard to scope or audit. The dev database (`aft-dev`) was already created that way. This would be the second real resource.

Third force: the infrastructure as code tool and its locked remote state are decided in scope feature 10, not yet specced. PLAN.md names Terraform (or OpenTofu). Whatever is created now has to be easy to adopt into that code later, with no change to live DNS.

## Requirements

**User stories**:
- As the operator, I want remwa.tech's DNS in Route 53, so that later slices can point the apex at CloudFront and validate certificates automatically.
- As the operator, I want sign up and reset emails to keep working through the move, so that no user notices it.
- As the operator, I want AWS changes made by a named admin identity with MFA instead of root, so that access is auditable and root stays locked away.

**Acceptance criteria**:
- **AC-1**: AWS Organizations is enabled with all features, account `355103369250` is its management account, the verification email to the account email is confirmed, and `aws organizations describe-organization` shows it. No other accounts and no SCPs are created in this slice.
- **AC-2**: IAM Identity Center is enabled in `eu-west-1` as an **organization instance** ("Enable with AWS Organizations", not the account instance choice). Before any user exists, MFA is set (Settings, Authentication, Multi-factor authentication) to: prompt "Every time they sign in", authenticator apps only, and "Require them to register an MFA device at sign in". There is one user, username `admin`, with an email the engineer chooses at build time (not stored in the repo). The engineer accepts the invitation, sets the password, and registers the authenticator on first sign in. The permission set is named exactly `AdministratorAccess` (AWS managed policy `AdministratorAccess`, session 8 hours), and it's assigned to `admin` on `355103369250`, with the assignment showing **Provisioned** before the next step.
- **AC-3**: the CLI profile `aft-admin` is written as the exact `~/.aws/config` block in Configuration required, and after `aws sso login --profile aft-admin` (opens a browser, with the engineer present), `aws sts get-caller-identity --profile aft-admin` returns an `AWSReservedSSO_AdministratorAccess_*` role in `355103369250`. Every AWS step after enabling Organizations runs with `aft-admin`. The root user has MFA on (precheck: no MFA means stop and add it first), a second root MFA device is registered, the billing and alternate contacts are set, and root has no access keys (the `remwa` profile is an `aws login` console session, not keys).
- **AC-4**: exactly one public hosted zone named `remwa.tech.` exists in `355103369250`, tagged `project=aft`, `managed-by=cli-pending-iac`, `spec=0003`. Rerunning the create step never makes a second zone. If a `remwa.tech.` zone already exists before this build, the build stops and asks the engineer.
- **AC-5**: every row of the name.com CSV export (saved as `infra/dns/name.com-export-2026-10-21.csv`) is either present in Route 53 with the same name, type, value, and TTL, or listed as deliberately dropped (with the reason) in MEMORY.md. The five records in Context are a minimum, never the full list by assumption. Rows are dropped only if they're name.com NS or SOA, parking, ALIAS or ANAME, or URL forwarding artefacts. The name.com URL Forwarding and Email Forwarding pages are confirmed empty before the switch; if either has an entry, the build stops and asks the engineer (a new decision, not the builder's). The kept set is committed as `infra/dns/remwa.tech.records.json`, the single source the IaC import in feature 10 reads.
- **AC-6**: before the switch, `infra/dns/compare.ps1` reports every kept record identical (value and TTL) on all four AWS nameservers and on `ns1bqx.name.com`, and `aws route53 test-dns-answer` agrees for each record. The same run saves the public answers from `8.8.8.8` as the baseline `infra/dns/baseline-pre-switch.json`. Any mismatch blocks the switch.
- **AC-7**: after the switch, by 48 hours public resolvers (`8.8.8.8` and `1.1.1.1`) return only the four Route 53 nameservers for `remwa.tech`. At the 1 hour check either nameserver set is acceptable (the `.tech` delegation is cached for about 3 hours), as long as the answers match the baseline. Every kept record matches the baseline, and Resend reports `aft.remwa.tech` as `verified` after a forced recheck. A test email from `no-reply@aft.remwa.tech` to `delivered@resend.dev` reaches `last_event` `delivered`.
- **AC-8**: the name.com DNS records stay untouched for 7 days after the switch, any record change in that window is made in both name.com and Route 53, and the zone is not deleted in that window. The rollback (the engineer, logged in to name.com, puts the four old nameservers back) is written in MEMORY.md with the four names before the switch.
- **AC-9**: no other AWS resources are created by hand (no CAA, DNSSEC, query logging, health checks, or certificates; the Identity Center service linked role is expected), checked through CloudTrail `lookup-events` and the console. The monthly budget `aft-monthly-10usd` is unchanged.

## Options considered

### How to create the zone before feature 10

**Option A: AWS CLI now, import into IaC later.** A short, checked command sequence creates the zone and records from a committed JSON file. Feature 10 adopts them with Terraform `import` blocks.
- Pros: no early choice of tool, state backend, or folder layout. The JSON file is a plain record of truth. Importing a zone and its records is routine and changes nothing live.
- Cons: until feature 10, the zone is managed by hand, so a console edit would drift from the JSON with nothing detecting it.

**Option B: Terraform now with local state.**
- Pros: closest to the end state, and the code exists from day one.
- Cons: it decides Terraform vs OpenTofu and the module layout before feature 10. The local state file is easy to lose or commit by mistake, and the state has to be migrated later.

**Option C: a CloudFormation stack.**
- Pros: AWS keeps the state, and the change is still code.
- Cons: moving to Terraform later means setting every resource to retain, deleting the stack, then importing, which is more steps and more risk than starting from the CLI.

### Admin identity

**Option A: AWS Organizations plus IAM Identity Center.**
- Pros: short lived credentials and no access keys on disk. MFA is enforced centrally, and it's the base feature 10 needs for separate staging and production accounts.
- Cons: this account becomes the management account, where AWS advises running no workloads, and the dev database already lives here. Setup is about 15 minutes of console clicks.

**Option B: a plain IAM user with MFA and access keys.**
- Pros: no Organizations, and fast.
- Cons: long lived keys on disk, and MFA is not enforced for CLI calls by default. Feature 10 throws it away.

### How much to move

**Option A: the whole domain (switch nameservers).**
- Pros: the apex can use a Route 53 alias to CloudFront, and all records live in one place.
- Cons: email depends on the copy being complete.

**Option B: delegate one subdomain (for example `app.remwa.tech`).**
- Pros: email is untouched.
- Cons: the apex can never alias to CloudFront, and DNS lives in two places forever.

## Decision

**Chosen options**: create with the AWS CLI now and import later, Organizations plus Identity Center first, move the whole domain, and verify before and after the switch with a 7 day rollback window. The zone lives in today's account (the future management account), the Identity Center home Region is `eu-west-1`, and the slice adds no extras.

Set up an admin identity, create the `remwa.tech` public hosted zone with a CLI script, copy the records from a committed JSON file, prove every answer matches name.com, then switch the nameservers at name.com, which keeps the registration.

**Implementation skills**: `aws-iam` (`~/.claude/skills/aws-iam/`) · `aws-networking` (`~/.claude/skills/aws-networking/`, Route 53)

## Rationale

Email is the only live service on the domain, and it carries the auth codes, so the design is built around never losing a record. The copy starts from the name.com records page (not from what lookups happen to find), lives in one committed JSON file, and is checked answer by answer against both nameserver sets before and after the switch. The 7 day window works because nameserver changes are fully reversible while the old records still exist at name.com.

The CLI start (Option A) is chosen because feature 10 hasn't picked the IaC tool or a state backend. Any code written today would either guess those or need a state migration. A zone plus a handful of records is the easiest thing in AWS to import, and the committed JSON keeps the source of truth in the repo meanwhile. The risk of a hand edit drifting is real but small for a few weeks, and the drift detection required by feature 10 (I5) closes it.

The admin identity comes first because the alternative is creating a second production relevant resource as root, which MEMORY.md already flagged. Organizations plus Identity Center is chosen over an IAM user because feature 10 needs Organizations anyway for staging and production accounts. Starting there avoids building an identity that gets thrown away. The cost is that today's account becomes the management account. Keeping the zone there is deliberate: subdomains like `staging.remwa.tech` can be delegated to member accounts later without moving the parent zone again, and moving a zone between accounts means recreating it and switching nameservers a second time.

Small calls made while writing (recommended, the engineer did not weigh in):
- **Records file at `infra/dns/remwa.tech.records.json`** in Route 53 `ChangeBatch` format (`UPSERT` actions), so the same file is both the CLI input and the import inventory. Runner up: a Markdown table, which can't be fed to the CLI.
- **TTLs**: copy each TTL from the name.com export, and use 300 seconds where the export shows none. Runner up: 3600 for everything, which makes a mistake slower to fix.
- **Comparison with PowerShell `Resolve-DnsName -Server <ns> -DnsOnly`**, because this machine runs Windows without `dig`. Runner up: installing `dig`.
- **Resend check through its API** (`GET https://api.resend.com/domains` with the local `RESEND_API_KEY`, read from `.env`, never printed), the same key the app uses. Runner up: the Resend dashboard, which is manual.
- **The `remwa` root profile stays on disk but unused.** The `aws-mcp` server setting `AWS_MCP_PROXY_PROFILES` in `~/.claude.json` moves to `aft-admin` only after the engineer approves that change (it is the engineer's local config). Runner up: deleting the root profile now, which removes a recovery path before the new one is proven.

## Feature design

**Data model sketch**: no application data. Infrastructure inventory:
- Organization: management account `355103369250`, all features.
- Identity Center: organization instance, home Region `eu-west-1`, identity source = Identity Center directory, one user (username and email entered by the engineer at build time, not stored in the repo), permission set `AdministratorAccess` (AWS managed policy, session 8h).
- Hosted zone: public, `remwa.tech.`, the AWS assigned delegation set of 4 nameservers (NS and SOA records are created by AWS and never copied or edited).
- Records: the kept set from AC-5, defined in `infra/dns/remwa.tech.records.json`.

**State transitions** (the cutover):
`not created` → `zone built` (records in, not public) → `verified` (AC-6 passes) → `switched` (name.com points to AWS) → `confirmed` (AC-7 at 48h) → `settled` (after 7 days). From `switched` or `confirmed`, a rollback goes back to `zone built` by restoring the name.com nameservers. Each transition is done by the engineer or by `/develop` with the engineer present, never automatically.

**Interface surface** (commands, all with `--profile aft-admin` except step 1):

| Step | Command or place | Key inputs | Key outputs | Key failure |
|---|---|---|---|---|
| Root prechecks | console: root MFA on, add a second MFA device, set billing and alternate contacts, Security credentials shows no access keys | none | none | no root MFA: stop, add it first |
| Enable Organizations | `aws organizations create-organization --feature-set ALL --profile remwa` (root, the last root action), then confirm the verification email and run `aws organizations describe-organization` | none | organization ID | `AlreadyInOrganizationException`: already done, continue |
| Identity Center | console, Region `eu-west-1`: Enable, choose "Enable with AWS Organizations"; Settings, Authentication: MFA as in AC-2 **before** creating the user; Users: add `admin`; Permission sets: predefined `AdministratorAccess`, session 8 hours; AWS accounts: assign `admin` plus `AdministratorAccess` on `355103369250`, wait for Provisioned. An organization instance can't be created from the CLI. | email (engineer) | AWS access portal URL (start URL), shown on the Identity Center dashboard | wrong Region: delete the instance and redo before any assignment (the home Region can't be changed later) |
| CLI profile | write the `~/.aws/config` block from Configuration required, then `aws sso login --profile aft-admin` | start URL | cached SSO token | browser does not open: copy the printed URL and code |
| Find or create zone | `aws route53 list-hosted-zones-by-name --dns-name remwa.tech --max-items 1`; a zone counts as found only if the returned `Name` is exactly `remwa.tech.` (the call can return the next zone in sort order). Only if none: `aws route53 create-hosted-zone --name remwa.tech --caller-reference remwa-tech-0003 --hosted-zone-config Comment="remwa.tech public zone, spec 0003, import into IaC in feature 10"` | fixed caller reference | zone ID (`/hostedzone/Z…`), 4 nameservers | `HostedZoneAlreadyExists` (caller reference reused): look the zone up by exact name and reuse it |
| Tag zone | `aws route53 change-tags-for-resource --resource-type hostedzone --resource-id <bare zone id, /hostedzone/ prefix stripped> --add-tags Key=project,Value=aft Key=managed-by,Value=cli-pending-iac Key=spec,Value=0003` | zone ID | none | `InvalidInput`: prefix not stripped |
| Write records | `aws route53 change-resource-record-sets --hosted-zone-id <zone id> --change-batch file://infra/dns/remwa.tech.records.json` run from the repo root, then `aws route53 wait resource-record-sets-changed --id <ChangeInfo.Id>` | the JSON file | change ID, `INSYNC` | `InvalidChangeBatch`: fix the file and rerun (UPSERT makes reruns safe) |
| Compare | `infra/dns/compare.ps1` (rules in Records file format) | the JSON file, the zone ID | per record: match or mismatch, plus the baseline file | any mismatch: stop |
| Switch | name.com, domain remwa.tech, Manage Nameservers: delete the 4 name.com servers, add the 4 AWS ones **without** the trailing dot. Right before, `Resolve-DnsName -Type DS remwa.tech -Server 8.8.8.8` must return no DS record. Registrar transfer lock stays on (it does not block nameserver changes). | the 4 AWS nameservers | none | a DS record exists: stop (DNSSEC would break the domain) |
| Confirm | `Resolve-DnsName -Type NS remwa.tech -Server 8.8.8.8 -DnsOnly` (and `1.1.1.1`), `compare.ps1 -Against 8.8.8.8,1.1.1.1` against the baseline, the Resend calls below | none | NS list, Resend status, `last_event` | not verified or not delivered at 48 hours: roll back |
| Resend | with `Authorization: Bearer <RESEND_API_KEY>` read from `.env` into a variable, never printed: `GET https://api.resend.com/domains` and pick `name == "aft.remwa.tech"`; `POST /domains/{id}/verify`; after a minute `GET /domains/{id}` must show `status: "verified"`; `POST /emails` from `AFT <no-reply@aft.remwa.tech>` to `delivered@resend.dev`, subject `DNS move check`; `GET /emails/{id}` must show `last_event: "delivered"` | API key | statuses | key lacks domain access (`401`/`403`): use the Resend dashboard for the domain status and the email log |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Records to copy | name, type, value, TTL | `infra/dns/name.com-export-2026-10-21.csv` (the engineer exports it; the JSON can't be written until it exists), reconciled with the Context table and the forwarding pages |
| AC-7 baseline | public answers before the switch | `infra/dns/baseline-pre-switch.json`, written by `compare.ps1` in build step 5 |
| Resend domain ID | ID | `GET /domains`, matched by `name` |
| Identity Center start URL | URL | the Identity Center dashboard after enabling |
| Zone creation | caller reference | fixed `remwa-tech-0003` (decided here) |
| Compare and switch | the 4 AWS nameservers | `DelegationSet.NameServers` from the create, or `aws route53 get-hosted-zone --id <zone id>` |
| Rollback | the 4 old nameservers | Context (`ns1bqx`, `ns2dfg`, `ns3qtx`, `ns4hmp.name.com`), copied into MEMORY.md |
| Identity Center user | username, email | the engineer at build time |
| Resend check | API key | `RESEND_API_KEY` in local `.env` |
| Tags | values | decided here (AC-4) |

**Key invariants**:
- The zone holds only the records in `infra/dns/remwa.tech.records.json` plus the AWS managed NS and SOA.
- Nothing about the nameservers changes at name.com until AC-6 passes for every record.
- No AWS action after enabling Organizations uses the root user.
- One zone named `remwa.tech.` in the account.
- During the 7 day window, name.com and Route 53 hold the same records, so a rollback never restores stale data.
- No name is looked up through a public resolver before its record exists in Route 53 (a "not found" answer gets cached).

**Records file format** (`infra/dns/remwa.tech.records.json`, UTF-8 **without** BOM, written with the Write tool or `[IO.File]::WriteAllText($path, $json, (New-Object Text.UTF8Encoding $false))`, never PowerShell 5.1 `>` or `Out-File`):
```json
{
  "Comment": "remwa.tech records copied from name.com, spec 0003",
  "Changes": [
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "aft.remwa.tech.", "Type": "MX", "TTL": 300,
      "ResourceRecords": [ { "Value": "10 inbound-smtp.eu-west-1.amazonaws.com" } ] } },
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "send.aft.remwa.tech.", "Type": "CNAME", "TTL": 300,
      "ResourceRecords": [ { "Value": "send.forge.rmta.net" } ] } },
    { "Action": "UPSERT", "ResourceRecordSet": { "Name": "_dmarc.remwa.tech.", "Type": "TXT", "TTL": 300,
      "ResourceRecords": [ { "Value": "\"v=DMARC1; p=none;\"" } ] } }
  ]
}
```
Rules: lowercase names ending in a dot; TXT values wrapped in escaped double quotes; a TXT value longer than 255 characters split into quoted pieces in one value (`"\"part1\" \"part2\""`; today's DKIM key is 216 characters, so one piece); MX as `"<priority> <host>"`; CNAME targets unquoted; each TTL from the CSV (300 where the CSV is blank).

**Compare script rules** (`infra/dns/compare.ps1`, committed): read the JSON; for each record query the exact type with `Resolve-DnsName -Name <n> -Type <t> -Server <s> -DnsOnly -NoHostsFile`; join TXT `.Strings` pieces before comparing; drop trailing dots and lowercase names and targets; compare TTL only against authoritative servers (the 4 AWS nameservers and `ns1bqx.name.com`), never recursive resolvers; also run `aws route53 test-dns-answer --hosted-zone-id <id> --record-name <n> --record-type <t>` per record. `-Baseline` writes `baseline-pre-switch.json` from `8.8.8.8`; `-Against <resolvers>` compares values (not TTLs) to that baseline. Exit code 1 on any mismatch.

**Security model**: only the Identity Center admin (with MFA) changes AWS. Root keeps MFA (two devices), has no access keys, and is used only for enabling Organizations. The management account can never be restricted by SCPs, one more reason to keep workloads out of it later. The name.com account (registrar lock stays on) is the other control point. Its login and 2FA are the engineer's. The DKIM value is a public key and safe to commit. No secret enters the repo or the chat (the Resend key is read from `.env` and not printed). DNSSEC stays off for now, a known gap owned by feature 13's hardening.

**Configuration required**: no app env vars. Local only, appended to `~/.aws/config` (the start URL comes from the Identity Center dashboard):
```ini
[sso-session aft]
sso_start_url = <AWS access portal URL>
sso_region = eu-west-1
sso_registration_scopes = sso:account:access

[profile aft-admin]
sso_session = aft
sso_account_id = 355103369250
sso_role_name = AdministratorAccess
region = eu-west-1
output = json
```
The `remwa` profile (root, `aws login` session) stays on disk, unused. Day to day database tooling keeps using it until `/sync` moves `AGENTS.md` to `aft-admin`. The `aws-mcp` server currently fails to connect anyway, which does not block this slice.

**Critical test scenarios** (manual, run by `/check verify`):
- Identity: `aws sts get-caller-identity --profile aft-admin` shows the SSO admin role, and signing in to the access portal asks for MFA, verifies **AC-2**, **AC-3**.
- Organizations: `describe-organization` shows `355103369250` as the management account, verifies **AC-1**.
- Idempotent create: running the find or create step twice leaves one zone, verifies **AC-4**.
- Pre switch: `compare.ps1` reports every record matching, and changing one value in a scratch copy of the JSON makes it exit 1, verifies **AC-6**.
- Inventory: every CSV row is in the JSON or in the MEMORY.md dropped list, verifies **AC-5**.
- Post switch: NS from `8.8.8.8` and `1.1.1.1` are AWS by 48 hours, values match the baseline, Resend shows `verified`, and the test email's `last_event` is `delivered`, verifies **AC-7**.
- Failure path: the rollback steps in MEMORY.md list the exact old nameservers, verifies **AC-8**.
- Scope: CloudTrail `aws cloudtrail lookup-events --profile aft-admin` for the build window and the console show only the expected changes, verifies **AC-9**.

## Build plan

Tracer Bullet: the thin thread is identity, then zone, then one record proven end to end against the new nameservers, then the rest, then the public switch.

1. With the engineer, run the root prechecks, enable Organizations as root, and confirm the verification email. Then in the console enable Identity Center in `eu-west-1` (organization instance), set MFA, create `admin`, create and assign `AdministratorAccess`, and wait for Provisioned. Write the `aft-admin` profile, sign in, and check it, satisfies **AC-1**, **AC-2**, **AC-3**.
2. Save the engineer's CSV as `infra/dns/name.com-export-2026-10-21.csv`, check both forwarding pages (any entry: stop and ask), apply the drop rule, and write `infra/dns/remwa.tech.records.json` in the documented format. Record dropped rows and reasons in MEMORY.md, satisfies **AC-5**.
3. Find or create the zone (exact name match, fixed caller reference), stop if an unexpected `remwa.tech.` zone exists, and tag it, satisfies **AC-4**.
4. Thin thread: write `infra/dns/compare.ps1`, apply only the DKIM record, wait for `INSYNC`, and prove it matches on all four AWS nameservers and on name.com, satisfies **AC-5**, **AC-6**.
5. Apply the full JSON, wait for `INSYNC`, run `compare.ps1` over every record, and save the baseline, satisfies **AC-5**, **AC-6**.
6. Write the rollback note (the four old nameservers, steps, the both places rule) in MEMORY.md. Check there's no DS record, then the engineer switches the nameservers at name.com, satisfies **AC-8**.
7. Confirm at about 1 hour (either nameserver set, answers match the baseline, Resend recheck and test email), then again at 48 hours (AWS nameservers only), satisfies **AC-7**.
8. Check CloudTrail and the console for unexpected changes, and confirm the budget is unchanged. Record the zone ID and nameservers in MEMORY.md, satisfies **AC-9**.

## Consequences

**Positive**:
- The apex and subdomains can be aliased to CloudFront and validated for certificates automatically in the next feature 13 slices.
- AWS work stops using root, and every later infrastructure feature starts from Organizations and Identity Center.
- The record set lives in the repo as reviewable JSON.

**Negative / tradeoffs**:
- Until feature 10 imports it, the zone is managed by hand, and a console edit would drift silently.
- Account `355103369250` is now the management account, and it already runs the dev database, which AWS advises against. Feature 10 should move workloads to member accounts.
- About $0.50 a month for the zone, plus negligible query charges.
- A missed record at name.com means broken email until it's added or the move is rolled back.
- Every AWS session now needs `aws sso login --profile aft-admin` with MFA, which is a little more friction than the root login.

**Neutral**:
- The registration, renewal (2027-10-20), and WHOIS privacy stay at name.com.
- After the 7 day window the name.com DNS records are inert. They can stay or be deleted.
- `AGENTS.md` names the `remwa` profile; `/sync` updates it to `aft-admin` after this ships.

## Follow-up

- [ ] Feature 10: import the zone and every record from `infra/dns/remwa.tech.records.json` into IaC with `import` blocks, change the `managed-by` tag, and add drift detection (I5).
- [ ] Feature 10: create staging and production member accounts, and plan moving the `aft-dev` database out of the management account.
- [ ] Feature 13 (rest): CAA records with the certificate choice, DNSSEC, query logging, the apex and `www` records, and delegating `staging.remwa.tech` to the staging account.
- [ ] Tighten DMARC from `p=none` once email is stable on Route 53 (feature 13 or 22).
- [ ] After the switch, register the production GitHub and Google OAuth redirect URIs as `https://remwa.tech/api/auth/callback/<provider>` (they only work once the app is hosted, feature 13 and later).
- [ ] With the engineer's approval, point `AWS_MCP_PROXY_PROFILES` in `~/.claude.json` at `aft-admin`.
