// Tables with an organizationId column that may skip row level security, each with its reason
// (spec 0011, AC-3). The catalog test fails on any other such table without the standard policies.
export const RLS_ALLOWLIST: Readonly<Record<string, string>> = {
  idempotency_record:
    "keyed by caller; reached only through @aft/db/idempotency, which always filters by the full owner",
};
