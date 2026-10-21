# 0003. Move remwa.tech DNS to Route 53: rationale

The decision record behind [index.md](index.md).

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
