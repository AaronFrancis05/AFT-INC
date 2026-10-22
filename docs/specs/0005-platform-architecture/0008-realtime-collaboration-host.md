# 0005.0008. Realtime collaboration host

Part of [0005, platform architecture](index.md). Shared rules are in the index *Cross child contract*.

## Summary

App Studio's live canvas lets several people edit one design at once. The edits are Yjs documents (CRDTs, data that merges concurrent edits without conflicts), synced through a small Hocuspocus server that AFT runs itself as `apps/collab` on Fargate. Documents are saved to Postgres, so a restart loses nothing, and the server checks AFT tokens before anyone joins a document.

## Decision

Yjs documents synced by a self hosted Hocuspocus server in `apps/collab` on ECS Fargate, persisted to Postgres, authenticated with access tokens from `auth.remwa.tech`, scaled across tasks with the Hocuspocus Redis extension on Valkey.

## Rules

- **Endpoint**: `wss://collab.remwa.tech` (staging `collab.staging.remwa.tech`) through CloudFront to the internal ALB. CloudFront's origin timeouts, not the ALB's idle timeout, bound an idle socket, so client and server exchange a ping every 20 seconds (AC-17); the ALB idle timeout is set to 300 seconds. If the feature 13 spike fails, `collab` moves to the public ALB fallback in child 0002.
- **Auth**: the client sends a spec 0004 access token with audience `collab`; the server verifies it with JWKS, checks the user's role on the studio project (feature 111), and closes the socket when access is revoked (A6, S15).
- **Persistence**: debounced snapshots (every 2 seconds of activity and on last disconnect) into a `DesignDocument` table in the owning package, tenant scoped by `organizationId` (child 0003); large binary assets go to S3, not into the Yjs document.
- **Scale**: one task in staging; in production at least 2 tasks with the Hocuspocus Redis extension on Valkey so any task can serve any document; no sticky sessions required.
- **Restarts**: on `SIGTERM`, the server flushes snapshots and closes sockets with a reconnect code; clients reconnect automatically (S3).
- **Limits**: maximum document size and connections per document are set in feature 107 and enforced by the server.

## Consequences

- No per user fees and the data stays in AWS; we own scaling, persistence, and upgrades of `apps/collab`.
- WebSockets through CloudFront and an internal ALB must be proven at feature 13 (index Follow-up).

## Rationale (short)

Liveblocks would remove the server but charges per monthly active user and keeps the data with a vendor, which cuts against the budget and the EU promise. Y-Sweet is promising but younger. Hocuspocus is the established Yjs server, is one small container, and fits the same deploy path as every other app.
