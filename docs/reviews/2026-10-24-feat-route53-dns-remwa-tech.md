# Review, feat/route53-dns-remwa-tech, 2026-10-24

**Reviewed by**: Sonnet 5.5 (author on unknown)
**Scope**: 8 files, branch vs main
**Verdict**: Approve with nits

## Summary
Adds the five record JSON, a PowerShell compare tool, the baseline, the spec 0003 split (index, rationale, verify) and memory and scope notes. The records file is well formed and matches the baseline and the spec format. The script works on the happy path and fails closed on most lookups, but a few empty-result paths in it can report a pass when a check was skipped. Nothing blocks the merge, since the cutover is already done and verified.

## Minor
### 🟡 Missing or empty baseline passes silently, `infra/dns/compare.ps1:80-83`
**Problem**: In `-Against` mode, if the baseline has no row for a record, `$base` is null, `@($base.Values)` becomes a one element array holding null, and it joins to an empty string. An empty resolver answer also joins to an empty string, so they compare equal and print `ok`.
**Why it matters**: A record missing from the baseline, or a baseline saved with empty Values, plus an empty resolver answer is a false pass on the check that gates trust after the switch.
**Suggested fix**: Fail when no baseline row is found or its Values are empty, and fail when a resolver returns zero values.

### 🟡 Baseline saves unverified, possibly failed, answers, `infra/dns/compare.ps1:111-113`
**Problem**: The baseline row is a fresh query to 8.8.8.8 that is never compared to the expected values. If that lookup fails, the text "lookup failed: ..." is saved as the baseline value, and an empty answer is saved as an empty list.
**Why it matters**: The baseline becomes the truth for AC-7. A cached, stale or failed answer is stored as correct, and `$failed` only covers the authoritative checks.
**Suggested fix**: Check the 8.8.8.8 answer against the expected values before saving, and refuse to save on a failed or empty lookup.

### 🟡 Failed AWS CLI calls are not detected, `infra/dns/compare.ps1:91`
**Problem**: `$ErrorActionPreference = "Stop"` does not catch a non-zero exit of the native `aws` command in PowerShell 5.1, and `$LASTEXITCODE` is never read. If `get-hosted-zone` fails (expired SSO, throttle), `$servers` shrinks to just `ns1bqx.name.com` with no error, and there is no check that 5 servers were queried.
**Why it matters**: AC-6 requires all four AWS nameservers. Today `test-dns-answer` usually fails too and catches a full credential outage, but a transient failure on one call alone would give "All records match" with the AWS nameservers skipped.
**Suggested fix**: Check `$LASTEXITCODE` after each `aws` call and fail, and assert the AWS server count is 4.

### 🟡 Scope and spec text is stale after verify, `docs/scope/foundation.md`
**Problem**: The slice 1 sub-items still say the 48 hour check and the Organizations email, second root MFA and contacts are owed, and the last checkbox is ticked. `docs/specs/0003-route53-dns-remwa-tech/verify.md` says all of these passed on 2026-10-24. Also AC-9 and the scope line say the budget is "unchanged", but verify records that `aft-monthly-10usd` was replaced by `aft-monthly-28usd`.
**Why it matters**: The scope file is the queue other sessions read, and it contradicts the verified state.
**Suggested fix**: Tick the two remaining items and drop the "owed" text, and note the budget replacement by spec 0007 where AC-9 is described (a /sync item).

## Nits
- ⚪ `infra/dns/compare.ps1:73`, `-Baseline` combined with `-Against` is silently ignored; throw a clear error instead.
- ⚪ `infra/dns/compare.ps1:23`, the baseline file is read without a missing-file check, so `-Against` before any baseline gives a raw error; a clear message would help.
- ⚪ `infra/dns/baseline-pre-switch.json`, written with 4 space indent and wide gaps from `ConvertTo-Json`; harmless, no change needed.
- ⚪ `docs/specs/0003-route53-dns-remwa-tech/index.md`, Status is still `In Progress`; flip it when the PR merges.

## Strengths
- The records JSON matches the spec's file format exactly (lowercase names with trailing dots, quoted TXT, UTF-8 without BOM) and holds no secrets (the DKIM value is a public key).
- `Query` turns a lookup exception into a mismatch rather than a crash, and TTL is compared only on authoritative servers, as the spec says.
- The comma-split fix for `powershell -File` and the exit code 1 on mismatch are correct and exercised in a real run.
- The rollback note, verify checklist and AC coverage map are thorough and traceable to the spec.

## Test coverage
Vitest does not apply to this ops script. It was exercised against live DNS (5 of 5 records on 4 AWS nameservers, name.com, test-dns-answer, 8.8.8.8 and 1.1.1.1) and with a changed value in a scratch copy. The untested paths are the empty baseline, failed `aws` call and failed baseline lookup cases above, which can give a false pass.
