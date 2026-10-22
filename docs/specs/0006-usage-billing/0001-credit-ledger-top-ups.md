# 0006.0001. Credit ledger and automatic top ups

Part of [0006, usage billing](index.md). Shared rules are in the index *Cross child contract*. Builds feature 58.

## Summary

Each workspace has one credit account with two buckets: this month's allowance from the plan, and paid credits from top ups. Every change is written to an append only ledger (a history that is only ever added to) in the same transaction as the balance, and only a few database functions may write them, so a bug in request code cannot mint credits. When the balance runs low, a workflow charges the saved card through Stripe, retrying a declined card a few times before asking the owner; when a card fails or the cap is hit, new work stops but running instances get a grace period.

## Data model

All tables have `organization_id` and forced RLS (spec 0005 child 0003). Grants are in *Security model*.

**CreditAccount** (one per workspace, created by the `subscription_create` invoice)
- `organization_id` uuid PK, FK Organization
- `allowance_balance` int not null default 0, check `>= 0`
- `paid_balance` int not null default 0 (may be negative, see invariants)
- `carry_micro` bigint not null default 0, check `0 <= carry_micro < 1000000` (fraction carried between batch charges, AC-18)
- `topup_enabled` bool not null default true
- `topup_threshold` int not null, check `>= 0`
- `topup_amount` int not null, check `> 0` (the action also enforces `>= BILLING_MIN_TOPUP_CREDITS`)
- `monthly_cap` int not null, check `> 0`
- `period_start`, `period_end` timestamptz not null (the current monthly allowance period)
- `spent_this_period` int not null default 0 (usage credits debited this period net of releases, from reserve, settle, release, and batch charges)
- `cap_warned_80`, `cap_warned_100` bool not null default false (reset each period)
- `topup_failures` int not null default 0 (consecutive failed top ups), `topup_retry_at` timestamptz null
- `subscription_unpaid` bool not null default false (a cycle invoice failed), `dispute_open` bool not null default false
- `state` enum `active | blocked_cap | blocked_payment` not null default `active` (computed, see state rules)
- `first_blocked_at` timestamptz null (start of the current grace; cleared only after 24 hours back in `active` with a positive balance)
- `updated_at` timestamptz

**CreditLedgerEntry** (append only: no role has UPDATE or DELETE)
- `id` uuid PK, `organization_id` uuid not null
- `bucket` enum `allowance | paid` not null
- `amount` int not null, check `<> 0` (positive in, negative out; zero amounts are never written)
- `kind` enum `grant | topup | debit | release | expiry | refund | adjustment` not null
- `reason` text not null (human readable, never a secret)
- `usage_batch_id` uuid null FK UsageBatch (child 0002), `reservation_id` uuid null FK CreditReservation, `topup_id` uuid null FK TopUp
- `idempotency_key` text not null, unique
- `created_by` text not null (`system`, or the platform admin's user id for adjustments)
- `created_at` timestamptz not null
- Index `(organization_id, created_at desc)`

**CreditReservation** (kept forever; small)
- `id` uuid PK, `organization_id` uuid not null
- `job_ref` text not null (`<job_id>:<attempt>`), unique `(organization_id, job_ref)`
- `lines` jsonb not null (`[{unitCode, quantity, microCredits, ratePriceId}]`, the estimate)
- `amount` int not null (total credits held), `allowance_amount` int not null, `paid_amount` int not null (how the hold split across buckets)
- `period_start` timestamptz not null (the account's period when held)
- `status` enum `held | settled | released` not null
- `charged_credits` int null (set at settle)
- `expires_at` timestamptz not null (the job's timeout plus 15 minutes)
- `created_at`, `updated_at`

**TopUp**
- `id` uuid PK, `organization_id` uuid not null
- `credits` int not null, `amount_minor` int not null (equal to `credits`), `currency` text not null `'usd'`
- `stripe_payment_intent_id` text unique null (null only until the Stripe call returns)
- `status` enum `pending | requires_action | succeeded | failed` not null
- `failure_code` text null, `requires_action_until` timestamptz null (created plus 24 hours)
- `refunded_credits` int not null default 0, check `refunded_credits <= credits`
- `created_at`, `updated_at`
- Partial unique index `(organization_id) where status in ('pending','requires_action')`: one open top up per workspace

## State rules

`CreditAccount.state` is not set by hand. After every change, `billing_evaluate_state(org)` computes it, with `blocked_payment` taking precedence:
1. `blocked_payment` when `dispute_open`, or `subscription_unpaid`, or (spendable balance `<= 0` and no top up can land soon: top ups disabled, `topup_failures >= 3`, or a top up is `requires_action`, or `topup_retry_at` is in the future).
2. Else `blocked_cap` when `spent_this_period >= monthly_cap`.
3. Else `active`.

Entering `blocked_payment` sets `first_blocked_at` if it is null. Leaving it does not clear it; a daily check clears it once the account has been `active` with a positive balance for 24 hours, so flapping never restarts the grace.

`TopUp.status`: `pending → succeeded | failed | requires_action`; `requires_action → succeeded | failed` (failed when the owner does not confirm within 24 hours; the worker cancels the PaymentIntent).

`CreditReservation.status`: `held → settled | released`.

## Flows

All writes below happen inside the database functions named in *Security model*, each in one transaction that also enqueues `billing.account_changed(org)` in the outbox.

**Reserve** (`billing_reserve`, AI job start): input `job_ref` and `lines`. If a reservation with that `job_ref` exists, return it unchanged. Price each line at the rate in force now (child 0002); `amount = ceil(sum(microCredits) / 1e6)`. If `amount = 0`, write the usage events as `charged` with zero credits and return without a reservation. Otherwise conditional update `CreditAccount set allowance_balance -= a, paid_balance -= p, spent_this_period += amount where state = 'active' and allowance_balance + paid_balance >= amount and spent_this_period + amount <= monthly_cap`, with `a = min(allowance_balance, amount)` and `p = amount - a`. Zero rows → return `INSUFFICIENT_CREDITS`, `SPEND_CAP_REACHED`, or `PAYMENT_REQUIRED` from the account's facts. Insert the reservation, one `debit` entry per bucket touched (key `resv:<reservation_id>:<bucket>`), and one `UsageEvent` per line with status `reserved` (key `call:<job_ref>:<unit_code>`).

**Settle** (`billing_settle`): input `reservation_id` and actual quantities per line. Price each line with the reservation's `ratePriceId`; `charged = min(ceil(sum / 1e6), amount)`; the job's provider overrun above the hold is absorbed by AFT and shows in the margin report. Release `amount - charged`: to the paid bucket first, up to `paid_amount`, then to the allowance bucket only if `period_start` equals the account's current `period_start` (otherwise that allowance has expired and is not returned). `release` entries keyed `release:<reservation_id>:<bucket>`; `spent_this_period -= released`; events become `charged` with their actual quantities. Settling a `settled` reservation is a no op. Settling a `released` one (the sweeper beat it) with `charged > 0` writes fresh `debit` entries through the batch charge path (keys `latesettle:<reservation_id>:<bucket>`, may take `paid_balance` negative) and alerts `billing.late_settle`.

**Release** (`billing_release`, failure, safety block): returns `paid_amount` to paid and `allowance_amount` to allowance under the same period rule; events become `not_billed` with the reason (B9, G2). The sweeper runs every 5 minutes and releases held reservations past `expires_at`.

**Batch charge** (`billing_charge_batch`, worker only, child 0002): for one `UsageBatch`, `total = carry_micro + batch.micro_credits`, `credits = floor(total / 1e6)`, `carry_micro = total mod 1e6`; if `credits > 0`, debit allowance first then paid with no lower bound on `paid_balance` (the usage already happened), keys `batch:<usage_batch_id>:<bucket>`; `spent_this_period += credits`.

**After every committed change** (worker consumer of `billing.account_changed`, outbox polled every second): run `billing_evaluate_state`; rewrite the Valkey flag (index contract); send the 80 and 100 percent cap emails once each per period; start the top up workflow when its guard passes.

**Top up workflow** (DBOS `topUp(orgId)`, workflow id `topup:<org_id>:<next TopUp sequence>`):
1. Transaction step, guard: `topup_enabled`, not `dispute_open`, not `subscription_unpaid`, spendable balance `< topup_threshold`, `spent_this_period < monthly_cap`, `topup_failures < 3`, and `topup_retry_at` null or past. Insert `TopUp pending` with `credits = topup_amount + max(0, -paid_balance)` so the top up also covers any debt. The partial unique index makes a concurrent second run a no op.
2. Resolve the card: the subscription's `default_payment_method`, else the customer's `invoice_settings.default_payment_method`, else the newest card payment method attached to the customer. None → treat as a failure with `failure_code = no_payment_method`.
3. Stripe step: `paymentIntents.create` with `customer`, `payment_method` (from step 2), `amount = credits`, `currency = 'usd'`, `off_session: true`, `confirm: true`, metadata `{organization_id, topup_id}`, idempotency key `topup:<topup_id>`, and no `payment_method_types` (dynamic payment methods, per the `stripe-best-practices` skill).
4. A thrown card error carries the PaymentIntent in `error.payment_intent`; store its id. `last_payment_error.code = authentication_required` → `requires_action`, `requires_action_until = now + 24h`, email owners the confirm link. Any other code → `failed`, `failure_code`, `topup_failures += 1`, `topup_retry_at = now + [1h, 6h, 24h][topup_failures - 1]`, email owners. After the third failure no automatic attempt runs until an owner saves settings or Stripe reports a new default card (`customer.updated` or `payment_method.attached`), which reset `topup_failures` to 0.
5. Credits land only from the webhook, never from the step 3 response, so a lost response cannot double credit.

**Webhooks** (through feature 36's idempotent intake, worker, `aft_system`):
- `payment_intent.succeeded` with `topup_id` metadata: TopUp `succeeded`; `topup` entry `+credits` in `paid` (key `topup:<payment_intent_id>`); `topup_failures = 0`, `topup_retry_at = null`. A negative `paid_balance` is repaid by this naturally (AC-12).
- `payment_intent.payment_failed` for a TopUp still `pending` or `requires_action`: `failed`, counted as in step 4.
- `invoice.paid` where `billing_reason in ('subscription_create', 'subscription_cycle')` and the line is the plan's subscription price; all other invoices are ignored here. `subscription_create` creates the `CreditAccount` with the AC-8 defaults if missing. Then in one transaction: `expiry` entry for the remaining `allowance_balance` (key `expiry:<invoice_id>`, skipped when zero), `grant` entry for the plan's `monthly_credit_allowance` (key `grant:<invoice_id>`), set `period_start`/`period_end` from the line period, reset `spent_this_period` and the warning flags, set `subscription_unpaid = false`. An invoice whose period starts before the current `period_start` grants nothing (late event, B26).
- Annual plans: the invoice grants the first month; DBOS timer `grantAllowanceMonthly` fires on each monthly anniversary of the annual period while the subscription is active (feature 36 state), doing the same expire and grant with keys `grant:<subscription_id>:<month_start>` and `expiry:<subscription_id>:<month_start>`.
- `invoice.payment_failed` with `billing_reason = 'subscription_cycle'`: `subscription_unpaid = true`; no rollover, the old allowance stays until a paid invoice. Dunning itself is feature 55.
- `charge.dispute.created`: find the TopUp through the charge's `payment_intent`; `adjustment` of `-(credits - refunded_credits)` in `paid` (key `dispute:<dispute_id>`), `dispute_open = true`. Disputes on subscription charges are feature 54's.
- `charge.dispute.closed`: `status = won` → `adjustment` of the same amount back (key `dispute_won:<dispute_id>`); either way `dispute_open = false`. A lost dispute leaves any negative `paid_balance` as debt, repaid by the next top up.
- `customer.updated`, `payment_method.attached`: reset `topup_failures` as in step 4.

**Cash refund** (`billing_refund`, platform admin action, or workspace deletion): in one transaction, `refundable = max(paid_balance, 0)`; walk succeeded top ups newest first with `credits - refunded_credits > 0`; for each part, insert a `refund` entry of `-part` in `paid` (key `refund:<entry_id>`, the id generated first), add to `refunded_credits`, and enqueue `billing.stripe_refund(entry_id)`. The outbox step calls `refunds.create` with `payment_intent` and `amount = part`, idempotency key `refund:<entry_id>`. If Stripe rejects it, write an `adjustment` of `+part` (key `refund_failed:<entry_id>`), subtract from `refunded_credits`, and alert. Credits leave the balance before money moves, so a crash can never leave refunded cash spendable.

**Admin adjustment** (`billing_adjust`, platform admin): bucket, signed amount, reason; key `adjust:<uuid>`; audited. Never lets `allowance_balance` go below zero.

**Grace and suspension**: a daily check at 00:15 UTC requests suspension (feature 72) for every account whose `first_blocked_at` is more than `BILLING_TOPUP_GRACE_DAYS` ago and still `blocked_payment`, idempotent per `(org, first_blocked_at)`. When such an account becomes `active` again, the consumer calls feature 72's resume.

## API surface

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `billing.reserve` (port) | function | orgId, jobRef, lines `[{unitCode, quantity}]` | reservationId or null (zero cost), credits | server, `forOrg` | `INSUFFICIENT_CREDITS`, `SPEND_CAP_REACHED`, `PAYMENT_REQUIRED`, `UNPRICED_UNIT` |
| `billing.settle` (port) | function | reservationId, actual `[{unitCode, quantity}]` | charged credits | server | none (idempotent; late settle alerts) |
| `billing.release` (port) | function | reservationId, reason | released credits | server | none (idempotent) |
| `billing.getCreditSummary` (port) | function | orgId, viewerRole | balances, state, period, spent, cap, entries (paged, 50); for owners also settings, top ups, failure count | server | `FORBIDDEN` |
| `updateTopUpSettings` | server action | enabled bool, threshold int, amount int, cap int | updated settings | owner | 403, 422 (amount below minimum, cap below spent) |
| `/dashboard/billing/top-ups/[id]/confirm` | page | top up id | Stripe client secret for the Payment Element confirm step | owner of that workspace | 404 for another workspace or a top up not `requires_action` |
| `requestCashRefund` | admin server action | orgId, reason | refunded credits | platform admin | 409 when nothing refundable |
| `postAdjustment` | admin server action | orgId, bucket, amount, reason | entry id | platform admin | 422 when allowance would go negative |
| Stripe webhook | POST (feature 36 route) | event | 200 | Stripe signature | 400 bad signature |

## Value sourcing

| Action | Value | Source |
|---|---|---|
| Account creation | default threshold, amount, cap | plan `monthly_credit_allowance` and price (feature 32), rule in AC-8 |
| Allowance grant | credits | plan `monthly_credit_allowance` for the invoice line's price (feature 32) |
| Allowance grant | period | invoice line `period` (monthly plans) or the timer's month (annual plans) |
| Top up | customer, card | Stripe customer on the workspace subscription (feature 35); card resolved in step 2 |
| Top up | credits | `topup_amount` plus any debt |
| Reserve | credits | rate card price in force now × requested quantities (child 0002) |
| Settle | credits | the reservation's stored `ratePriceId` × actual quantities from the AI gateway (feature 26) |
| Dispute | top up | charge → `payment_intent` → `TopUp.stripe_payment_intent_id` |
| Emails | recipients | workspace members with role `owner` |
| Grace end | days | `BILLING_TOPUP_GRACE_DAYS` from `first_blocked_at` |
| Summary | what a viewer sees | `viewerRole` from the session's active organization membership |

## Key invariants

- Per bucket, the balance equals the sum of its ledger entries (nightly audit, AC-1).
- `allowance_balance >= 0` always. `paid_balance` may be negative in any state, only through batch charges, late settles, and disputes; reservations never take it below zero.
- At most one open top up per workspace; at most 3 automatic attempts in a row.
- Credits enter the paid bucket only from a Stripe success webhook, a won dispute, a failed refund reversal, or an audited admin adjustment.
- Expired allowance never comes back.
- No ledger row is ever updated or deleted.

## Security model

- **Database functions own every credit write.** `billing_reserve`, `billing_settle`, `billing_release`, `billing_record_usage`, and `billing_update_settings` are `SECURITY DEFINER` functions owned by `aft_migrator`, with a fixed `search_path`, that read the organization from `app.org_id` (spec 0005) and can only debit, release, or record. `aft_app` gets SELECT (under RLS) on `CreditAccount`, `CreditLedgerEntry`, `CreditReservation`, `TopUp`, and EXECUTE on those functions, and no INSERT, UPDATE, or DELETE on any credit table. Functions that add credits (`billing_grant`, `billing_topup_succeeded`, `billing_charge_batch`, `billing_refund`, `billing_adjust`, dispute handlers) are EXECUTE only for `aft_system`. A migration test asserts these grants.
- Owners: change settings (the owner check is in the server action; the function cannot raise spend beyond the values given), see top ups and card status, confirm a 3D Secure top up. Members and admins: read balance, state, and usage only (AC-25).
- Platform admin (Better Auth admin role): cash refunds and adjustments, both audited.
- Card data stays in Stripe (PCI DSS SAQ A); AFT stores only Stripe ids.
- Audit log (feature 48): settings change, top up created and finished, refund, adjustment, dispute, state change.

## Configuration required

- `BILLING_MIN_TOPUP_CREDITS`: smallest top up, default `1000` ($10).
- `BILLING_TOPUP_GRACE_DAYS`: days instances keep running in `blocked_payment`, default `7`.
- `BILLING_ZERO_PLAN_CAP`: monthly cap for a plan priced at zero, default `5000`.
- Uses `STRIPE_SECRET_KEY` and the webhook secret from features 35 and 36.

## Critical test scenarios

- Happy path: 30 allowance, 100 paid; reserve 40 for an image job → 30 allowance, 10 paid; settle at 25 → 10 back to paid, 5 to allowance. Verifies AC-1, AC-3, AC-4.
- B8: 20 parallel reservations of 10 against a balance of 50 → exactly 5 succeed. Verifies AC-2.
- Cap on reserve: spent 95 of a 100 cap, reserve 10 → `SPEND_CAP_REACHED`. Verifies AC-10.
- B29: hold 20 allowance, `invoice.paid` rolls the period, release → allowance part not returned. Verifies AC-5.
- B26 and replay: `invoice.paid` delivered twice and once late, plus a proration invoice → one grant, one expiry. Verifies AC-5.
- B15: two debits cross the threshold at once → one TopUp, one PaymentIntent. Verifies AC-7.
- B24: Stripe test card `4000002760003184` off session → card error with `authentication_required`, TopUp `requires_action`, email sent; unconfirmed after 24 hours → `failed`. Verifies AC-9.
- B28: three declines → retries at 1 h and 6 h, then none until the card changes. Verifies AC-11.
- Grace: declined card at zero balance → `blocked_payment`, API refused, instance charges go negative; day 8 → suspension requested once; a top up covering the debt → `active`, resume called. Verifies AC-11, AC-12.
- Refund crash: kill the worker after the ledger commit, before Stripe → on restart the outbox refunds once; balance already reduced. Verifies AC-13.
- Grants: `aft_app` inserting into `CreditLedgerEntry` → permission denied. Verifies AC-26.
- Auth: a member calling `updateTopUpSettings` → 403; workspace B opening A's confirm page → 404. Verifies AC-25.

## Rationale (short)

The ledger lives in AFT because the hot path must refuse a job the moment credits run out, which a Stripe side balance cannot answer without a network call. A cached balance changed by a conditional update in the same transaction as the ledger insert gives race free reservations without scanning history; database functions make "callers never mint credits" a grant, not a convention; the nightly audit catches any bug that splits balance from ledger.
