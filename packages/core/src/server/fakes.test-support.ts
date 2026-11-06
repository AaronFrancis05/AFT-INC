// In memory stand ins for the database pieces the wrappers take, for the unit tests. They model the
// parts the flow relies on: a lock held until its transaction ends, and writes that only land on
// commit. The real ones are proven against Postgres in @aft/db.
import type {
  ContextResolver,
  IdempotencyId,
  IdempotencyStore,
  ResolvedContext,
  StoredReply,
  TransactionRunner,
} from "./types";

export type FakeTx = {
  organizationId: string | undefined;
  locks: Set<string>;
  pending: Map<string, { reply: StoredReply; expiresAt: number }>;
};

const nameOf = (id: IdempotencyId) =>
  [id.ownerKind, id.ownerId, id.organizationId, id.scope, id.key].join(":");

export function fakeDatabase() {
  const held = new Set<string>();
  const rows = new Map<string, { reply: StoredReply; expiresAt: number }>();
  const runs: { organizationId: string | undefined; committed: boolean }[] = [];
  // Lets a test act between two transactions, as a concurrent caller would.
  const hooks: { beforeRun?: (index: number) => void } = {};

  const transactions: TransactionRunner<FakeTx> = {
    async run(organizationId, fn) {
      hooks.beforeRun?.(runs.length);
      const tx: FakeTx = { organizationId, locks: new Set(), pending: new Map() };
      try {
        const value = await fn(tx);
        for (const [name, row] of tx.pending) rows.set(name, row);
        runs.push({ organizationId, committed: true });
        return value;
      } catch (error) {
        runs.push({ organizationId, committed: false });
        throw error;
      } finally {
        for (const name of tx.locks) held.delete(name);
      }
    },
  };

  const store: IdempotencyStore<FakeTx> = {
    async tryLock(tx, id) {
      const name = nameOf(id);
      if (held.has(name) && !tx.locks.has(name)) return false;
      held.add(name);
      tx.locks.add(name);
      return true;
    },
    async find(tx, id, now) {
      const row = tx.pending.get(nameOf(id)) ?? rows.get(nameOf(id));
      return row && row.expiresAt > now.getTime() ? row.reply : null;
    },
    async save(tx, id, reply, now) {
      tx.pending.set(nameOf(id), { reply, expiresAt: now.getTime() + 24 * 60 * 60 * 1000 });
    },
  };

  return { transactions, store, rows, runs, held, hooks, nameOf };
}

export function fakeResolver(context: ResolvedContext | null = null): ContextResolver & {
  context: ResolvedContext | null;
} {
  const resolver = {
    context,
    resolve: async () => resolver.context,
  };
  return resolver;
}
