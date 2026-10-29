import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { Tier } from "@aft/config/env";
import { AppError } from "../errors";
import type { Caller, IdempotencyId, TransactionRunner } from "./types";

// What the action and route wrappers share: the caller's ids, and Next.js control flow (spec 0011,
// AC-9, X26).

export function ownerOf(caller: Caller): Pick<IdempotencyId, "ownerKind" | "ownerId"> {
  return caller.kind === "user"
    ? { ownerKind: "user", ownerId: caller.userId }
    : { ownerKind: "api_key", ownerId: caller.apiKeyId };
}

export function userIdOf(caller: Caller): string | undefined {
  return caller.kind === "user" ? caller.userId : caller.userId;
}

// redirect(), notFound(), forbidden(), unauthorized(), and Next.js's own bailouts are thrown, not
// failures. unstable_rethrow knows them all and also looks inside `cause`; this returns the one it
// found, or null.
export function controlFlowOf(error: unknown): { error: unknown } | null {
  try {
    unstable_rethrow(error);
    return null;
  } catch (found) {
    return { error: found };
  }
}

const FALLBACK_RESULT: Readonly<Record<number, string>> = {
  401: "unauthenticated",
  403: "forbidden",
  404: "not_found",
};

// The status and result for the access line. Next.js writes them into the error's digest:
// "NEXT_REDIRECT;<type>;<url>;<status>;" and "NEXT_HTTP_ERROR_FALLBACK;<status>".
export function controlFlowOutcome(error: unknown): { status: number; result: string } {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string") {
    const parts = digest.split(";");
    if (parts[0] === "NEXT_REDIRECT") return { status: Number(parts.at(-2)) || 307, result: "ok" };
    if (parts[0] === "NEXT_HTTP_ERROR_FALLBACK") {
      const status = Number(parts[1]);
      return { status, result: FALLBACK_RESULT[status] ?? "ok" };
    }
  }
  return { status: 200, result: "ok" };
}

// A call that is not idempotent: a handler that redirects still commits its writes, and the
// control flow error is rethrown after the commit.
export async function runCommitted<Tx, T>(
  transactions: TransactionRunner<Tx>,
  organizationId: string | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  let controlFlow: { error: unknown } | null = null;
  const value = await transactions.run(organizationId, async (tx) => {
    try {
      return await fn(tx);
    } catch (caught) {
      controlFlow = controlFlowOf(caught);
      if (!controlFlow) throw caught;
      return undefined;
    }
  });
  if (controlFlow) throw (controlFlow as { error: unknown }).error;
  return value as T;
}

// An idempotent handler returns data and the client navigates; control flow there is a
// programming error. Its transaction has already rolled back. It throws where it can be fixed and
// is a plain internal error in production. The control flow error is not kept as a cause, since
// unstable_rethrow looks inside causes and would let the redirect through after all.
export function idempotentControlFlow(name: string, tier: Tier): AppError {
  const message = `${name}: an idempotent handler must return data, not call redirect() or notFound()`;
  if (tier !== "production") throw new Error(message);
  return new AppError("internal", undefined, { cause: new Error(message) });
}
