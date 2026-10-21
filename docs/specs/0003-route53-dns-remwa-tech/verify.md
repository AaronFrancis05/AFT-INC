# Verify: route 53 dns for remwa.tech · spec 0003 · updated 2026-10-21
_Steps derived from spec 0003 acceptance criteria and its Value sourcing table. `/check verify` runs these. Results from the build run on 2026-10-21 are noted in brackets._

All AWS commands use `--profile aft-admin` (run `aws sso login --profile aft-admin` first). Zone `Z09833751SWG47A0ZTLQL`.

## Console / manual
- [ ] AWS account email: the Organizations verification link was clicked → AC-1 [owed]
- [ ] Root: a second MFA device is registered, billing and alternate contacts are set → AC-3 [owed]
- [ ] Identity Center, Settings, Authentication: MFA "Every time they sign in", authenticator apps only, "Require them to register" → AC-2 [set by the engineer on 2026-10-21]
- [ ] Sign in to `https://d-936780ab43.awsapps.com/start` as `admin` → it asks for the authenticator code → AC-2
- [ ] name.com, remwa.tech, Manage Nameservers lists the 4 `awsdns` servers; Manage DNS Records still holds the 5 original rows until 2026-10-28 → AC-8
- [ ] MEMORY.md holds the rollback steps with the 4 old name.com nameservers → AC-8 [done]

## Commands
- [ ] `aws organizations describe-organization` → `o-albl1csv48`, management account `355103369250`, `ALL` → AC-1 [passed]
- [ ] `aws sts get-caller-identity --profile aft-admin` → `AWSReservedSSO_AdministratorAccess_*/admin` in `355103369250` → AC-3 [passed]
- [ ] `aws iam get-account-summary --profile aft-admin` → `AccountMFAEnabled` 1, `AccountAccessKeysPresent` 0 → AC-3 [passed: 1 and 0]
- [ ] `aws route53 list-hosted-zones --query "HostedZones[?Name=='remwa.tech.']"` → exactly one zone, tags `project=aft`, `managed-by=cli-pending-iac`, `spec=0003` → AC-4 [passed]
- [ ] Every row of `infra/dns/name.com-export-2026-10-21.csv` is in `infra/dns/remwa.tech.records.json` with the same value and TTL → AC-5 [passed: 5 of 5]
- [ ] `infra/dns/compare.ps1 -ZoneId Z09833751SWG47A0ZTLQL` → all match on 4 AWS nameservers, `ns1bqx.name.com`, and `test-dns-answer`; a scratch copy with one changed value exits 1 → AC-6 [passed]
- [ ] `nslookup -type=NS remwa.tech ns01.trs-dns.net` → the 4 `awsdns` servers → AC-7 [passed about 2 minutes after the switch]
- [ ] 1 hour: `compare.ps1 -ZoneId Z09833751SWG47A0ZTLQL -Against 8.8.8.8,1.1.1.1` → all match the baseline; Resend `GET /domains` shows `aft.remwa.tech` `verified`; a test email to `delivered@resend.dev` reaches `last_event: delivered` → AC-7 [passed; do not call `POST /domains/{id}/verify`, it sets the domain to pending for a few minutes]
- [ ] 48 hours (around 2026-10-23): `Resolve-DnsName remwa.tech -Type NS -Server 8.8.8.8` and `1.1.1.1` → only `awsdns` servers; `compare.ps1 -Against 8.8.8.8,1.1.1.1` → all match; Resend still `verified` → AC-7 [owed]
- [ ] `aws cloudtrail lookup-events` (eu-west-1 and us-east-1, writes since 2026-10-21 15:00 UTC) → only this build's actions; `aws budgets describe-budget --budget-name aft-monthly-10usd` → 10 USD monthly → AC-9 [passed; the Identity Center us-west-2 replica was removed, Identity Center uses an AWS owned key, and key `mrk-4967c969…` is pending deletion (replica 2026-11-20, then the primary)]

## Value sourcing coverage
- Records to copy: the CSV row check
- AC-7 baseline: `infra/dns/baseline-pre-switch.json`, used by `-Against`
- AWS nameservers: `aws route53 get-hosted-zone`, used by `compare.ps1`
- Old nameservers for rollback: the MEMORY.md rollback note
- Identity Center start URL: the access portal sign in step
- Resend API key: the Resend checks (read from `.env`, never printed)

## Acceptance-criteria coverage
- AC-1: verification email, describe-organization
- AC-2: MFA settings, portal sign in
- AC-3: get-caller-identity, account summary, root extras
- AC-4: one zone with tags
- AC-5: CSV to JSON row check
- AC-6: compare.ps1 pre switch, scratch mismatch
- AC-7: registry NS, 1 hour and 48 hour checks, Resend
- AC-8: name.com nameservers and records, rollback note
- AC-9: CloudTrail, budget
