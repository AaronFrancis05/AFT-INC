// One error type for every expected failure, and the two reply shapes built from it (spec 0011).

export const ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_in_progress",
  "idempotency_mismatch",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "model_output_invalid",
  "unavailable",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

type ErrorInfo = { status: number; title: string; message: string };

// Status, the RFC 9110 status phrase used as the problem title, and the default message.
export const ERROR_STATUS: Readonly<Record<ErrorCode, ErrorInfo>> = {
  bad_request: { status: 400, title: "Bad Request", message: "The request is malformed" },
  validation_failed: { status: 400, title: "Bad Request", message: "Some fields are invalid" },
  unauthenticated: { status: 401, title: "Unauthorized", message: "Sign in to continue" },
  forbidden: { status: 403, title: "Forbidden", message: "You can't do that" },
  not_found: { status: 404, title: "Not Found", message: "Not found" },
  conflict: { status: 409, title: "Conflict", message: "That conflicts with the current state" },
  idempotency_in_progress: {
    status: 409,
    title: "Conflict",
    message: "This request is still being processed",
  },
  payload_too_large: {
    status: 413,
    title: "Content Too Large",
    message: "The request is too large",
  },
  unsupported_media_type: {
    status: 415,
    title: "Unsupported Media Type",
    message: "Send application/json",
  },
  idempotency_mismatch: {
    status: 422,
    title: "Unprocessable Content",
    message: "This idempotency key was used with different input",
  },
  rate_limited: { status: 429, title: "Too Many Requests", message: "Too many requests" },
  internal: { status: 500, title: "Internal Server Error", message: "Something went wrong" },
  model_output_invalid: {
    status: 502,
    title: "Bad Gateway",
    message: "The model returned something unusable",
  },
  unavailable: { status: 503, title: "Service Unavailable", message: "Temporarily unavailable" },
};

// Field path (dotted, "" for the root) to its problems.
export type FieldErrors = Record<string, string[]>;

export type AppErrorOptions = {
  cause?: unknown;
  fieldErrors?: FieldErrors;
  retryAfterSeconds?: number;
};

// An expected failure. Its message is shown to the caller, so it never holds a secret, another
// tenant's data, or raw input.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors: FieldErrors | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: ErrorCode, message?: string, options: AppErrorOptions = {}) {
    const info = ERROR_STATUS[code];
    // not_found always reads the same, so a missing record and another workspace's look alike (X15).
    super(code === "not_found" ? info.message : (message ?? info.message), {
      cause: options.cause,
    });
    this.name = "AppError";
    this.code = code;
    this.status = info.status;
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = code === "idempotency_in_progress" ? 1 : options.retryAfterSeconds;
  }
}

// Turns a library error (Prisma, a driver) into an AppError, or returns null when it doesn't know it.
export type ErrorMapper = (error: unknown) => AppError | null;

// Every failure becomes an AppError; anything unknown is internal, with the original kept as cause.
export function normalizeError(error: unknown, mappers: readonly ErrorMapper[] = []): AppError {
  if (error instanceof AppError) return error;
  for (const map of mappers) {
    const mapped = map(error);
    if (mapped) return mapped;
  }
  return new AppError("internal", undefined, { cause: error });
}

export type ReplyOptions = {
  requestId: string;
  // Show an internal error's real message (AFT_ENV=development only, X31).
  exposeInternal: boolean;
};

function messageOf(error: AppError, exposeInternal: boolean): string {
  if (error.code === "internal" && exposeInternal && error.cause instanceof Error)
    return error.cause.message;
  return error.message;
}

export type ProblemDetails = {
  type: "about:blank";
  title: string;
  status: number;
  detail: string;
  code: ErrorCode;
  requestId: string;
  errors?: { path: string; message: string }[];
};

// The RFC 9457 body for a route error. Never includes a stack (X8).
export function toProblem(error: AppError, options: ReplyOptions): ProblemDetails {
  const problem: ProblemDetails = {
    type: "about:blank",
    title: ERROR_STATUS[error.code].title,
    status: error.status,
    detail: messageOf(error, options.exposeInternal),
    code: error.code,
    requestId: options.requestId,
  };
  if (error.fieldErrors) {
    problem.errors = Object.entries(error.fieldErrors).flatMap(([path, messages]) =>
      messages.map((message) => ({ path, message })),
    );
  }
  return problem;
}

export type ActionError = {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldErrors;
  requestId: string;
};

// The error half of a server action result.
export function toActionError(error: AppError, options: ReplyOptions): ActionError {
  const result: ActionError = {
    code: error.code,
    message: messageOf(error, options.exposeInternal),
    requestId: options.requestId,
  };
  if (error.fieldErrors) result.fieldErrors = error.fieldErrors;
  return result;
}
