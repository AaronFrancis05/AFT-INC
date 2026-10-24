# 0006. Usage billing: workspaces pay for what they use, in the background

**Date**: 2026-10-22
**Status**: Proposed

> **Amendment owed (2026-10-24, spec [0007](../0007-lean-hosting-customer-delivery/index.md))**: AFT no longer hosts dedicated instances, and Valkey is dropped. Before features 58 and 59 build, rework through `/architect usage billing`:
> - remove AC-15 and the `instance.<size>.minute` unit
> - read AC-19 and B18's `billing:may_spend` flag from Postgres with a 30 second in process cache
> - keep credits for AI and media usage only
> - project purchases and updates subscriptions are plain Stripe Checkout (spec 0007 child 0002), outside the credit ledger

## Summary

Every workspace pays for the instances and services it uses without doing anything per resource. Each plan includes monthly credits (1 credit is 1 US cent); usage of dedicated instances, AI generations, API and MCP calls, storage, and bandwidth draws them down quietly, and when the balance runs low the saved card is charged for a top up automatically. A monthly spend cap, default on, stops a runaway bill, and AFT checks every month that its prices still cover what AWS and the AI providers really charged. This spec designs features 58 (credit ledger) and 59 (usage metering) and adds one new feature for the rate card and that cost check.

## Structure

| Child | What it decides | Supports |
|---|---|---|
| [0001-credit-ledger-top-ups.md](0001-credit-ledger-top-ups.md) | The balance, the append only ledger, reservations, the monthly allowance, automatic top ups and retries, the spend cap, refunds, disputes, and debt | Feature 58 |
| [0002-usage-metering.md](0002-usage-metering.md) | How each kind of usage is measured, priced, batched, and charged, and how the gateways check spend on the hot path | Feature 59 |
| [0003-rate-card-margin-check.md](0003-rate-card-margin-check.md) | The versioned price list in credits, how prices change, and the monthly check against real AWS and AI cost | New feature (enroll as 141) |

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a workspace owner, I want usage charged automatically from our credits and card so that nobody has to pay for each instance or job by hand.
- As a workspace owner, I want a spend cap and clear warnings so that a bug or a leaked key cannot run up a large bill.
- As a workspace member, I want to see the balance and why a job was refused so that I know what to do next.
- As the AFT operator, I want never to front cloud costs for a customer and to know each month whether my prices cover real cost.

**Acceptance criteria** (`[n]` is the owning child):

Ledger and balance [0001]
- **AC-1**: Every balance change writes one `CreditLedgerEntry` per bucket touched and updates `CreditAccount` in the same database transaction; a nightly audit finds each bucket's balance equal to the sum of its ledger entries for every workspace, and alerts on any difference.
- **AC-2**: Two jobs racing for the last credits never drive the spendable balance below zero: a reservation succeeds only through a conditional update that also keeps `spent_this_period + amount <= monthly_cap`, and the loser gets `INSUFFICIENT_CREDITS` or `SPEND_CAP_REACHED` (B8).
- **AC-3**: Debits draw on the allowance bucket first and the paid bucket only after the allowance reaches zero.
- **AC-4**: A failed or safety blocked AI job releases its whole reservation, a job that used less than it reserved releases the difference, and an AI job is charged exactly once, at settle; the ledger records why (B9, G2, B27).
- **AC-5**: Only the `subscription_create` and `subscription_cycle` invoices (and, for annual plans, a monthly timer) expire the unused allowance and grant the plan's allowance, exactly once even if the event arrives twice or late; allowance held in a reservation across a rollover is not returned when released (B10, X2, B26, B29, B30).
- **AC-6**: Paid credits never expire.

Top ups, cap, and failure [0001]
- **AC-7**: When the spendable balance falls below `topup_threshold` and top ups are enabled, AFT charges the saved card off session for `topup_amount` plus any debt; on `payment_intent.succeeded` the credits land in the paid bucket. At most one top up per workspace is open at a time (B14, B15).
- **AC-8**: Defaults for a new account: top ups on, threshold 20 percent of the monthly allowance, amount one allowance, monthly cap 3 times the plan price; with a zero allowance, threshold 500 and amount 2,000 credits; with a zero price plan, cap `BILLING_ZERO_PLAN_CAP` (5,000). Only owners can change them; the amount is at least `BILLING_MIN_TOPUP_CREDITS` and the cap cannot be set below what was already spent this period.
- **AC-9**: A top up that needs 3D Secure is marked `requires_action`, the owners get an email link that completes it in the browser, it counts as failed until completed, and it fails after 24 hours unconfirmed (B24).
- **AC-10**: `spent_this_period` counts usage credits debited this period net of releases. Owners are emailed at 80 and 100 percent of the cap, once each per period. At 100 percent the account is `blocked_cap`: top ups stop and new AI jobs and metered API and MCP calls are refused with `SPEND_CAP_REACHED`. The cap does not stop dedicated instances, which keep being charged (B21).
- **AC-11**: A declined top up is retried automatically after 1 hour and 6 hours, then stops until an owner changes the card or settings; owners are emailed each time. When the spendable balance reaches zero with no top up able to land, the account is `blocked_payment`: new AI jobs and metered calls are refused with `PAYMENT_REQUIRED`, while dedicated instances keep running and being charged for `BILLING_TOPUP_GRACE_DAYS` (7) from the first block, after which suspension (feature 72) is requested once, with data kept (B17, B28).
- **AC-12**: Batch charges, late settles, and disputes may take the paid bucket below zero in any state; the next successful top up pays the debt first, and the account returns to `active` (and suspended instances are resumed) once the spendable balance is above zero and nothing else blocks it.
- **AC-13**: Unused paid credits stay on a cancelled workspace's account. An AFT platform admin can refund them to the card on an owner's request (newest top ups first, never more than a top up's own amount); deleting a workspace refunds them automatically. Credits leave the balance before money is returned. Allowance credits are never refunded (B22, B23).
- **AC-14**: A disputed top up removes its unrefunded credits from the paid bucket and sets `blocked_payment`; a won dispute restores them (B19).

Metering [0002]
- **AC-15**: A running dedicated instance is charged per running minute at its size's rate, in an hourly run; running the hourly job twice for the same hour charges nothing extra (B16, X4).
- **AC-16**: API and MCP calls are counted per workspace, key, route, status, and minute, including calls refused for credits, caps, or rate limits (counted as `rejected`, never charged) (M8); an hourly run charges every uncharged count, late ones included, as one ledger debit per workspace and unit.
- **AC-17**: Storage is charged daily per GiB day from the time weighted average of AFT's asset records; bandwidth is charged daily per GiB from CloudFront standard logs for the day before yesterday, per tenant hostname (B32).
- **AC-18**: Fractions are never rounded up against the customer in batches: priced usage is kept in micro credits, each batch debits whole credits, and the remainder carries to the next charge.
- **AC-19**: The gateways decide whether a workspace may spend from one Valkey read; the flag changes within 5 seconds of a balance or state change (outbox polled every second, alert on lag over 5 seconds) and expires after 60 seconds. When Valkey is unreachable they read Postgres with a 30 second in process cache, so caps still hold (B18).
- **AC-20**: Usage of a unit with no price in force is recorded as `not_billed`, never charged later, and raises an alert; CI fails when any unit code the code can produce (every model and size) has no price in the rate card seed (B20).

Rate card and cost check [0003]
- **AC-21**: Each usage event is priced at the rate card row in force when the usage happened; a later price change never alters past charges.
- **AC-22**: Price dates fall on a UTC hour; publishing a price rise requires `effective_from` at least 30 days ahead and emails every workspace owner; a price cut or a new unit's first price may take effect at once (B25).
- **AC-23**: Every resource created for a dedicated instance in `aft-tenants` carries the cost allocation tag `aft:org`; a CDK assertion fails the build otherwise.
- **AC-24**: On the 5th of each month a job writes a `MarginReport` per workspace for the previous UTC month (credits charged versus real AWS cost by `aft:org` plus AI provider cost) and one summary row with unattributed cost, and alerts when a workspace's margin falls below `BILLING_MARGIN_FLOOR_PCT` (20), when a workspace has cost but no charge, or when unattributed cost exceeds $1.

Access and visibility [all]
- **AC-25**: All members of a workspace can see its balance, buckets, state, and usage; only owners see top up history, card details, and can change top up settings and the cap; every settings change, top up, refund, adjustment, dispute, and state change writes an audit log entry (feature 48).
- **AC-26**: No workspace can read or change another workspace's credit rows (forced RLS per spec 0005); the app database role cannot insert, update, or delete any credit row except through the billing functions, which can only debit, release, or record; margin reports are unreadable by the app role; rate card rows are readable by everyone and writable only by the publish script.

## Decision

**Chosen option**: Option 1: Prepaid allowance with automatic top ups, on an AFT owned ledger.

Each workspace holds an AFT ledger balance in credits, refilled monthly by the plan and automatically from the saved card, and every metered service draws on it at fixed rate card prices; Stripe only moves money. Metronome, which Stripe recommends for prepaid credit billing, was weighed and not chosen (rationale, Option 5).

**Implementation skills**: `dbos-typescript` (`.claude/skills/dbos-typescript/`) for the scheduled, top up, and outbox workflows · `stripe-best-practices` (`stripe/ai`, `.claude/skills/stripe-best-practices/`) for off session PaymentIntents, webhooks, refunds, and API version.

## Cross child contract

Rules every child and every caller follows.

- **Money**: 1 credit = 1 US cent. Stored balances and ledger amounts are integer credits; ledger rows are never zero. Priced usage is `micro_credits` (`bigint`, 1 credit = 1,000,000). Stripe amounts are integer cents in `usd`, so `amount_minor = credits`. Only `usd` exists until feature 56 decides otherwise.
- **Spendable balance** = `allowance_balance + paid_balance`. `allowance_balance` is never negative. `paid_balance` may go negative in any state, but only through batch charges, late settles, and disputes; reservations never take it below zero.
- **Ledger kinds**: `grant` (allowance in), `topup` (paid in), `debit` (usage or a reservation out), `release` (unused reservation back), `expiry` (allowance out at period end), `refund` (cash returned to the card, credits out), `adjustment` (dispute, failed refund reversal, or audited admin correction).
- **Idempotency keys** (unique on `CreditLedgerEntry` and `UsageEvent`): `grant:<invoice_id>` or `grant:<subscription_id>:<month_start>`, `expiry:` with the same suffixes, `topup:<payment_intent_id>`, `resv:<reservation_id>:<bucket>`, `release:<reservation_id>:<bucket>`, `latesettle:<reservation_id>:<bucket>`, `batch:<usage_batch_id>:<bucket>`, `refund:<entry_id>`, `refund_failed:<entry_id>`, `dispute:<dispute_id>`, `dispute_won:<dispute_id>`, `adjust:<uuid>`; events: `call:<job_ref>:<unit_code>`, `calls:<org>:<api_key_id>:<route>:<status>:<minute>:<flush_id>`, `instance:<instance_id>:<hour_utc>`, `storage:<org_id>:<date>`, `bandwidth:<org_id>:<date>`. `job_ref` is `<job_id>:<attempt>`.
- **Unit codes** (rate card keys, `<source>.<thing>.<unit>`): `instance.<size>.minute`, `ai.llm.<model>.input_1k`, `ai.llm.<model>.output_1k`, `ai.image.<model>.image`, `ai.video.<model>.second`, `ai.3d.<model>.model`, `api.call`, `mcp.call`, `storage.gib_day`, `bandwidth.gib`. `<size>` comes from `INSTANCE_SIZES` and `<model>` from `AI_MODELS` in `packages/billing/units.ts`, which must match feature 64's size codes and feature 26's model ids.
- **Account states**: `active`, `blocked_cap`, `blocked_payment`, computed by `billing_evaluate_state`, with `blocked_payment` taking precedence. `canSpend` is false in both blocked states.
- **The billing port** (`packages/billing`, public entry only, spec 0005 child 0001): `canSpend(orgId)`, `reserve(orgId, jobRef, lines[])`, `settle(reservationId, actual[])`, `release(reservationId, reason)`, `recordUsage(event)`, `recordCallCounts(rows, flushId)`, `getCreditSummary(orgId, viewerRole)`. Callers never touch credit tables. The entitlements service (feature 37) calls `canSpend` for metered API and MCP capabilities; AI jobs rely on `reserve`.
- **Database access**: request paths run under `forOrg` (role `aft_app`) and can change credit data only through the `SECURITY DEFINER` billing functions (child 0001, *Security model*). Scheduled jobs, the outbox consumer, and webhook handlers run in `apps/worker` as `aft_system` and set the organization per row they write (spec 0005 child 0003). A new role `aft_admin_read` reads margin reports for admin routes only.
- **Outbox**: every billing transaction enqueues `billing.account_changed(org)`; the worker polls the outbox every second.
- **Hot path flag**: Valkey key `billing:may_spend:<org_id>`, value `{"may":bool,"reason":string|null,"balance":int}`, TTL 60 seconds, written by the outbox consumer. False means refuse for API and MCP calls.
- **Prerequisites this spec assumes** (none has a spec yet, see Follow-up): a Stripe customer per workspace with a card saved for off session use at checkout (35); idempotent Stripe webhook intake and subscription state (36); a plan field for the monthly allowance in credits and the plan price and interval (32); instance records with a size code and timestamped state changes, plus suspend and resume calls (64, 72); per call token counts and cost from the AI gateway (26); API keys with an organization (75, 77); `Asset` rows with `size_bytes` and `deleted_at`; a hostname registry with validity dates (67).

## Build plan

Tracer Bullet: one thin real thread through every layer first (one AI unit, end to end with a real Stripe test top up), then thicken one strand at a time. Each step is a slice `/develop` can ship and verify.

1. **Thread**: migration for all eight tables (`CreditAccount`, `CreditLedgerEntry`, `CreditReservation`, `TopUp`, `UsageEvent`, `UsageBatch`, `RateCardPrice`, `MarginReport`) with forced RLS, the role grants, and the `billing_reserve`, `billing_settle`, `billing_release` functions; rate card seed with one `ai.image.<model>.image` price; `packages/billing` port; one Media Studio image job calling it; a balance line on the dashboard; a test top up through a Stripe sandbox with the webhook landing credits. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-7**, **AC-21**, **AC-26**.
2. **Allowance**: account creation and grant from `subscription_create`, rollover from `subscription_cycle`, the annual monthly timer, `invoice.payment_failed` handling, default settings, the period rule on releases. Satisfies **AC-5**, **AC-6**, **AC-8**.
3. **Top up hardening**: threshold trigger from the outbox consumer, card resolution, card error handling with `requires_action` and its 24 hour expiry, the confirm page, retry backoff and reset, owner only settings form. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-11**, **AC-25**.
4. **Cap and blocked states**: `spent_this_period` everywhere, cap emails, `billing_evaluate_state`, grace with `first_blocked_at`, the daily suspension check and resume, debt repaid by top ups. Satisfies **AC-10**, **AC-11**, **AC-12**.
5. **Hot path**: outbox consumer writing the Valkey flag, `canSpend` with the Postgres fallback, outbox lag alert, wired into the entitlements service. Satisfies **AC-19**.
6. **API and MCP metering**: in gateway counting, `recordCallCounts`, `UsageBatch` and the hourly charge with micro credit carry. Satisfies **AC-16**, **AC-18**.
7. **Instance metering**: hourly per minute events from instance state history. Satisfies **AC-15**.
8. **Storage and bandwidth**: time weighted storage, delayed CloudFront log parse with registry history and the unmapped alert. Satisfies **AC-17**.
9. **Rate card publishing**: hour aligned versioned rows, publish script with the 30 day rule and owner emails, CI check over every model and size, `not_billed` with alert. Satisfies **AC-20**, **AC-21**, **AC-22**.
10. **Refunds, disputes, adjustments**: ledger first cash refund through the outbox, refund on workspace deletion, dispute created and closed handlers, admin adjustment. Satisfies **AC-13**, **AC-14**.
11. **Cost check**: `aft:org` tag aspect with CDK assertion, Cost Explorer role, monthly margin report with the summary row and alerts, nightly ledger audit. Satisfies **AC-1**, **AC-23**, **AC-24**.
12. **Audit and visibility pass**: audit entries for every money and settings change, member versus owner views, the grant tests. Satisfies **AC-25**, **AC-26**.

Steps 1 to 4 need features 35 and 36; step 6 needs 75 and 77; step 7 needs 64 and 72; step 8 needs 67. Build each when its prerequisite exists.

## Consequences

**Positive**:
- AFT never fronts a month of cloud and AI cost: usage is paid before or within an hour of it happening.
- Customers see stable prices and a predictable bill, with a cap that protects them from bugs and leaked keys.
- One ledger answers every "why was I charged" question, and the monthly check shows which prices lose money.

**Negative / tradeoffs**:
- AFT builds and owns a ledger, top up engine, and metering pipeline instead of using Stripe's usage billing or Metronome; that is real GA code to test and operate.
- AFT holds prepaid money: refunds of unused paid credits are owed (AC-13), and the tax treatment of credit purchases must be settled in feature 56 before production top ups.
- Many small card charges cost Stripe fees per charge; the minimum top up keeps this in check but does not remove it.
- The balance lags API usage by up to about 70 minutes; a burst inside that window can overshoot the cap by those calls.
- Instances are not stopped by the cap, only by unpaid grace, so a workspace can spend past its cap on instance hours.
- Shared SaaS tenants and shared platform cost have no per workspace AWS figure, so per workspace margins are an upper bound.
- Logic in `SECURITY DEFINER` functions is harder to test and change than application code.

**Neutral**:
- Eight new tables, all under forced RLS, a new `aft_admin_read` role, and new hourly, daily, monthly, and nightly workflows in `apps/worker`.
- PCI DSS scope stays minimal (SAQ A): card data never touches AFT, only Stripe ids.

## Follow-up

- [ ] Engineer review of refinements made while writing and after the cross check (rationale, *Refinements after the data model confirm*): micro credits, `UsageBatch`, call counting per minute, `reserved` event status, reservation lines and period, top up retry fields, computed states, and the database function boundary.
- [ ] Add edge cases B14 to B32 (listed in [rationale.md](rationale.md)) to the PLAN.md catalog, through `/scope` with a dated MEMORY.md line.
- [x] Rate card and cost check enrolled as feature 141 in `docs/scope/commerce.md`; features 58 and 59 linked.
- [ ] `/scope`: reword feature 59's intent and **Done when** (they say usage "reaches Stripe"; under this spec usage reaches the AFT ledger and Stripe only moves money for top ups), and feature 60's credit purchase link to the top up settings.
- [ ] Engineer: activate the `aft:org` cost allocation tag in the management account's Billing console (tags only appear in Cost Explorer after activation, and not retroactively).
- [ ] Specs owed before steps 1 to 4: subscription checkout (35, must save the card for off session use), webhook intake (36, must subscribe to the events in child 0001), plans and pricing (32, must add `monthly_credit_allowance`, price, and interval).
- [ ] Spec 0005 child 0003: add the `aft_admin_read` role and the billing function grants to the roles table.
- [ ] Feature 56: decide VAT on credit top ups before any production top up; until then top ups run only for sign up allowlisted workspaces.
- [ ] Feature 67: every tenant facing hostname must sit behind CloudFront with standard logging on, and the hostname registry must keep validity dates, or its bandwidth is not metered.
- [ ] Feature 72: provide idempotent suspend and resume calls for this spec's grace check.
- [ ] Feature 55 owns the grace length long term; this spec sets `BILLING_TOPUP_GRACE_DAYS=7` until then.
- [ ] Connect the Stripe MCP server at feature 35 (official; confirm the install command on docs.stripe.com first).
- [ ] `/sync`: add `stripe-best-practices` to `AGENTS.md` `## Agent skills` (area: billing, so a nested `packages/billing/AGENTS.md` once the package exists).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
