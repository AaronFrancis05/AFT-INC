# 0006. Usage billing: rationale

Decision record for [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this topic spans three decisions that can be built separately: the ledger and top ups (feature 58), usage metering (feature 59), and pricing with a cost check (new). It is written as one umbrella with three children so the contract between them (units, money, keys, states) is decided once. It also assumes five things that have no spec yet: a Stripe customer with a card saved for off session use (35), webhook intake (36), a plan allowance and price (32), instance records with sizes and state history (64), and per call AI cost (26). The index lists each as a prerequisite and the build plan orders around them.

AFT sells things that cost it money every minute: dedicated instances on Fargate and Aurora in the `aft-tenants` account, AI generations billed per token or image by providers, gateway traffic, storage, and bandwidth. The engineer wants each workspace to pay for its own share without having to act per resource, while AFT, run by one engineer on a $300 a month launch budget, cannot afford to front a month of a customer's cloud and AI costs or absorb a bad card.

The forces are: payment must happen close to usage (cash risk); the gateways need a spend answer in about a millisecond (latency); concurrent jobs must never overspend (B8); customers need prices they can read and a bill they can predict (trust, and EU consumer expectations around prepaid money); real costs arrive late and in a different shape than usage (AWS Cost Explorer lags 24 to 48 hours); and everything must be idempotent because webhooks and workflows retry (X2, X4).

Compliance scope: payments (PCI DSS, kept to SAQ A by never handling card data), EU consumer rules on prepaid balances and price changes, and GDPR for CloudFront logs that contain client IPs. Audit logging of every money movement is required.

## Options considered

### Option 1: Prepaid allowance with automatic top ups, AFT ledger (chosen)

Plans include monthly credits; usage draws them down at rate card prices; a low balance triggers an off session card charge; the balance lives in AFT's Postgres ledger.

**Pros**: AFT is paid before or within an hour of cost; exact, instant spend checks; predictable prices; one history for support.
**Cons**: AFT builds and runs the ledger, top up engine, and metering; holds prepaid money it may need to refund; many small card charges.

### Option 2: Postpaid metered billing through Stripe Meters

Usage events go to Stripe Meters and appear as metered line items on the monthly invoice.

**Pros**: least code; Stripe handles aggregation, invoices, and tax on usage; no prepaid balances.
**Cons**: AFT fronts up to a month of cost per customer and loses it on a failed card; no instant spend answer, so caps react only after Stripe aggregates.

### Option 3: Stripe Billing credit grants on metered prices

Stripe credit grants absorb metered usage on the invoice, with auto top ups bought separately.

**Pros**: balance and usage shown in Stripe's portal; less ledger code.
**Cons**: still settles at invoice time; AFT cannot refuse a job the moment credits run out without mirroring the balance, which brings back a second source of truth (B12).

### Option 4: All inclusive plans with fair use limits

No metering for customers; prices include expected cost; hard limits stop abuse.

**Pros**: simplest for customers and code.
**Cons**: heavy users erase margin; dedicated instance sizes and AI use vary too widely for one price.

### Option 5: Metronome for credits and rating

Metronome, Stripe's usage billing platform and the one the `stripe-best-practices` skill recommends for prepaid credits and burndown, holds contracts, rate cards, credit balances, and usage, and syncs invoices to Stripe. AFT would send usage events and keep a cached balance. This option surfaced from the installed skill after the interview.

**Pros**: rating, credit grants, burndown, and enterprise contracts come built; real time usage views without AFT building them.
**Cons**: price unknown and likely sized for larger companies, against a $300 a month launch budget; EU data residency not verified; the instant refusal at zero (B8) still needs a local balance and reservation, so most of the ledger remains; instance, storage, and bandwidth metering and the margin check stay AFT's either way; one more vendor and sub processor.

## Rationale

Option 1 is the only one that meets both the cash constraint (one engineer, a small budget, no room to front cost) and the latency constraint (the gateways and job starts need an instant, exact answer). Options 2 and 3 settle after the fact, so a leaked key or a failed card becomes AFT's loss. Option 4 does not fit products whose cost varies tenfold between customers.

The extra code is real, but PLAN.md already committed AFT to an append only credit ledger with atomic reservations (B8 to B10), so the ledger is not new scope; this spec adds the top up engine, the metering sources, and the pricing discipline around it. Stripe stays the money mover and source of truth for subscriptions (feature 36), which keeps PCI scope minimal.

Option 5 (Metronome) loses on the same constraints: its cost is unknown at a budget where every vendor counts, and the hard part AFT must own anyway is the instant, race free spend decision, which needs a local balance. Revisit it if enterprise contracts with commits and custom rate cards become common.

Picks made while writing (engineer delegated these):
- **Reserve then settle only for AI jobs**, batches for everything else: AI jobs are expensive and bounded, so exact holds pay off; per call holds would put a database write on every API call. Runner up: reserve per call.
- **Micro credits with carry** for priced usage: sub cent unit prices (an API call at 0.1 credit) need fractions, and carrying the remainder never rounds against the customer. Single AI jobs round up by under one credit, accepted for simplicity. Runner up: integer credits with a minimum price of 1 per unit.
- **Credits land only from the webhook**: a lost Stripe response can never double credit. Runner up: credit on the synchronous response with webhook reconciliation.
- **Prices as code, published by the pipeline**: review, history, and rollback come free. Runner up: an admin screen with its own audit log.
- **Calls counted per minute, flushed every 10 seconds**: keeps call latency flat and row counts bounded under attack, at the cost of up to 10 seconds of lost counts on a crash. Runner up: one row per call.
- **Database functions own credit writes**: turns "callers never mint credits" into a grant the database enforces. Runner up: application code only, guarded by review.
- **13 month raw event retention, then S3 archive**: covers a full year of dashboards and disputes while bounding table size. Runner up: keep forever.
- **Minimum top up $10**: Stripe's fixed fee per charge (about 30 cents) stays near 3 percent. Runner up: $5.
- **Grace 7 days** until feature 55 owns it: long enough to fix an expired card over a weekend.

## Refinements after the data model confirm

Changes to the model the engineer confirmed, made while writing and then from the cross check (all fixes approved by the engineer on 2026-10-22). Listed in the index Follow-up for review:
1. `UsageEvent.credits` (int) became `micro_credits` (bigint): an integer credit per event cannot price sub cent units (AC-18). Events gained status `reserved` (AI events are never batch charged), `reservation_id`, and `usage_batch_id`.
2. New table `UsageBatch`: the ledger points at batches instead of events, so events can be archived after 13 months and each charge still lists what it covered.
3. API and MCP calls became per minute counts instead of one row per call.
4. `CreditAccount` gained `carry_micro`, `period_end`, cap warning flags, `topup_failures`, `topup_retry_at`, `subscription_unpaid`, `dispute_open`, and `first_blocked_at`; its state is now computed with `blocked_payment` taking precedence.
5. Ledger kinds gained `release` so `refund` means only cash returned to a card; entries gained `created_by`.
6. `CreditReservation` gained `lines` (an LLM job has input and output units), the bucket split, `period_start`, and `charged_credits`; `job_ref` includes the attempt.
7. `TopUp` gained `refunded_credits` and `requires_action_until`.
8. `MarginReport` gained a summary row and `unattributed_cost_minor`.

Also an interpretation: the engineer chose "stop new work" when a top up fails. The spec stops new work when the balance then reaches zero with no top up able to land, not at the moment of failure, because the customer has already paid for the remaining credits (AC-11). Change AC-11 if you want refusal at once.

## Cross check record

A read only review on a different model (Sonnet) on 2026-10-22 found 22 issues: double charging of AI jobs by the batch, request code able to mint credits, expired allowance resurrected by releases, wrong Stripe off session error handling and card source, a refund race, unbounded card retries and a stuck 3D Secure lock, every invoice re granting the allowance, contradictory cap rules, single unit reservations for two unit LLM jobs, an archive and foreign key clash, an ambiguous batch key, a negative balance contradiction, lost late settles, incomplete disputes, one row per call under attack, zero amounts and zero caps, margin blind spots, late CloudFront logs and storage gaming, unaligned price dates and an incomplete CI check, grace flapping, the outbox poll interval, and margin report grants. The engineer chose to apply every recommended fix; all are in the children and the index.

## Edge cases

New IDs for the PLAN.md catalog (section B), continuing from B13. Each is carried into an AC and a named test.

- **B14** A Stripe top up event arrives twice or out of order → keyed by PaymentIntent id; credits land once (AC-7).
- **B15** Two debits cross the top up threshold at once → partial unique index allows one open top up per workspace (AC-7).
- **B16** The hourly charge or meter workflow runs twice or crashes midway → events keyed per instance hour and day; charging flips `recorded → charged` in the ledger transaction (AC-15).
- **B17** A card fails while a dedicated instance runs → new work stops at zero balance, instances run through 7 days of grace into a negative balance, then suspend with data kept (AC-11, AC-12).
- **B18** Valkey is unreachable → gateways read Postgres with a 30 second process cache; caps still hold (AC-19).
- **B19** A top up is disputed → credits removed, account blocked (AC-14).
- **B20** Usage of a unit with no price → `not_billed`, alert, never charged retroactively; CI blocks unpriced unit codes (AC-20).
- **B21** The cap is reached during a running AI job → the held reservation completes; new work is refused (AC-10).
- **B22** A workspace cancels with paid credits left → credits kept; admin refund on request (AC-13).
- **B23** A workspace is deleted with paid credits left → automatic refund to the card (AC-13).
- **B24** A top up needs 3D Secure off session → `requires_action`, owner email link, counts as failed until done (AC-9).
- **B25** A price rises → 30 days' notice; past charges keep their price (AC-21, AC-22).
- **B26** An `invoice.paid` for an old period arrives late → grants nothing (AC-5).
- **B27** A reservation outlives its job (worker died) → swept after `expires_at` and released; a settle that arrives later still charges through the batch path and alerts (AC-4).
- **B28** A card keeps declining → retries after 1 and 6 hours, then none until the owner changes the card; a 3D Secure top up left unconfirmed fails after 24 hours so it cannot block later top ups (AC-9, AC-11).
- **B29** A reservation is held across the monthly allowance rollover → its allowance part is not returned on release (AC-5).
- **B30** A proration, upgrade, or one off invoice is paid → it does not touch the allowance (AC-5).
- **B31** A disputed top up is won → credits restored and the block lifted (AC-14).
- **B32** CloudFront logs arrive late, or a hostname changes owner during the day → bandwidth measured two days back against the registry's history; unmapped bytes alert (AC-17).
