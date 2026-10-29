import { describe, expect, it } from "vitest";
import {
  AppError,
  ERROR_CODES,
  ERROR_STATUS,
  normalizeError,
  toActionError,
  toProblem,
} from "./errors";

const options = { requestId: "req-1", exposeInternal: false };

describe("AppError", () => {
  it("covers AC-8: every code maps to one status and title", () => {
    for (const code of ERROR_CODES) {
      const error = new AppError(code);
      expect(error.status).toBe(ERROR_STATUS[code].status);
      expect(error.message).toBe(ERROR_STATUS[code].message);
    }
    expect(ERROR_STATUS.payload_too_large.title).toBe("Content Too Large");
    expect(ERROR_STATUS.idempotency_mismatch.title).toBe("Unprocessable Content");
  });

  it("X15: not_found always uses the default message", () => {
    expect(new AppError("not_found", "Project 42 belongs to acme").message).toBe("Not found");
  });

  it("idempotency_in_progress always retries after 1 second", () => {
    expect(new AppError("idempotency_in_progress").retryAfterSeconds).toBe(1);
    expect(
      new AppError("rate_limited", undefined, { retryAfterSeconds: 30 }).retryAfterSeconds,
    ).toBe(30);
  });
});

describe("normalizeError", () => {
  it("keeps an AppError, uses the first mapper that knows the error, else internal", () => {
    const expected = new AppError("conflict");
    expect(normalizeError(expected)).toBe(expected);
    const mapped = normalizeError(new Error("P2002"), [() => null, () => new AppError("conflict")]);
    expect(mapped.code).toBe("conflict");
    const cause = new Error("boom");
    const internal = normalizeError(cause, [() => null]);
    expect(internal.code).toBe("internal");
    expect(internal.cause).toBe(cause);
  });
});

describe("toProblem", () => {
  it("covers AC-8: builds the RFC 9457 body with field errors", () => {
    const error = new AppError("validation_failed", undefined, {
      fieldErrors: { title: ["Must be at most 5 characters"], "": ["Unknown field"] },
    });
    expect(toProblem(error, options)).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Some fields are invalid",
      code: "validation_failed",
      requestId: "req-1",
      errors: [
        { path: "title", message: "Must be at most 5 characters" },
        { path: "", message: "Unknown field" },
      ],
    });
  });

  it("X31: an internal error shows the generic text unless internals are exposed, and never a stack", () => {
    const error = normalizeError(new Error("connection refused at db:5432"));
    const hidden = toProblem(error, options);
    expect(hidden.detail).toBe("Something went wrong");
    expect(JSON.stringify(hidden)).not.toContain("at ");
    expect(toProblem(error, { ...options, exposeInternal: true }).detail).toBe(
      "connection refused at db:5432",
    );
  });
});

describe("toActionError", () => {
  it("covers AC-8: builds the action error with field errors when present", () => {
    expect(toActionError(new AppError("forbidden"), options)).toEqual({
      code: "forbidden",
      message: "You can't do that",
      requestId: "req-1",
    });
    const fields = { name: ["Is required"] };
    expect(
      toActionError(new AppError("validation_failed", undefined, { fieldErrors: fields }), options)
        .fieldErrors,
    ).toEqual(fields);
  });
});
