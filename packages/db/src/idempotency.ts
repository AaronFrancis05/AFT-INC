import "server-only";
import { IDEMPOTENCY_TTL_MS, type IdempotencyId, type IdempotencyStore } from "@aft/core/server";
import { Prisma } from "./generated/prisma/client";
import type { OrgDb } from "./tenant";

// Saved idempotent replies in idempotency_record (spec 0011, AC-4). Every query names the whole
// owner, which is why the table needs no row level security.

function where(id: IdempotencyId) {
  return {
    ownerKind: id.ownerKind,
    ownerId: id.ownerId,
    organizationId: id.organizationId,
    scope: id.scope,
    key: id.key,
  };
}

export function createIdempotencyStore(): IdempotencyStore<OrgDb> {
  return {
    async tryLock(tx, id) {
      // A hash collision between two keys only gives a needless 409 that the client retries.
      const lockName = [id.ownerKind, id.ownerId, id.organizationId, id.scope, id.key].join(":");
      const [row] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) AS locked`;
      return row?.locked === true;
    },

    async find(tx, id, now) {
      const row = await tx.idempotencyRecord.findFirst({
        where: { ...where(id), expiresAt: { gt: now } },
        select: { fingerprint: true, responseStatus: true, responseBody: true },
      });
      return row
        ? { fingerprint: row.fingerprint, status: row.responseStatus, body: row.responseBody }
        : null;
    },

    async save(tx, id, reply, now) {
      const saved = {
        fingerprint: reply.fingerprint,
        responseStatus: reply.status,
        // A reply with no body is stored as JSON null.
        responseBody:
          reply.body === null || reply.body === undefined
            ? Prisma.JsonNull
            : (reply.body as Prisma.InputJsonValue),
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
      };
      // The caller holds the lock and found no live row, so this inserts, or replaces an expired one.
      await tx.idempotencyRecord.upsert({
        where: { ownerKind_ownerId_organizationId_scope_key: where(id) },
        create: { ...where(id), ...saved },
        update: saved,
      });
    },
  };
}
