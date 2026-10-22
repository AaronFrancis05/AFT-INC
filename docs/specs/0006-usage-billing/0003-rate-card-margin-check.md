# 0006.0003. Rate card and monthly margin check

Part of [0006, usage billing](index.md). Shared rules are in the index *Cross child contract*. New feature, to enroll as 141.

## Summary

The rate card is AFT's price list in credits: one price per unit, like an instance minute or an image. Prices are versioned by date, so an old charge always shows the price that applied, and a rise needs 30 days' notice to customers. Once a month, AFT compares what each workspace was charged with what AWS and the AI providers really cost, and alerts when the margin is too thin.

## Data model

**RateCardPrice** (global, not tenant scoped: no RLS, readable by `aft_app`, writable only by `aft_migrator`)
- `id` uuid PK
- `unit_code` text not null
- `credits_per_unit` numeric(14,6) not null, check `>= 0`
- `unit_label` text not null (what customers see, for example "per instance minute (small)")
- `effective_from` timestamptz not null, check aligned to the UTC hour (minutes and seconds zero)
- `created_by` text not null (git author of the seed change)
- `created_at` timestamptz
- Unique `(unit_code, effective_from)`

**MarginReport** (system only: no RLS policy for tenants and no grant at all to `aft_app`; `aft_system` writes; a new read only role `aft_admin_read` has SELECT and is used only by admin routes after the platform admin check; a migration test asserts `aft_app` gets permission denied)
- `id` uuid PK, `period` date not null (first day of the UTC calendar month), `organization_id` uuid null (null only on the one summary row per period)
- `charged_credits` int not null (sum of `debit` minus `release` entries in the month)
- `aws_cost_minor` int not null (US cents, from Cost Explorer, 0 for shared SaaS)
- `ai_cost_minor` int not null (US cents, from the AI gateway's cost records)
- `actual_cost_minor` int not null (the two summed)
- `margin_pct` numeric(6,2) null (null when `charged_credits = 0`)
- `unattributed_cost_minor` int null (summary row only: total `aft-tenants` cost minus the sum attributed by tag)
- `created_at`
- Unique `(period, organization_id)` with `NULLS NOT DISTINCT`, so one summary row per period

## Flows

**Publishing prices**: prices live in `packages/billing/rate-card.ts` as a typed list of `{unitCode, creditsPerUnit, unitLabel, effectiveFrom}`, changed by pull request. `pnpm --filter @aft/billing rate-card:publish --env <env>` (run by the release pipeline after migrations, spec 0005 child 0006):
1. Compares the file to the table; inserts only new rows (rows are never updated). Refuses any `effective_from` not on a UTC hour.
2. Refuses a new row whose price is higher than the price in force at its `effective_from` unless `effective_from >= now + 30 days` (AC-22). The first price of a new unit is not a rise and needs no notice.
3. For each accepted rise, starts `notifyPriceChange` (DBOS) emailing all workspace owners the unit, old and new price, and date; idempotent per row id.

**CI check**: unit codes are built only through typed helpers in `packages/billing/units.ts`, which also export the complete lists of instance size codes (`INSTANCE_SIZES`) and AI model ids (`AI_MODELS`) the platform can use; a test expands every helper over those lists and fails when any resulting unit code has no row in `rate-card.ts` (AC-20). Adding a model or size therefore requires adding its price.

**Tagging** (CDK, spec 0005 child 0002): an aspect on every dedicated instance construct applies `aft:org=<organization_id>` and `aft:instance=<instance_id>`; a CDK assertion test fails if any taggable resource in an instance stack lacks `aft:org` (AC-23). Shared resources (ALB, cluster, NAT free VPC) are not split per workspace.

**Monthly report** (`marginReportMonthly`, DBOS scheduled 06:00 UTC on the 5th, by when Cost Explorer has settled the previous month, worker): the period is the previous UTC calendar month, not each workspace's billing period.
1. Assume role `BILLING_CE_ROLE_ARN` in the management account (policy: `ce:GetCostAndUsage` only; trust: the worker task role in production only).
2. Two `GetCostAndUsage` calls for the month, `MONTHLY`, metric `UnblendedCost`, filter linked account `aft-tenants`: one grouped by tag `aft:org`, one ungrouped for the total. Convert dollars to cents, rounding half up.
3. Sum AI provider cost per workspace for the month from the AI gateway's per call cost records (feature 26).
4. Sum charged credits per workspace from the ledger (`debit` minus `release` entries in the month).
5. Upsert one `MarginReport` per workspace with any charge or cost; `margin_pct = (charged - actual) / charged × 100`. Upsert the summary row (`organization_id` null) with the totals and `unattributed_cost_minor` = total minus attributed.
6. Alert `billing.low_margin` (Grafana, spec 0005 child 0009) for each row below `BILLING_MARGIN_FLOOR_PCT`, for each row with `charged_credits = 0` and `actual_cost_minor > 0` (cost with no revenue, such as unpriced or not billed usage), and when `unattributed_cost_minor` exceeds $1. Shared platform cost (ALB, cluster, CloudFront) is not split per workspace, so per workspace margins are an upper bound; the summary row shows the real total.

## API surface

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `rate-card:publish` | CLI script | `--env` | rows inserted, notices started | pipeline role (`aft_migrator`) | exits non zero on a rise with short notice |
| `billing.priceFor` (port) | function | unitCode, at | `RateCardPrice` or null | server | none |
| `GET /pricing` data (feature 53) | read | none | current and announced prices with labels | public | none |
| `marginReportMonthly` | DBOS scheduled workflow | none | reports written | worker, production only | Cost Explorer throttled → retry with backoff for 24 hours, then alert |
| `/admin/billing/margins` | page | month | reports sorted by margin | platform admin | 403 |

## Value sourcing

| Action | Value | Source |
|---|---|---|
| Publish | prices, labels, dates | `packages/billing/rate-card.ts` in the commit being released |
| Publish | owners to notify | members with role `owner` in every workspace with a `CreditAccount` |
| Report | AWS cost per workspace | Cost Explorer grouped by the `aft:org` tag, linked account `aft-tenants` |
| Report | AI cost per workspace | AI gateway per call cost records (feature 26) |
| Report | charged credits | ledger `debit` minus `release` entries in the month |
| Alert | floor | `BILLING_MARGIN_FLOOR_PCT` |

## Key invariants

- A `RateCardPrice` row is never updated or deleted.
- A price rise always has at least 30 days between publish time and `effective_from`.
- Every taggable tenant instance resource carries `aft:org`.

## Security model

- Rate card: public read (it is the price list), write only through the pipeline.
- Margin reports: platform admins only; never shown to customers.
- The Cost Explorer role is read only, one action, assumable only by the production worker.

## Configuration required

- `BILLING_CE_ROLE_ARN`: the management account role for Cost Explorer (production only; staging skips the AWS part of the report).
- `BILLING_MARGIN_FLOOR_PCT`: margin alert floor, default `20`.

## Critical test scenarios

- Price history: charge at old price, publish a rise 30 days out, charge again before and after the date → each event shows its own price. Verifies AC-21.
- Short notice: a rise 10 days out → publish exits non zero, nothing inserted. Verifies AC-22.
- Tag assertion: an instance stack with an untagged bucket → CDK test fails. Verifies AC-23.
- Report: stubbed Cost Explorer returns $12.00 for org A, ledger shows 1,400 credits charged, AI cost $0 → margin 14.29 percent → alert. Verifies AC-24.
- Cost with no charge: org B has $3.00 cost and 0 credits charged → alert. Verifies AC-24.
- Grants: `aft_app` selecting from `MarginReport` → permission denied. Verifies AC-26.

## Rationale (short)

A fixed rate card gives customers stable, readable prices and lets the hot path price usage instantly; real cost arrives days later, so it serves as a monthly check on the prices, not as the price itself. Prices as code in a pull request give review, history, and rollback for free, where an admin screen would need its own audit trail; an admin screen can come with catalog admin (feature 49) if prices change often.
