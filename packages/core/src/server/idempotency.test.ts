import { describe, expect, it } from "vitest";
import { canonicalJson, fingerprintOf, isIdempotencyKey } from "./idempotency";

describe("isIdempotencyKey (AC-5)", () => {
  it("accepts 1 to 255 printable ASCII characters", () => {
    expect(isIdempotencyKey("a")).toBe(true);
    expect(isIdempotencyKey("~".repeat(255))).toBe(true);
    expect(isIdempotencyKey("2f1c8a6e-5d1b-4f4e-9f7a-0a1b2c3d4e5f")).toBe(true);
  });

  it("refuses empty, too long, spaces, control, and non ASCII keys", () => {
    for (const key of ["", "a".repeat(256), "has space", "tab\t", "café", null, undefined, 7])
      expect(isIdempotencyKey(key), String(key)).toBe(false);
  });
});

describe("fingerprintOf (AC-4)", () => {
  it("ignores key order and undefined keys, and reads a Date as its ISO string", () => {
    const at = new Date("2026-10-29T10:00:00.000Z");
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [1, undefined] }, at })).toBe(
      '{"a":{"c":[1,null]},"at":"2026-10-29T10:00:00.000Z","b":1}',
    );
    expect(fingerprintOf("POST", "POST /x", { b: 1, a: 2, z: undefined })).toBe(
      fingerprintOf("POST", "POST /x", { a: 2, b: 1 }),
    );
  });

  it("changes with the method, the scope, or the input, and is SHA 256 hex", () => {
    const base = fingerprintOf("POST", "POST /x", { a: 1 });
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintOf("PATCH", "POST /x", { a: 1 })).not.toBe(base);
    expect(fingerprintOf("POST", "POST /y", { a: 1 })).not.toBe(base);
    expect(fingerprintOf("POST", "POST /x", { a: 2 })).not.toBe(base);
  });
});
