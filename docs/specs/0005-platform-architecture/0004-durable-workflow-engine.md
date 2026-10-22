# 0005.0004. Durable workflow engine

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Anything slow, multi step, or that must survive a crash (AI generation, provisioning, code generation, billing sync, sending outbox events, back channel logout) runs as a DBOS workflow in `apps/worker`. DBOS is a TypeScript library that saves each step's result in Postgres, so after a crash or deploy the workflow resumes from the last finished step instead of starting over. Database steps commit exactly once; calls to outside services may repeat after a crash, so they must be safe to repeat. One worker task runs everything at first, which keeps recovery simple.

## Decision

DBOS Transact (TypeScript) in exactly one `apps/worker` task per environment, its system tables in a separate `dbos` database migrated by `aft_migrator`, an executor id and app version set explicitly, transaction steps scoped with `withOrg` or `withSystem`; other apps start and watch workflows through the DBOS client.

## Rules

- **Where**: workflows are defined in the domain package that owns them (`packages/provisioning`, `packages/ai`, `packages/billing`) and registered by `apps/worker`, the only process that executes them. Web, auth, mcp, and gateway start or enqueue workflows with the DBOS client and never run steps.
- **One executor**: the worker service runs exactly 1 task, deployed with minimum healthy 0 percent and maximum 100 percent, so the old task stops before the new one starts and never runs beside it. `DBOS__VMID` is set from the ECS task id and `DBOS__APPVERSION` from the git SHA. Before stopping, the worker stops taking new work and lets in flight steps finish within the 30 second stop timeout.
- **Versions**: a deploy never changes the step order of a workflow that may be in flight; a changed workflow gets a new name or version, and the release notes say whether old workflows must drain first. On start, the new worker recovers pending workflows of its own version; workflows of an older version are resumed with DBOS's fork or restart tools, by a runbook step in feature 24.
- **Transaction steps**: database writes inside a workflow are DBOS transaction steps on the `aft` database as `aft_system`; the step calls `withOrg(tx, orgId)` (or `withSystem(tx, reason)` for cross tenant work) on the transaction DBOS opened, so the write and its checkpoint commit together and run exactly once (X4).
- **External steps**: every external call (provider, AWS, Stripe, email) is its own step, wrapped by the adapter's timeout, retry budget with jitter, and circuit breaker (X6); because a step can run again after a crash, each one passes an idempotency key to the provider or checks for its own earlier result first (X1, AC-10).
- **Sagas**: a workflow that creates external resources records a compensation for each step and runs them in reverse on failure (provisioning, child 0002).
- **Queues**: named DBOS queues (`generation`, `provisioning`, `outbox`, `default`) with concurrency limits per queue and per organization, so one tenant cannot starve others (D8).
- **Long requests** (X5): an endpoint that would exceed 30 seconds starts a workflow, returns `202` with the workflow id, and streams progress over SSE from workflow events (`setEvent` and `getEvent`) with a heartbeat every 20 seconds.
- **Outbox** (feature 25): domain writes insert an outbox row in the same transaction; a DBOS scheduled workflow, running as `aft_system`, relays rows and marks them sent.
- **Schema**: `aft_migrator` creates the `dbos` system database and the transaction output table in `aft` during the `migrate` task; the worker starts with DBOS's own migration step turned off.
- **Observability**: each workflow and step creates an OpenTelemetry span with `workflow.name`, `workflow.id`, and `organization.id`; a queue backlog alarm feeds the scale trigger (index Follow-up).

## Consequences

- No new infrastructure or bill; the workflow state is in the database we already back up.
- One worker task limits throughput and means a short pause in workflow processing during each worker deploy; DBOS Conductor or several executors come at the trigger.
- DBOS is younger than Temporal; maturity is checked at feature 24, and the domain packages hide it so a later move stays contained.

## Rationale (short)

Temporal Cloud starts at the whole monthly budget and self hosting it is a cluster of its own; Inngest sends every step outside AWS; plain queues leave sagas and resume to us. DBOS gives durable steps on the Postgres we already run, in the language we already write. A single explicitly named executor avoids the duplicate recovery and orphaned versions that rolling deploys of several workers would cause.
