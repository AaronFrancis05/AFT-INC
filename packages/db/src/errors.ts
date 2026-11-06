import "server-only";
import { AppError, type ErrorMapper } from "@aft/core/errors";

// Prisma errors the wrappers can answer with a known code (spec 0011, AC-2, AC-8). Matched by
// shape, not instanceof, so it holds across duplicate copies of the Prisma runtime.

type KnownRequestError = {
  name: "PrismaClientKnownRequestError";
  code: string;
  message: string;
  meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
};

function isKnownRequestError(error: unknown): error is KnownRequestError {
  return (
    error instanceof Error &&
    error.name === "PrismaClientKnownRequestError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

// SQLSTATE 42501: a row level security policy refused the row. Raw queries surface it as P2010 and
// model queries as P2039; either way the driver's code is kept on the adapter error.
const INSUFFICIENT_PRIVILEGE = "42501";

// P2028 covers every transaction manager failure; only a transaction that could not start within
// maxWait (the pool was busy) is worth retrying.
const START_TIMEOUT = "Unable to start a transaction in the given time";

export const prismaErrorMapper: ErrorMapper = (error) => {
  if (!isKnownRequestError(error)) return null;
  if (error.meta?.driverAdapterError?.cause?.originalCode === INSUFFICIENT_PRIVILEGE)
    // Another workspace's row reads as one that does not exist (X15).
    return new AppError("not_found", undefined, { cause: error });
  switch (error.code) {
    case "P2025":
      return new AppError("not_found", undefined, { cause: error });
    case "P2002":
    case "P2003":
      return new AppError("conflict", undefined, { cause: error });
    case "P2028":
      return error.message.includes(START_TIMEOUT)
        ? new AppError("unavailable", undefined, { cause: error, retryAfterSeconds: 1 })
        : null;
    default:
      return null;
  }
};
