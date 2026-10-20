# Epic: Go to market and launch

Back to the [scope index](index.md).

What it takes to open the doors: SEO, analytics, accessibility, languages, legal, admin tools, and production readiness. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 10: Go to market and launch

### 119. Technical SEO · needs a decision
Search engines and social networks understand every public page.
**Done when:** a sitemap and robots file are generated, project pages carry structured data, every public page has social cards and canonical URLs, and Core Web Vitals meet the agreed targets.
- [ ] Design it (spec): `/architect technical seo`

### 120. Product analytics and funnels · needs a decision
Know how visitors become paying customers.
**Done when:** signup, subscription, generation, and studio events are tracked with consent, and funnels from visit to paid are visible.
- [ ] Design it (spec): `/architect product analytics and funnels`

### 121. Accessibility audit · needs a decision
Prove the whole product meets WCAG 2.2 AA.
**Done when:** every page passes automated checks plus a manual keyboard and screen reader pass, and every issue found is fixed or tracked.
- [ ] Design it (spec): `/architect accessibility audit`

### 122. Translations and currencies · needs a decision
Launch languages and local currency display.
**Done when:** the launch languages are fully translated, and prices show in the customer's currency, matching what Stripe charges.
- [ ] Design it (spec): `/architect translations and currencies`

### 123. Cookie consent · needs a decision
Ask before tracking, and honor the answer.
**Done when:** non essential cookies and analytics load only after consent, the choice can be changed any time, and it is respected everywhere.
- [ ] Design it (spec): `/architect cookie consent`

### 124. Legal pages · needs a decision
Terms, privacy policy, and acceptable use, accepted where it matters.
**Done when:** terms, privacy, and acceptable use pages exist; signup and checkout record acceptance of the current version; billing and generation flags stay off in production until this ships.
- [ ] Design it (spec): `/architect legal pages`

### 125. Privacy requests · needs a decision · GA
Customers can export or delete their data.
**Done when:** users export their data; deletion is blocked while subscriptions or instances are active, otherwise an ordered teardown runs that keeps invoices for the legal period and anonymizes the rest (X16).
- [ ] Design it (spec): `/architect privacy requests`

### 126. Admin: users and workspaces · needs a decision · GA
Support tools for accounts.
**Done when:** admins search users and workspaces, view their subscriptions and instances, and suspend or restore access, with every action in the audit log.
- [ ] Design it (spec): `/architect admin users and workspaces`

### 127. Admin: catalog moderation and instances · needs a decision · GA
Operate the marketplace and the fleet.
**Done when:** admins approve project versions for publishing and see every instance's health, version, and state, with safe actions to restart or roll back.
- [ ] Design it (spec): `/architect admin catalog moderation and instances`

### 128. Admin: refunds and credits · needs a decision · GA
Fix billing problems for customers.
**Done when:** admins issue refunds, immediate cancellations, and credit adjustments, each written to the ledger and audit log.
- [ ] Design it (spec): `/architect admin refunds and credits`

### 129. Security review · needs a decision · GA
A full security pass before launch.
**Done when:** an OWASP based review covers every app and the infrastructure; every high finding is fixed; the tenant isolation and sandbox escape tests pass.
- [ ] Design it (spec): `/architect security review`

### 130. Load test and SLOs · needs a decision
Know the platform holds the expected launch load.
**Done when:** load tests hit the expected peak on staging, service goals hold, and autoscaling responds as planned.
- [ ] Design it (spec): `/architect load test and slos`

### 131. Disaster recovery drill · needs a decision · GA
Prove AFT can come back from losing its database or a zone.
**Done when:** a full restore runs from backup into a fresh environment within the agreed recovery time, and a monthly restore drill alerts on failure (I8).
- [ ] Design it (spec): `/architect disaster recovery drill`

### 132. Release 1.0 · needs a decision
Turn on the flags and launch.
**Done when:** runbooks exist for every service, release notes and changelog are written, and the launch flags are on in production.
- [ ] Design it (spec): `/architect release 1.0`
