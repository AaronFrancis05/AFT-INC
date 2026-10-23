# Epic: Catalog and commerce

Back to the [scope index](index.md).

The showcase of your production ready projects, the plans customers buy, Stripe billing, credits, and the customer dashboard. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Already built

### B. Marketing homepage · in-progress
Banner, featured projects, and services sections, with project cards from a hardcoded `PROJECTS` array. Finish it on live catalog data once feature 31 exists. code in `app/page.tsx`, `components/nav/`
- [ ] Finish it on catalog data: `/develop marketing homepage`

### C. Dashboard shell · in-progress
Session guarded layout and sidebar work; the page shows mock CRM data and placeholder navigation, which features 40, 60, and 61 replace. code in `app/dashboard/`, `components/dashboard/`

## Slice 1: Browse, subscribe, use (core loop)

### 31. Catalog data model · needs a decision
Projects, versions, categories, media, and delivery modes as real data.
**Done when:** a project can be stored with its versions, category, media, and supported delivery modes (shared SaaS, dedicated instance, API plus MCP); unpublishing keeps history (X11).
- [ ] Design it (spec): `/architect catalog data model`

### 32. Plans and pricing model · needs a decision · GA
What a customer can buy for each project and delivery mode, and what each plan unlocks.
**Done when:** each plan names its price, interval, delivery mode, and entitlements; money is stored as integer minor units with a currency (X10); a price change creates a new price and existing subscribers keep theirs (C3).
- [ ] Design it (spec): `/architect plans and pricing model`

### 33. Project listing page · needs a decision
The public `/projects` page lists published projects.
**Done when:** visitors see published projects with name, summary, category, and image; the page has SEO metadata and meets WCAG 2.2 AA; unpublished projects never show.
- [ ] Design it (spec): `/architect project listing page`

### 34. Project detail page · needs a decision
One page per project: what it does, screenshots, delivery modes, plans, and a subscribe button.
**Done when:** each published project has a detail page with plans and a subscribe action; deprecated projects show a notice and no subscribe button (C1); missing media shows a placeholder (C5); SEO metadata and WCAG 2.2 AA are met.
- [ ] Design it (spec): `/architect project detail page`

### 35. Subscription checkout · needs a decision · GA
A signed in user subscribes their workspace to a plan and pays by card.
**Done when:** checkout completes for a card that passes or needs 3DS; declined or abandoned payments grant nothing (B1, B2); two tabs cannot create two subscriptions (B3, X1); the success page waits for confirmed payment instead of trusting the redirect (B4); production refuses test keys (B13).
- [ ] Design it (spec): `/architect subscription checkout`

### 36. Subscription sync from webhooks · needs a decision · GA
Stripe is the source of truth, and AFT mirrors subscription state reliably.
**Done when:** created, updated, renewed, and cancelled subscriptions show correctly in AFT; duplicate and out of order events end in the right state (X2, X3).
- [ ] Design it (spec): `/architect subscription sync from webhooks`

### 37. Entitlements service · needs a decision · GA
One place answers "may this workspace use this capability right now".
**Done when:** every gated action asks the entitlements service, never a plan name; access starts on payment and stops on cancellation or suspension, with tests per plan.
- [ ] Design it (spec): `/architect entitlements service`

### 40. My subscriptions dashboard · needs a decision
The dashboard home shows what the workspace owns, replacing the mock CRM data.
**Done when:** the dashboard lists the workspace's subscriptions with project, plan, status, and how to access each one; the mock data and placeholder navigation are gone.
- [ ] Design it (spec): `/architect my subscriptions dashboard`

## Slice 3: Catalog breadth

### 49. Catalog admin · needs a decision
You create, edit, publish, and unpublish projects without touching code.
**Done when:** an admin can manage projects, media, and categories; renaming a slug keeps the old URL redirecting (C4); only approved image hosts are accepted (C5).
- [ ] Design it (spec): `/architect catalog admin`

### 50. Project versions and changelogs · needs a decision
Each project has versions with release notes.
**Done when:** an admin can publish a version with a changelog; customers see what changed; breaking versions are marked and never forced on anyone (C2).
- [ ] Design it (spec): `/architect project versions and changelogs`

### 51. Catalog search and filters · needs a decision
Find projects by domain, category, delivery mode, and text.
**Done when:** search and filters narrow the list and the URL reflects them; empty, very long, and special character queries are handled with a helpful empty state (C6).
- [ ] Design it (spec): `/architect catalog search and filters`

### 52. Services page · needs a decision
The public `/services` page explains what AFT offers: subscriptions, Media Studio, App Studio, and custom work.
**Done when:** `/services` replaces the placeholder with real content, links into each offering, and meets SEO metadata and WCAG 2.2 AA.
- [ ] Design it (spec): `/architect services page`

### 53. Pricing page · needs a decision
The public `/pricing` page shows plans and credit packs from live data.
**Done when:** `/pricing` reads plans from the catalog, compares them clearly, links to checkout, and meets SEO metadata and WCAG 2.2 AA.
- [ ] Design it (spec): `/architect pricing page`

## Slice 4: Billing breadth

### 54. Plan changes and cancellation · needs a decision · GA
Customers upgrade, downgrade, and cancel on their own.
**Done when:** upgrades prorate; a downgrade below current usage is blocked or asks what to deactivate (B6); cancellation ends at period end by default, while immediate cancel and refunds are admin only; disputes suspend access (B7).
- [ ] Design it (spec): `/architect plan changes and cancellation`

### 55. Dunning and suspension · needs a decision · GA
Failed renewals get a fair grace period before access stops.
**Done when:** a failed renewal triggers retries and emails, then a grace period, then suspension that keeps data, then deletion only after retention, with notice before each step (B5).
- [ ] Design it (spec): `/architect dunning and suspension`

### 56. Tax and enterprise invoicing · needs a decision · GA
Correct tax everywhere, and invoices for enterprise customers.
**Done when:** tax is calculated by location, customers can add tax IDs, and enterprise plans can pay by invoice on agreed terms (B11).
- [ ] Design it (spec): `/architect tax and enterprise invoicing`

### 57. Billing reconciliation · needs a decision · GA
A nightly check that Stripe and AFT agree.
**Done when:** a scheduled job compares subscriptions and customers, fixes safe differences, and alerts on the rest (B12).
- [ ] Design it (spec): `/architect billing reconciliation`

### 58. Credit ledger · in-progress · GA
Credits pay for AI generations and metered use, with an exact history.
**Done when:** the balance is derived from an append only ledger; concurrent jobs can never drive it negative (B8); purchases, monthly grants, expiry, and refunds all appear as entries (B10).
Spec: [0006](../specs/0006-usage-billing/index.md), child 0001 (credit ledger and automatic top ups).
- [x] Design it (spec): `/architect credit ledger`
- [ ] Build it: `/develop credit ledger`
   - [ ] Thread: tables, grants, billing functions, one image job, a sandbox top up (AC-1 to AC-4, AC-7, AC-21, AC-26)
   - [ ] Allowance grant, rollover, annual timer, defaults (AC-5, AC-6, AC-8)
   - [ ] Top up hardening: card resolution, 3D Secure, retries, owner settings (AC-7 to AC-9, AC-11, AC-25)
   - [ ] Cap, blocked states, grace, suspension and resume, debt (AC-10 to AC-12)
   - [ ] Refunds, disputes, adjustments, audit pass (AC-13, AC-14, AC-25, AC-26)
- [ ] Verify it: `/check verify credit ledger`
- [ ] Test it: `/test credit ledger`
- [ ] Review it (fresh model): `/check review credit ledger`
- [ ] Document it: `/document credit ledger`

### 59. Usage metering · in-progress · GA
Metered use flows to Stripe for billing.
**Done when:** API calls and generations produce usage events that reach Stripe once; failed or blocked jobs are not billed and their credits come back (B9); rejected calls are still recorded (M8).
Spec: [0006](../specs/0006-usage-billing/index.md), child 0002 (usage metering).
- [x] Design it (spec): `/architect usage metering`
- [ ] Build it: `/develop usage metering`
   - [ ] Hot path flag through the outbox, `canSpend` with Postgres fallback (AC-19)
   - [ ] API and MCP call counts, `UsageBatch`, hourly charge with carry (AC-16, AC-18)
   - [ ] Instance minutes from state history (AC-15)
   - [ ] Storage and bandwidth daily metering (AC-17)
- [ ] Verify it: `/check verify usage metering`
- [ ] Test it: `/test usage metering`
- [ ] Review it (fresh model): `/check review usage metering`
- [ ] Document it: `/document usage metering`

### 141. Rate card and margin check · in-progress · GA · from spec 0006
A versioned price list in credits, and a monthly check that prices cover real AWS and AI cost.
**Done when:** usage is priced at the rate in force when it happened; a price rise needs 30 days' notice to owners; every tenant resource carries `aft:org`; a monthly report alerts on thin margins and cost with no charge.
Spec: [0006](../specs/0006-usage-billing/index.md), child 0003 (rate card and margin check).
- [x] Design it (spec): `/architect rate card and margin check`
- [ ] Build it: `/develop rate card and margin check`
   - [ ] Rate card seed, publish script with the notice rule, CI check over every model and size (AC-20 to AC-22)
   - [ ] `aft:org` tag aspect and assertion, Cost Explorer role, monthly report and alerts, nightly audit (AC-1, AC-23, AC-24)
- [ ] Verify it: `/check verify rate card and margin check`
- [ ] Test it: `/test rate card and margin check`
- [ ] Review it (fresh model): `/check review rate card and margin check`
- [ ] Document it: `/document rate card and margin check`

### 60. Usage and credits dashboard · needs a decision
Customers see what they used and what is left.
**Done when:** the dashboard shows credit balance, usage by project and capability over time, and a way to buy more credits.
- [ ] Design it (spec): `/architect usage and credits dashboard`

### 61. Billing history dashboard · needs a decision
Invoices and payment methods in one place.
**Done when:** the dashboard lists invoices with download links and opens payment method management.
- [ ] Design it (spec): `/architect billing history dashboard`
