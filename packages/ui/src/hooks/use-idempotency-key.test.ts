import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIdempotencyKey } from "./use-idempotency-key";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("useIdempotencyKey (spec 0011, X1)", () => {
  it("keeps one key across renders, so a retry sends the same key", () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current.key;
    expect(first).toMatch(UUID);
    rerender();
    expect(result.current.key).toBe(first);
  });

  it("rotate() gives a new key, and rotate itself is stable", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const { key, rotate } = result.current;
    act(() => rotate());
    expect(result.current.key).toMatch(UUID);
    expect(result.current.key).not.toBe(key);
    expect(result.current.rotate).toBe(rotate);
  });

  it("each mounted form has its own key", () => {
    const a = renderHook(() => useIdempotencyKey());
    const b = renderHook(() => useIdempotencyKey());
    expect(a.result.current.key).not.toBe(b.result.current.key);
  });
});
