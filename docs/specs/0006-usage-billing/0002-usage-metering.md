# 0006.0002. Usage metering

Part of [0006, usage billing](index.md). Shared rules are in the index *Cross child contract*. Builds feature 59.

## Summary

Every billable thing a workspace uses becomes a usage event: a row saying what was used, how much, and when. AI jobs are paid up front by a reservation and settled when they finish. Everything else is recorded as it happens and charged in hourly or daily batches by the worker: instance minutes, API and MCP calls (counted per minute, not stored one row per call), storage, and bandwidth. The gateways check one Valkey key per call to know whether a workspace may still spend, so the database stays off the hot path.

## Data model

**UsageEvent** (forced RLS by `organization_id`)
- `id` uuid PK, `organization_id` uuid not null
- `source` enum `instance | ai | api | mcp | storage | bandwidth` not null
- `unit_code` text not null (index contract)
- `quantity` numeric(20,6) not null, check `>= 0` (for API and MCP rows: the number of calls in the group)
- `resource_ref` text not null (instance id, job ref, `<api_key_id>:<route>`, hostname, or `org` for storage)
- `occurred_at` timestamptz not null (for groups and batches: the start of the minute, hour, or day measured)
- `rate_price_id` uuid null FK RateCardPrice (null only for `not_billed` with no price, and for `rejected`)
- `micro_credits` bigint not null default 0 (`quantity × credits_per_unit × 1e6`, rounded half up to a whole micro credit)
- `status` enum `reserved | recorded | charged | not_billed | rejected` not null
- `status_reason` text null (`no_price`, `job_failed`, `safety_blocked`, `cap`, `payment`, `rate_limited`, `insufficient_credits`)
- `reservation_id` uuid null FK CreditReservation (AI only), `usage_batch_id` uuid null FK UsageBatch (batched sources)
- `idempotency_key` text not null, unique
- `created_at` timestamptz not null
- Index `(status, source, occurred_at) where status = 'recorded'` for the batch runner; index `(organization_id, occurred_at desc)` for the dashboard (feature 60)
- Retention: events older than 13 months are copied to a monthly S3 archive (Parquet, private bucket) and deleted. Ledger entries point at `UsageBatch` and `CreditReservation`, which are kept, so no foreign key blocks the delete.

**UsageBatch** (forced RLS; kept forever, one row per workspace, unit, and run)
- `id` uuid PK, `organization_id` uuid not null
- `unit_code` text not null, `run_id` text not null (the DBOS workflow id of the charge run)
- `event_count` int not null, `quantity` numeric(20,6) not null, `micro_credits` bigint not null
- `created_at` timestamptz
- Unique `(run_id, organization_id, unit_code)`

## Per source rules

| Source | Unit code | Measured by | When charged | Idempotency key |
|---|---|---|---|---|
| AI generation | `ai.llm.<model>.input_1k`, `.output_1k`, `ai.image.<model>.image`, `ai.video.<model>.second`, `ai.3d.<model>.model` | Reserve from the request (LLM: counted prompt tokens plus `max_tokens` as output; one line per unit); settle from the AI gateway's actual usage (feature 26) | At settle (child 0001); never by the batch | `call:<job_ref>:<unit_code>` |
| API call | `api.call` | Gateway (feature 75) counts calls in memory per `(org, api_key_id, route, status, minute)` and flushes counts every 10 seconds as one row per group | Hourly batch | `calls:<org>:<api_key_id>:<route>:<status>:<minute>:<flush_id>` |
| MCP call | `mcp.call` | MCP gateway (feature 77), same counting per tool name | Hourly batch | same shape with the tool name as route |
| Dedicated instance | `instance.<size>.minute` | Hourly at minute 2: per instance, running minutes in the past hour from its state history (feature 64), each part minute rounded up | Hourly batch | `instance:<instance_id>:<hour_utc>` |
| Storage | `storage.gib_day` | Daily at 00:30 UTC for the previous UTC day: time weighted average of bytes held, from each `Asset`'s `size_bytes`, `created_at`, and `deleted_at` (an asset held half the day counts half), in GiB | Daily | `storage:<org_id>:<date>` |
| Bandwidth | `bandwidth.gib` | Daily at 06:00 UTC for the day before yesterday (CloudFront logs can arrive up to 24 hours late): bytes sent from CloudFront standard logs (bucket `aft-<env>-cf-logs` in `aft-tenants` and each platform account) per hostname, mapped to a workspace by the hostname registry's history for that day (feature 67) | Daily | `bandwidth:<org_id>:<date>` |

Rejected calls (`status` other than success because of credits, cap, payment, or rate limit) are counted the same way with event status `rejected` and are never charged (M8). A crash loses at most 10 seconds of counts, accepted as a small revenue loss in place of per call writes. Bytes on a hostname with no registry entry for that day are summed into an alert `billing.unmapped_bandwidth`, not charged.

## Flows

**Pricing** (`billing_record_usage`): at insert, look up the `RateCardPrice` row for `unit_code` with the greatest `effective_from <= occurred_at`. None → `status = not_billed`, `status_reason = no_price`, `micro_credits = 0`, alert `billing.unpriced_unit` (AC-20). Rate card dates are aligned to the UTC hour (child 0003), so an hourly event never straddles a price change; a daily event uses the price in force at the start of its day.

**Hourly charge** (`chargeUsageHourly`, DBOS scheduled at minute 5 of each hour, worker): selects every `recorded` event with `source <> 'ai'` and `occurred_at < now - 10 minutes`, whatever hour it belongs to, so late rows are charged in the next run. Per `(organization_id, unit_code)`, in one transaction: insert a `UsageBatch` (`run_id` = this workflow id), set the events' `usage_batch_id` and `status = charged`, and run the *Batch charge* flow in child 0001. A retried step of the same run hits the unique `(run_id, org, unit)` and does nothing; a new run finds no `recorded` events left. One workspace failing never blocks the others. Daily sources use the same runner.

**Hot path check** (`canSpend`, used by the API and MCP gateways only; AI jobs always call `reserve`, which is the exact authority):
1. `GET billing:may_spend:<org_id>` from Valkey. Hit → use `may`.
2. Miss → read `CreditAccount` (state and spendable balance) through `forOrg`, write the key with TTL 60 seconds, return.
3. Valkey error → read Postgres as in step 2 and keep the result in a per process LRU cache (10,000 entries) for 30 seconds; log a warning once per minute.
4. `may` is true when `state = 'active'` and spendable balance `> 0`. A workspace at zero with a top up in flight is refused until the top up lands (usually seconds). Refusals return the error matching the account: `SPEND_CAP_REACHED`, `PAYMENT_REQUIRED`, or `INSUFFICIENT_CREDITS`, each with a link to `/dashboard/billing`.

The worker rewrites the flag from the outbox, polled every second; a Grafana alert fires when outbox lag exceeds 5 seconds (AC-19).

## API surface

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `billing.canSpend` (port) | function | orgId | `{may, reason}` | server | none (falls back to Postgres) |
| `billing.recordUsage` (port) | function | orgId, source, unitCode, quantity, resourceRef, occurredAt, idempotencyKey, status? | eventId | server (`billing_record_usage`) | duplicate key → returns the existing id |
| `billing.recordCallCounts` (port) | function | rows `[{orgId, apiKeyId, route, status, minute, count}]`, flushId | rows written | gateways | none |
| `chargeUsageHourly` | DBOS scheduled workflow | none | batches written | worker | retries per workspace |
| `meterInstancesHourly`, `meterStorageDaily`, `meterBandwidthDaily` | DBOS scheduled workflows | none | events written | worker | a log prefix with no files by 06:00 → retry hourly until 18:00, then alert |
| `archiveUsageMonthly` | DBOS scheduled workflow | none | rows archived | worker | none |

## Value sourcing

| Action | Value | Source |
|---|---|---|
| Instance event | size | `<size>` code on the instance record (feature 64) |
| Instance event | running minutes | timestamped state changes on the instance (feature 64) |
| AI reserve | estimated quantities | job request params (image count, video seconds, `max_tokens`) plus the AI gateway's prompt token count |
| AI settle | actual quantities | AI gateway usage record for the job (feature 26) |
| Call counts | workspace | the API key's `organization_id` (features 75, 77) |
| Storage event | GiB days | `Asset.size_bytes`, `created_at`, `deleted_at` (the asset model must keep `deleted_at`; S3 keys are already prefixed by org) |
| Bandwidth event | workspace | hostname to organization registry with validity dates (feature 67) |
| Any event | price | `RateCardPrice` in force at `occurred_at` (child 0003) |

## Key invariants

- Each billable occurrence or group has exactly one event (unique key), charged at most once: `recorded → charged` happens in the same transaction as its ledger debit, and AI events are never `recorded`.
- `rejected` and `not_billed` events are never charged.
- Prices are fixed at insert; the charge never looks a price up again.

## Security model

- Events and batches are tenant data under forced RLS; members read them through `getCreditSummary` and feature 60. `aft_app` writes events only through `billing_record_usage`, which can write `recorded`, `rejected`, or `not_billed`, never `charged`.
- `resource_ref` never holds request bodies, prompts, or secrets; call rows store the key id, never the key.
- CloudFront log buckets are private, readable only by the worker's task role, with 30 day expiry (they hold client IPs, personal data under GDPR).

## Configuration required

- `CLOUDFRONT_LOG_BUCKET`: the log bucket name per account, set by CDK.
- Valkey connection from spec 0005; no new secret.

## Critical test scenarios

- Instance: running 10:00 to 10:20 and 10:40 to 11:00 → one event of 40 minutes; rerunning the hour adds nothing. Verifies AC-15.
- AI never batched: a job held across an hour boundary → charged once, at settle. Verifies AC-4, AC-15.
- Rejected calls: 1,000 calls refused for `SPEND_CAP_REACHED` in one minute → one or a few `rejected` rows with total quantity 1,000, never charged. Verifies AC-16.
- Late rows: a flush for 10:58 arriving at 11:07 → charged in the 12:05 run. Verifies AC-16.
- Carry: three groups of 0.4 credits in run 1 → 1 credit, 0.2 carried; two more in run 2 → 1 credit, 0 carried. Verifies AC-18.
- Storage gaming: 10 GiB uploaded at 00:00 and deleted at 12:00 → 5 GiB days. Verifies AC-17.
- Valkey down: stop Valkey in the test stack → calls keep working, a capped workspace is still refused. Verifies AC-19.
- Unpriced unit: event with no price → `not_billed`, alert, nothing charged after a price is added. Verifies AC-20.

## Rationale (short)

Measuring instances from AFT's own state history charges within the hour, where the AWS cost report lags one to two days and would let caps react too late. Counting calls per minute keeps a leaked key or an attack from writing millions of rows, while the batch keeps the ledger small; the micro credit carry means a sub cent price is never rounded against the customer.
