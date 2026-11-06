import "server-only";
import { createHash } from "node:crypto";
import type { Tier } from "@aft/config/env";
import { AppError, normalizeError, type ErrorCode, type ErrorMapper } from "../errors";
import type { Logger } from "../log";
import { controlFlowOf } from "./call";
import type { IdempotencyId, IdempotencyStore, TransactionRunner } from "./types";

// Safe retries (spec 0011, AC-4, X1, X17 to X19): one transaction takes an advisory lock on the key,
// then replays a saved reply or runs the handler and saves its reply in the same commit.

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SAVED_REPLY_BYTES = 64 * 1024;

// Handler failures worth replaying: the same input would fail the same way. Busy, rate limited,
// 5xx, and crashes are never saved, so a retry runs again.
const SAVED_CODES: ReadonlySet<ErrorCode> = new Set([
  "validation_failed",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_mismatch",
]);

// 1 to 255 printable ASCII characters (AC-5).
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}

// JSON with object keys sorted and undefined keys dropped; a Date becomes its ISO string.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? "null";
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return value.map((item) => (item === undefined ? null : canonical(item)));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .flatMap((key) => {
          const item = (value as Record<string, unknown>)[key];
          return item === undefined ? [] : [[key, canonical(item)]];
        }),
    );
  return value;
}

// SHA 256 hex of the method, the scope, and the parsed input. The owner is part of the key, not this.
export function fingerprintOf(method: string, scope: string, parsedInput: unknown): string {
  return createHash("sha256")
    .update(`${method}\n${scope}\n${canonicalJson(parsedInput)}`)
    .digest("hex");
}

export type Reply = { status: number; body: unknown };

export type IdempotentCall<Tx> = {
  store: IdempotencyStore<Tx>;
  transactions: TransactionRunner<Tx>;
  id: IdempotencyId;
  fingerprint: string;
  now: Date;
  tier: Tier;
  log: Logger;
  errorMappers: readonly ErrorMapper[];
  handler: (tx: Tx) => Promise<Reply>;
  // How a saved handler failure is stored: a problem body for routes, the result object for actions.
  errorReply: (error: AppError) => Reply;
};

export type IdempotentResult = Reply & { replayed: boolean };

export async function runIdempotent<Tx>(call: IdempotentCall<Tx>): Promise<IdempotentResult> {
  const { store, transactions, id, fingerprint, now } = call;
  const organizationId = id.organizationId || undefined;
  let handlerFailed = false;

  // A reply over 64 KB is a programming error (mutations return the changed resource, never a
  // list): it throws where it can be fixed, and in production the reply is sent unsaved.
  function fits(reply: Reply): boolean {
    const bytes = Buffer.byteLength(canonicalJson(reply.body));
    if (bytes <= MAX_SAVED_REPLY_BYTES) return true;
    if (call.tier !== "production")
      throw new Error(`${id.scope}: idempotent reply is ${bytes} bytes, over the 64 KB limit`);
    call.log.error({ scope: id.scope, bytes }, "idempotent reply too large to save");
    return false;
  }

  try {
    return await transactions.run(organizationId, async (tx) => {
      if (!(await store.tryLock(tx, id))) throw new AppError("idempotency_in_progress");
      const stored = await store.find(tx, id, now);
      if (stored) {
        if (stored.fingerprint !== fingerprint) throw new AppError("idempotency_mismatch");
        return { status: stored.status, body: stored.body, replayed: true };
      }
      let reply: Reply;
      try {
        reply = await call.handler(tx);
      } catch (error) {
        handlerFailed = true;
        throw error;
      }
      if (fits(reply)) await store.save(tx, id, { fingerprint, ...reply }, now);
      return { ...reply, replayed: false };
    });
  } catch (caught) {
    // The handler's writes rolled back. A failure the same input would repeat is saved by a second
    // short transaction that takes the lock again and inserts only if no row exists. Next.js control
    // flow is never saved; the wrapper reports it (AC-9).
    if (handlerFailed && !controlFlowOf(caught)) {
      const error = normalizeError(caught, call.errorMappers);
      if (SAVED_CODES.has(error.code)) await saveFailure(call, error);
    }
    throw caught;
  }
}

async function saveFailure<Tx>(call: IdempotentCall<Tx>, error: AppError): Promise<void> {
  const { store, id, now } = call;
  const reply = call.errorReply(error);
  try {
    await call.transactions.run(id.organizationId || undefined, async (tx) => {
      if (!(await store.tryLock(tx, id))) return;
      if (await store.find(tx, id, now)) return;
      await store.save(tx, id, { fingerprint: call.fingerprint, ...reply }, now);
    });
  } catch (saveError) {
    // The caller still gets the failure; a retry runs the handler again.
    call.log.warn({ err: saveError, scope: id.scope }, "could not save the idempotent failure");
  }
}
