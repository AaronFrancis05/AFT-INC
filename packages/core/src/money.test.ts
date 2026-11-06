import { describe, expect, it } from "vitest";
import {
  add,
  allocate,
  compare,
  formatMoney,
  isZero,
  money,
  moneySchema,
  multiplyRatio,
  negate,
  subtract,
  type Currency,
  type Money,
  type RoundingMode,
} from "./money";
import { parseInput } from "./validate";

const usd = (amountMinor: number) => money(amountMinor, "usd");
const amounts = (parts: Money[]) => parts.map((part) => part.amountMinor);
const MAX = Number.MAX_SAFE_INTEGER;

describe("money basics (AC-14, X10)", () => {
  it("builds frozen integer minor units and never a -0", () => {
    const price = usd(4_900);
    expect(price).toEqual({ amountMinor: 4_900, currency: "usd" });
    expect(Object.isFrozen(price)).toBe(true);
    expect(Object.is(negate(usd(0)).amountMinor, 0)).toBe(true);
  });

  it("X27: throws on a float, an unsafe integer, or an unknown currency", () => {
    for (const bad of [1.5, NaN, Infinity, MAX + 1]) expect(() => usd(bad)).toThrow(RangeError);
    expect(() => money(1, "eur" as Currency)).toThrow(TypeError);
  });

  it("adds, subtracts, negates, compares, and checks zero", () => {
    expect(add(usd(100), usd(250)).amountMinor).toBe(350);
    expect(subtract(usd(100), usd(250)).amountMinor).toBe(-150);
    expect(negate(usd(42)).amountMinor).toBe(-42);
    expect([compare(usd(1), usd(2)), compare(usd(2), usd(2)), compare(usd(3), usd(2))]).toEqual([
      -1, 0, 1,
    ]);
    expect(isZero(usd(0))).toBe(true);
    expect(isZero(usd(-1))).toBe(false);
  });

  it("X27: throws on mixed currencies and on a result past the safe range", () => {
    const other = { amountMinor: 1, currency: "eur" } as unknown as Money;
    expect(() => add(usd(1), other)).toThrow(TypeError);
    expect(() => subtract(usd(1), other)).toThrow(TypeError);
    expect(() => compare(usd(1), other)).toThrow(TypeError);
    expect(() => add(usd(MAX), usd(1))).toThrow(RangeError);
    expect(() => subtract(usd(-MAX), usd(1))).toThrow(RangeError);
  });
});

describe("multiplyRatio (AC-14)", () => {
  const round = (amount: number, mode: RoundingMode, n = 1, d = 2) =>
    multiplyRatio(usd(amount), n, d, mode).amountMinor;

  it("halfEven versus halfUp on exact halves, both signs", () => {
    // 5/2 = 2.5, 7/2 = 3.5, -5/2 = -2.5
    expect([round(5, "halfEven"), round(7, "halfEven"), round(-5, "halfEven")]).toEqual([2, 4, -2]);
    expect([round(5, "halfUp"), round(7, "halfUp"), round(-5, "halfUp")]).toEqual([3, 4, -3]);
  });

  it("floor goes toward minus infinity and ceil toward plus infinity", () => {
    expect([round(5, "floor"), round(-5, "floor")]).toEqual([2, -3]);
    expect([round(5, "ceil"), round(-5, "ceil")]).toEqual([3, -2]);
  });

  it("rounds off halves only on the exact half; exact results stay exact", () => {
    expect(round(10, "halfEven", 1, 3)).toBe(3); // 3.33
    expect(round(20, "halfEven", 1, 3)).toBe(7); // 6.67
    expect(round(4_900, "halfEven", 16, 100)).toBe(784);
  });

  it("is exact past 2^53 in the middle of the computation", () => {
    // MAX × 3 overflows a float but not BigInt; ÷ 3 brings it back.
    expect(multiplyRatio(usd(MAX), 3, 3, "floor").amountMinor).toBe(MAX);
  });

  it("X27: throws on a bad ratio, a missing mode, or an unsafe result", () => {
    expect(() => multiplyRatio(usd(1), 1, 0, "floor")).toThrow(RangeError);
    expect(() => multiplyRatio(usd(1), 1, -2, "floor")).toThrow(RangeError);
    expect(() => multiplyRatio(usd(1), 0.5, 1, "floor")).toThrow(RangeError);
    expect(() => multiplyRatio(usd(1), 1, 2, undefined as unknown as RoundingMode)).toThrow(
      TypeError,
    );
    expect(() => multiplyRatio(usd(MAX), 2, 1, "floor")).toThrow(RangeError);
  });
});

describe("allocate (AC-14)", () => {
  it("gives leftover units to the largest remainders, then the earlier index", () => {
    expect(amounts(allocate(usd(4_900), [1, 1, 1]))).toEqual([1_634, 1_633, 1_633]);
    expect(amounts(allocate(usd(100), [1, 2]))).toEqual([33, 67]);
    expect(amounts(allocate(usd(5), [3, 7]))).toEqual([2, 3]); // 1.5 and 3.5: the tie goes to the first
  });

  it("always adds up to the total, negatives and zero weights included", () => {
    for (const [amount, weights] of [
      [1_001, [1, 1, 1, 1, 1, 1, 1]],
      [-4_900, [1, 1, 1]],
      [7, [0, 5, 0, 5]],
      [MAX, [1, 2, 3]],
    ] as const) {
      const parts = allocate(usd(amount), weights);
      expect(parts.reduce((sum, part) => sum + BigInt(part.amountMinor), BigInt(0))).toBe(
        BigInt(amount),
      );
    }
    expect(amounts(allocate(usd(-4_900), [1, 1, 1]))).toEqual([-1_634, -1_633, -1_633]);
    expect(amounts(allocate(usd(7), [0, 5, 0, 5]))).toEqual([0, 4, 0, 3]);
  });

  it("X27: throws on no weights, a negative or float weight, or a zero sum", () => {
    expect(() => allocate(usd(1), [])).toThrow(RangeError);
    expect(() => allocate(usd(1), [1, -1])).toThrow(RangeError);
    expect(() => allocate(usd(1), [0.5])).toThrow(RangeError);
    expect(() => allocate(usd(1), [0, 0])).toThrow(RangeError);
  });
});

describe("formatMoney and moneySchema", () => {
  it("formats the exact decimal with the caller's locale", () => {
    expect(formatMoney(add(usd(4_900), usd(784)), "en-US")).toBe("$56.84");
    expect(formatMoney(usd(-5), "en-US")).toBe("-$0.05");
    expect(formatMoney(usd(MAX), "en-US")).toBe("$90,071,992,547,409.91");
  });

  it("parses the wire shape into Money, and bad money is validation_failed", () => {
    expect(parseInput(moneySchema, { amountMinor: 4_900, currency: "usd" })).toEqual(usd(4_900));
    for (const bad of [
      { amountMinor: 1.5, currency: "usd" },
      { amountMinor: MAX + 1, currency: "usd" },
      { amountMinor: 1, currency: "USD" },
      { amountMinor: 1, currency: "usd", extra: true },
    ])
      expect(() => parseInput(moneySchema, bad)).toThrow(
        expect.objectContaining({ code: "validation_failed" }),
      );
  });
});
