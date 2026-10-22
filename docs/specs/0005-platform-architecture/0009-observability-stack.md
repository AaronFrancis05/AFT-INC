# 0005.0009. Observability stack

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

Every service reports what it is doing through OpenTelemetry, the open standard for traces, metrics, and logs, and sends it to Grafana Cloud. Errors also go to Sentry, which groups them and shows the stack trace. Both have free tiers and EU regions, and because the services speak OpenTelemetry, switching vendors later means changing configuration, not code.

## Decision

OpenTelemetry SDK in every service, exporting OTLP directly to a Grafana Cloud EU stack; Sentry (EU region) for errors and releases; CloudWatch Logs kept only as a 3 day fallback; set up in `packages/observability`.

## Rules

- **Resource attributes** on every signal: `service.name` (the app), `service.version` (git SHA), `deployment.environment` (`staging`, `production`), and `organization.id` on spans that act for a tenant (AC-13).
- **Traces**: automatic HTTP, fetch, Prisma, and AWS SDK spans; custom spans for workflows (child 0004) and adapters (child 0005). Sampling: 100 percent in staging; in production 100 percent of errors and 20 percent of the rest, revisited when the free tier limit nears.
- **Logs**: structured JSON (`pino`) with `trace_id` and `span_id`; sent through the OpenTelemetry log exporter; also written to stdout, which ECS ships to CloudWatch Logs with 3 day retention as a fallback. Never log secrets, tokens, OTPs, or full request bodies (A3).
- **Metrics**: request rate, error rate, latency per route; workflow queue depth; provider latency and cost; Aurora ACU and Valkey use from CloudWatch through Grafana's AWS integration.
- **Backend outages**: exporters run asynchronously with bounded queues and short timeouts; a service starts, serves, and shuts down normally when Grafana Cloud or Sentry is unreachable, dropping telemetry rather than blocking (AC-13).
- **Errors**: Sentry SDKs in Next.js apps (server, edge, client) and Node apps; source maps uploaded on release; releases named by git SHA; personal data scrubbed before send.
- **Alerts** (feature 23): Grafana alerting on error rate, latency, failed workflows, and budget; email to the engineer at first.
- **Audit log** (feature 48) is separate, stored in Postgres, and never sampled.

## Consequences

- $0 within free tiers at our size; beyond them, sampling and retention are the levers before paying.
- Two vendors to manage and list as sub processors (EU regions for both).
- Exporting straight from each service means no collector to batch or filter; a shared collector service is added if volume demands it.

## Rationale (short)

CloudWatch alone charges per GB of logs and has weak tracing and error grouping. OpenTelemetry keeps the code vendor neutral, Grafana Cloud covers traces, logs, and metrics in one place for free at this size, and Sentry is the strongest error tool for Next.js. Both chosen in the design conversation.
