# 0005.0007. Untrusted code boundary

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Two kinds of code AFT runs are not AFT's own: apps that App Studio generates from a user's prompt, and the software inside customers' dedicated instances. This decision fixes the walls around them now: they never run inside AFT's platform services or with AFT's AWS credentials, and they are served only from a separate domain, so a malicious page can never read `remwa.tech` cookies. Which sandbox product runs generated code is chosen in slice 9 (E2B is the leading candidate).

## Decision

A separate registrable untrusted domain (bought by the engineer before slice 5) whose zone, CloudFront distribution, WAF, and ALB live in the `aft-tenants` account; generated code runs only in a hosted EU sandbox behind `SandboxPort`; dedicated instances run in the `aft-tenants` account with their own roles; the sandbox engine is chosen in slice 9.

## The boundary

- **Domain**: all untrusted content is served from `<slug>.<untrusted-domain>`, a registrable domain different from `remwa.tech` (so browsers treat it as a different site: no shared cookies, no shared storage). Nothing untrusted is ever served from `remwa.tech` or its subdomains (AC-12).
- **Generated code** (App Studio): builds, installs, tests, and previews run only in the sandbox provider, never on AFT's Fargate tasks (S10). The sandbox gets no AFT credentials; it receives only the files to run and a short lived token scoped to that one sandbox's upload and log endpoints.
- **Sandbox egress**: dependency installs only from an allow listed registry mirror; no other outbound network unless the user explicitly enables it for a preview; a secret scanner runs before any export (S10).
- **Dedicated instances**: run in the separate `aft-tenants` account with their own task role (permission boundary), security group, and secrets (child 0002); no network path to the staging or production VPCs; never platform roles or credentials.
- **Previews of generated apps**: hosted by the sandbox provider or proxied through `preview.<untrusted-domain>`, with a time to live (S12).

## Choosing the engine (slice 9)

Criteria the slice 9 spec must apply: microVM or equivalent isolation; processing in an EU region (required by AC-2's EU promise; a provider without one is not eligible); per second pricing within the AI spend controls (feature 84); snapshot and resume; egress control; a TypeScript SDK. Candidates from the 2026-10-22 check: E2B (leading, about $0.05 per vCPU hour), Vercel Sandbox, Modal, Daytona, Cloudflare Sandbox SDK (all prices from third party comparisons, unconfirmed).

## Consequences

- A second domain to buy and renew, and a third workload account with its own CloudFront, WAF, and ALB (no cost until the first dedicated customer).
- Deferring the engine keeps options open, but App Studio's design must not assume one product's features until slice 9.

## Rationale (short)

The isolation rules are the load bearing part and cost nothing to fix now; the product choice depends on App Studio needs that are months away and a market that moves fast. A separate registrable domain is the standard way to stop untrusted pages from touching the main site's session.
