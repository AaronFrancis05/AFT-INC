# Epic: Project delivery (customer CI/CD)

Back to the [scope index](index.md).

How a subscription turns into something the customer can use: a tenant in a shared SaaS project, or a dedicated instance AFT deploys, runs, upgrades, and tears down for them. This is the customer side of CI/CD, broken into small steps. Edge case IDs refer to the catalog in [PLAN.md](../../PLAN.md).

## Slice 1: Browse, subscribe, use (core loop)

### 38. Project integration contract · needs a decision · GA
The rules every showcase project must follow to be sold on AFT: health check, tenant provisioning, sign in through AFT, usage reporting, MCP manifest, and a deploy package.
**Done when:** the contract is a versioned, typed spec with a reference implementation in one real showcase project.
- [ ] Design it (spec): `/architect project integration contract`

### 39. Shared SaaS tenant provisioning · needs a decision · GA
A new subscription creates the customer's tenant inside a shared project and gives them access.
**Done when:** paying creates exactly one tenant per subscription (D3); cancelling during provisioning stops it cleanly (D2); the customer signs in to the project through AFT and lands in their tenant.
- [ ] Design it (spec): `/architect shared saas tenant provisioning`

## Slice 5: Dedicated instances

### 62. Instance deploy package standard · needs a decision · GA
One standard package (chart and values) every showcase project ships so AFT can deploy it.
**Done when:** the standard is written, one real project ships a conforming package, and it deploys to an empty namespace on staging.
- [ ] Design it (spec): `/architect instance deploy package standard`

### 63. Contract conformance suite · needs a decision · GA
Automated checks that a project version honors the integration contract before it can be published.
**Done when:** a project version can only be published after the conformance suite passes against a test deploy (D10).
- [ ] Design it (spec): `/architect contract conformance suite`

### 64. Instance model and state machine · needs a decision · GA
Each dedicated instance has a record and a clear lifecycle.
**Done when:** every step of provisioning is a tracked state; a failure midway rolls back what was created and can resume (D1); a repeated request never creates a second instance (D3).
- [ ] Design it (spec): `/architect instance model and state machine`

### 65. Tenant namespace isolation · needs a decision · GA
Each dedicated instance runs fenced off from every other.
**Done when:** each instance gets its own namespace with resource quotas, default limits, and deny by default network rules, and one tenant cannot starve or reach another (D8).
- [ ] Design it (spec): `/architect tenant namespace isolation`

### 66. Instance deploy through GitOps · needs a decision · GA
Provisioning writes the instance's desired state to git, and the cluster deploys it.
**Done when:** a paid dedicated subscription results in a running instance; entitlement is rechecked at each step (D2); when the cluster is full, the request waits in a queue and ops are alerted (D4).
- [ ] Design it (spec): `/architect instance deploy through gitops`

### 67. Subdomains, DNS, and TLS · needs a decision · GA
Each instance gets a safe address with HTTPS.
**Done when:** the customer picks a subdomain that is unique and not reserved or offensive (D9); DNS and TLS are automatic; slow propagation is waited out with a timeout and alert (D5).
- [ ] Design it (spec): `/architect subdomains dns and tls`

### 68. Provisioning status UI · needs a decision
Customers watch their instance come to life.
**Done when:** the dashboard shows each provisioning step live, including a "delayed" state (D4), and links to the instance when it is healthy.
- [ ] Design it (spec): `/architect provisioning status ui`

### 69. Per tenant secrets · needs a decision · GA
Each instance has its own secrets, stored safely and rotatable.
**Done when:** every instance gets unique secrets that live only in the managed store, and one tenant's secrets can be rotated without touching others (D12).
- [ ] Design it (spec): `/architect per tenant secrets`

### 70. Instance teardown · needs a decision · GA
Cancelled or deleted instances are removed completely and safely.
**Done when:** teardown takes a final backup kept for the retention period, then removes every resource, and logs what was removed (D11).
- [ ] Design it (spec): `/architect instance teardown`

### 71. Instance upgrades and rollback · needs a decision · GA
Customers move to new project versions safely.
**Done when:** upgrades are opt in with the changelog shown (C2); a backup is taken first; a failed health check or tenant migration rolls back automatically (D7).
- [ ] Design it (spec): `/architect instance upgrades and rollback`

### 72. Suspend and resume instances · needs a decision · GA
Billing state controls whether an instance runs.
**Done when:** suspension scales the instance to zero and keeps its data, paying again resumes it, and retention expiry hands off to teardown (B5).
- [ ] Design it (spec): `/architect suspend and resume instances`

### 73. Instance backups and restore · needs a decision · GA
Scheduled backups customers can restore from.
**Done when:** each instance is backed up on a schedule, a restore can be requested from the dashboard, and restores are tested automatically (I8).
- [ ] Design it (spec): `/architect instance backups and restore`

### 74. Custom domains · needs a decision
Customers point their own domain at their instance.
**Done when:** a domain is verified by DNS record before use, checked again on a schedule, and falls back to the AFT subdomain with a notice if it breaks (D6).
- [ ] Design it (spec): `/architect custom domains`
