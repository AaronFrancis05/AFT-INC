# Scope: AFT Inc

AFT Inc is an AI platform where developers, enterprises, and everyday customers buy production ready projects (customized through a form and delivered into their own GitHub repo to run on their own hosting, with optional update pull requests, spec 0007), generate commercial images, videos, and 3D models, and turn an idea into a deployed app in a collaborative studio. The full plan, architecture, and edge case catalog live in [PLAN.md](../../PLAN.md); progress notes live in [MEMORY.md](../../MEMORY.md).

**Build approach:** Tracer Bullet (prove one thin real path through every layer first, then thicken it one strand at a time).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). Features tagged `· GA` (auth, workspaces, billing, metering, provisioning, infrastructure, CI/CD, MCP, security) add a fresh model `/check review` and `/document`. `/architect` is the first stop for any feature that `needs a decision`.
**Ship rule:** every feature ships on its own, on one branch with one pull request: spec, build, verify, test (review and document at GA), merge, then an approved deploy to production behind a feature flag that stays off until its epic is ready for users. There is no staging (spec 0007). Until feature 18 exists, ship means merged to `main` with CI green. When `/architect` captures a spec, it adds a `Ship it` box as the last step of that feature.
**Constraints:** one engineer working with AI agents, no fixed deadline. Features are sized for one to three days each and built one at a time, in order.
**Edge cases:** every `Done when` names the edge case IDs it owns from the PLAN.md catalog (X, A, C, B, D, M, G, S, I). `/architect` turns them into acceptance criteria, `/check verify` proves them, and `/test` names a test after each one.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## Epics

| Epic | File | Features | Status |
|---|---|---|---|
| Foundation and platform engineering (incl. CI/CD for AFT) | [foundation.md](foundation.md) | 1 to 28, 148 | 3 done, 11 in progress, 12 planned, 3 dropped |
| Identity and workspaces | [identity.md](identity.md) | A, 29, 30, 41 to 48, 133 to 140 | 1 existing, 8 in progress, 10 planned |
| Catalog and commerce | [commerce.md](commerce.md) | B, C, 31 to 37, 40, 49 to 61, 141 | 6 in progress, 18 planned |
| Project delivery (to the customer's repo) | [delivery.md](delivery.md) | 38, 39, 62 to 74, 142 to 147 | 8 in progress, 13 dropped |
| API and MCP integrations (parked) | [mcp.md](mcp.md) | 75 to 82 | 8 planned, parked |
| AI Media Studio | [media.md](media.md) | 83 to 98 | 16 planned |
| App Studio (Figma like, idea to app) | [studio.md](studio.md) | 99 to 118 | 20 planned |
| Go to market and launch | [launch.md](launch.md) | 119 to 132 | 14 planned |

**Phases, in build order:** Foundation (1 to 28, then 148 go live) · Slice 1, the core loop: browse, buy, receive (29 to 40, 142, 143) · Slice 2 identity breadth · Slice 3 catalog breadth · Slice 4 billing breadth · Slice 5 delivery breadth (62, 144 to 147) · Parked: API and MCP · Slice 7 images and video · Slice 8 3D · Slice 9 App Studio (9a format, 9b canvas, 9c collaboration, 9d AI design, 9e code and deploy) · Slice 10 go to market and launch.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | [Email and password auth](identity.md) | Existing | existing |
| B | [Marketing homepage](commerce.md) | Existing | in-progress |
| C | [Dashboard shell](commerce.md) | Existing | in-progress |
| 1 | [CI repair and test harness](foundation.md) | Foundation | done |
| 2 | [Auth defect fixes](foundation.md) | Foundation | done |
| 3 | [Platform architecture](foundation.md) | Foundation | done |
| 4 | [Monorepo migration](foundation.md) | Foundation | in-progress |
| 5 | [Workspace tooling](foundation.md) | Foundation | planned |
| 6 | [Typed environment config](foundation.md) | Foundation | planned |
| 7 | [Engineering standards and shared helpers](foundation.md) | Foundation | planned |
| 8 | [Local dev stack](foundation.md) | Foundation | planned |
| 9 | [Container images](foundation.md) | Foundation | in-progress |
| 10 | [AWS foundation](foundation.md) | Foundation | in-progress |
| 11 | [Server and Compose](foundation.md) | Foundation | in-progress |
| 12 | [Data services](foundation.md) | Foundation | in-progress |
| 13 | [Edge, DNS, and certificates](foundation.md) | Foundation | in-progress |
| 14 | [Secrets delivery](foundation.md) | Foundation | in-progress |
| 15 | [GitOps and environments](foundation.md) | Foundation | dropped |
| 16 | [Image pipeline and release bundles](foundation.md) | Foundation | in-progress |
| 17 | [Database migration gate](foundation.md) | Foundation | in-progress |
| 18 | [Approved deploy to production](foundation.md) | Foundation | in-progress |
| 19 | [Production promotion and canary](foundation.md) | Foundation | dropped |
| 20 | [Pull request previews](foundation.md) | Foundation | dropped |
| 21 | [Feature flags](foundation.md) | Foundation | planned |
| 22 | [Tracing and structured logs](foundation.md) | Foundation | planned |
| 23 | [Error tracking, alerts, and SLOs](foundation.md) | Foundation | planned |
| 24 | [Durable workflow engine and worker](foundation.md) | Foundation | planned |
| 25 | [Outbox and webhook inbox](foundation.md) | Foundation | planned |
| 26 | [Rate limiting and request guards](foundation.md) | Foundation | planned |
| 27 | [Design system and AFT brand](foundation.md) | Foundation | planned |
| 28 | [Internationalization foundation](foundation.md) | Foundation | planned |
| 148 | [First production go live](foundation.md) | Foundation | in-progress |
| 149 | [Adopt the cn class merger](foundation.md) | Foundation | planned |
| 29 | [Organizations and personal workspaces](identity.md) | Slice 1 | planned |
| 30 | [Route protection](identity.md) | Slice 1 | planned |
| 31 | [Catalog data model](commerce.md) | Slice 1 | planned |
| 32 | [Plans and pricing model](commerce.md) | Slice 1 | planned |
| 33 | [Project listing page](commerce.md) | Slice 1 | planned |
| 34 | [Project detail page](commerce.md) | Slice 1 | planned |
| 35 | [Purchase checkout, tax, and refunds](commerce.md) | Slice 1 | in-progress |
| 36 | [Subscription sync from webhooks](commerce.md) | Slice 1 | planned |
| 37 | [Entitlements service](commerce.md) | Slice 1 | planned |
| 38 | [Project manifest and publishing](delivery.md) | Slice 1 | in-progress |
| 39 | [Shared SaaS tenant provisioning](delivery.md) | Slice 1 | dropped |
| 142 | [Render and push thread](delivery.md) | Slice 1 | in-progress |
| 143 | [Purchase form and answers](delivery.md) | Slice 1 | in-progress |
| 40 | [My purchases dashboard](commerce.md) | Slice 1 | planned |
| 41 | [Members and roles](identity.md) | Slice 2 | planned |
| 42 | [Invitations](identity.md) | Slice 2 | planned |
| 43 | [Workspace switcher and settings](identity.md) | Slice 2 | planned |
| 44 | [Session security](identity.md) | Slice 2 | planned |
| 45 | [Social sign in linking](identity.md) | Slice 2 | planned |
| 46 | [Two factor authentication](identity.md) | Slice 2 | planned |
| 47 | [API keys](identity.md) | Slice 2 | planned |
| 48 | [Audit log](identity.md) | Slice 2 | planned |
| 49 | [Catalog admin](commerce.md) | Slice 3 | planned |
| 50 | [Project versions and changelogs](commerce.md) | Slice 3 | planned |
| 51 | [Catalog search and filters](commerce.md) | Slice 3 | planned |
| 52 | [Services page](commerce.md) | Slice 3 | planned |
| 53 | [Pricing page](commerce.md) | Slice 3 | planned |
| 54 | [Plan changes and cancellation](commerce.md) | Slice 4 | planned |
| 55 | [Dunning and suspension](commerce.md) | Slice 4 | planned |
| 56 | [Tax and enterprise invoicing](commerce.md) | Slice 4 | planned |
| 57 | [Billing reconciliation](commerce.md) | Slice 4 | planned |
| 58 | [Credit ledger](commerce.md) | Slice 4 | in-progress |
| 59 | [Usage metering](commerce.md) | Slice 4 | in-progress |
| 141 | [Rate card and margin check](commerce.md) | Slice 4 | in-progress |
| 60 | [Usage and credits dashboard](commerce.md) | Slice 4 | planned |
| 61 | [Billing history dashboard](commerce.md) | Slice 4 | planned |
| 62 | [Deploy recipes, first hosting platform](delivery.md) | Slice 5 | in-progress |
| 63 | [Contract conformance suite](delivery.md) | Slice 5 | dropped |
| 64 | [Instance model and state machine](delivery.md) | Slice 5 | dropped |
| 65 | [Tenant namespace isolation](delivery.md) | Slice 5 | dropped |
| 66 | [Instance deploy through GitOps](delivery.md) | Slice 5 | dropped |
| 67 | [Subdomains, DNS, and TLS](delivery.md) | Slice 5 | dropped |
| 68 | [Provisioning status UI](delivery.md) | Slice 5 | dropped |
| 69 | [Per tenant secrets](delivery.md) | Slice 5 | dropped |
| 70 | [Instance teardown](delivery.md) | Slice 5 | dropped |
| 71 | [Instance upgrades and rollback](delivery.md) | Slice 5 | dropped |
| 72 | [Suspend and resume instances](delivery.md) | Slice 5 | dropped |
| 73 | [Instance backups and restore](delivery.md) | Slice 5 | dropped |
| 74 | [Custom domains](delivery.md) | Slice 5 | dropped |
| 144 | [Zip delivery and retries](delivery.md) | Slice 5 | in-progress |
| 145 | [Update pull requests](delivery.md) | Slice 5 | in-progress |
| 146 | [Critical fixes and lost repos](delivery.md) | Slice 5 | in-progress |
| 147 | [Delivery roles and audit](delivery.md) | Slice 5 | in-progress |
| 75 | [API gateway routing and key auth](mcp.md) | Parked | planned |
| 76 | [Gateway rate limits and metering](mcp.md) | Parked | planned |
| 77 | [MCP server foundation](mcp.md) | Parked | planned |
| 78 | [MCP catalog and account tools](mcp.md) | Parked | planned |
| 79 | [MCP job tools](mcp.md) | Parked | planned |
| 80 | [Project MCP gateway](mcp.md) | Parked | planned |
| 81 | [Connections UI](mcp.md) | Parked | planned |
| 82 | [Developer docs](mcp.md) | Parked | planned |
| 83 | [LLM gateway](media.md) | Slice 7 | planned |
| 84 | [AI spend controls](media.md) | Slice 7 | planned |
| 85 | [AI eval harness](media.md) | Slice 7 | planned |
| 86 | [Generation jobs and media adapters](media.md) | Slice 7 | planned |
| 87 | [Text to image](media.md) | Slice 7 | planned |
| 88 | [Image to image and edits](media.md) | Slice 7 | planned |
| 89 | [Upscaling to HD and 4K](media.md) | Slice 7 | planned |
| 90 | [Asset library](media.md) | Slice 7 | planned |
| 91 | [Content moderation](media.md) | Slice 7 | planned |
| 92 | [Provenance and commercial licensing](media.md) | Slice 7 | planned |
| 93 | [Short video generation](media.md) | Slice 7 | planned |
| 94 | [TikTok ready export](media.md) | Slice 7 | planned |
| 95 | [TikTok publishing](media.md) | Slice 7 | planned |
| 96 | [3D model generation](media.md) | Slice 8 | planned |
| 97 | [3D viewer](media.md) | Slice 8 | planned |
| 98 | [Turntable video](media.md) | Slice 8 | planned |
| 99 | [Design format (Design IR)](studio.md) | Slice 9a | planned |
| 100 | [Studio projects](studio.md) | Slice 9a | planned |
| 101 | [Idea to brief](studio.md) | Slice 9a | planned |
| 102 | [Brief editor](studio.md) | Slice 9a | planned |
| 103 | [Canvas core](studio.md) | Slice 9b | planned |
| 104 | [Layers and properties](studio.md) | Slice 9b | planned |
| 105 | [Component library](studio.md) | Slice 9b | planned |
| 106 | [Per user undo](studio.md) | Slice 9b | planned |
| 107 | [Realtime sync](studio.md) | Slice 9c | planned |
| 108 | [Presence and cursors](studio.md) | Slice 9c | planned |
| 109 | [Comments](studio.md) | Slice 9c | planned |
| 110 | [Offline edits and conflicts](studio.md) | Slice 9c | planned |
| 111 | [Collaboration permissions](studio.md) | Slice 9c | planned |
| 112 | [Brief to wireframes](studio.md) | Slice 9d | planned |
| 113 | [Wireframes to hi fi design](studio.md) | Slice 9d | planned |
| 114 | [Code sandbox](studio.md) | Slice 9e | planned |
| 115 | [Design to code](studio.md) | Slice 9e | planned |
| 116 | [Build and fix loop](studio.md) | Slice 9e | planned |
| 117 | [Preview deploys for generated apps](studio.md) | Slice 9e | planned |
| 118 | [GitHub export](studio.md) | Slice 9e | planned |
| 119 | [Technical SEO](launch.md) | Slice 10 | planned |
| 120 | [Product analytics and funnels](launch.md) | Slice 10 | planned |
| 121 | [Accessibility audit](launch.md) | Slice 10 | planned |
| 122 | [Translations and currencies](launch.md) | Slice 10 | planned |
| 123 | [Cookie consent](launch.md) | Slice 10 | planned |
| 124 | [Legal pages](launch.md) | Slice 10 | planned |
| 125 | [Privacy requests](launch.md) | Slice 10 | planned |
| 126 | [Admin: users and workspaces](launch.md) | Slice 10 | planned |
| 127 | [Admin: catalog moderation and instances](launch.md) | Slice 10 | planned |
| 128 | [Admin: refunds and credits](launch.md) | Slice 10 | planned |
| 129 | [Security review](launch.md) | Slice 10 | planned |
| 130 | [Load test and SLOs](launch.md) | Slice 10 | planned |
| 131 | [Disaster recovery drill](launch.md) | Slice 10 | planned |
| 132 | [Release 1.0](launch.md) | Slice 10 | planned |
| 133 | [SSO thin thread](identity.md) | Slice 2b | in-progress |
| 134 | [SSO lifecycle and operations](identity.md) | Slice 2b | in-progress |
| 135 | [SSO workspace picker and access gate](identity.md) | Slice 2b | in-progress |
| 136 | [SSO client provisioning API](identity.md) | Slice 2b | in-progress |
| 137 | [SSO for MCP clients](identity.md) | Slice 2b | in-progress |
| 138 | [Sign in with AFT for customer apps](identity.md) | Slice 2b | in-progress |
| 139 | [Main site signs in through AFT](identity.md) | Slice 2b | in-progress |
| 140 | [Enterprise SSO for workspaces](identity.md) | Slice 2b | in-progress |

## Deferred

Out of scope for the current build pass, kept so the plan stays honest.
- **Custom AFT image model**: a fine tuned image model on GPU nodes behind the same media adapter as feature 86 · needs a decision · GA
- **Coverage ratchet**: fail CI when coverage drops, once a few features ship with tests · from spec 0001

## Legend

**The decision box.** Every designed feature carries exactly one box whose label ends with `(spec)`. Skills find it by that suffix. Every other box is an execution box.

**Feature lifecycle:**

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it: /develop <feature>` with 2 to 5 milestones; `Verify it`; `Test it`; at GA also `Review it` and `Document it`; then `Ship it` (merge, staging, production behind a flag) |
| `in-progress` (building) | `/develop` | milestone boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` and milestones ticked; `Verify it` ticked |
| `done` | you, when you decide (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked; for Beta and GA the suggested point is after `/test` and `Ship it` |

- **Next step** = the first unticked box, always a command or a tracked milestone.
- **needs a decision** = run `/architect` first; otherwise go straight to `/develop`.
- **Atomic build tasks live in the spec's `## Build plan`**, never here.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (built before this workflow) and `dropped` (de scoped, kept for history).
- **Tier tag** `· GA` beside a heading raises that feature above the Beta default.
- **Letters** (A, B, C) mark work that existed before this workflow. Numbers are the build order across all epics.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
