// What the wrapper factories take from the apps and packages (spec 0011, Interfaces the factories take).

export type AuthMode = "public" | "user" | "org";

export type Caller =
  { kind: "user"; userId: string } | { kind: "api_key"; apiKeyId: string; userId?: string };

export type ResolvedContext = { caller: Caller; organizationId?: string; role?: string };

export interface ContextResolver {
  // null when there is no caller (401). In "org" mode a caller with no active workspace, or one it
  // is not a member of, comes back without organizationId (404).
  resolve(args: { headers: Headers; mode: "user" | "org" }): Promise<ResolvedContext | null>;
}

export type IdempotencyId = {
  ownerKind: "user" | "api_key";
  ownerId: string;
  organizationId: string;
  scope: string;
  key: string;
};

export type StoredReply = { fingerprint: string; status: number; body: unknown };

export interface IdempotencyStore<Tx> {
  // pg_try_advisory_xact_lock on the whole id; false while another call holds it.
  tryLock(tx: Tx, id: IdempotencyId): Promise<boolean>;
  // Ignores rows whose expiresAt is at or before now.
  find(tx: Tx, id: IdempotencyId, now: Date): Promise<StoredReply | null>;
  // Inserts, or overwrites an expired row; expiresAt is now plus 24 hours.
  save(tx: Tx, id: IdempotencyId, reply: StoredReply, now: Date): Promise<void>;
}

export interface TransactionRunner<Tx> {
  // Opens one interactive transaction (timeout 20 s, maxWait 5 s), scoped with withOrg when
  // organizationId is set.
  run<T>(organizationId: string | undefined, fn: (tx: Tx) => Promise<T>): Promise<T>;
}
