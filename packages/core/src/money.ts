// Money as integer minor units (spec 0011, AC-14, X10, X27). No function takes or returns a float
// amount, and nothing rounds without a named mode. A programming error (unsafe integer, mixed or
// unknown currency, bad ratio or weight) throws RangeError or TypeError, which becomes internal.
import { z } from "zod";

// Lowercase ISO 4217. Adding a currency is a one line change.
export const CURRENCIES = { usd: { minorDigits: 2 } } as const;

export type Currency = keyof typeof CURRENCIES;

export type Money = { readonly amountMinor: number; readonly currency: Currency };

// halfUp means half away from zero; floor goes toward minus infinity, ceil toward plus infinity.
export const ROUNDING_MODES = ["halfEven", "halfUp", "floor", "ceil"] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

// The shared tsconfig targets ES2017, which has no BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

function assertSafe(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be a safe integer`);
}

function fromBigInt(value: bigint, currency: Currency): Money {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError("The amount is outside the safe integer range");
  return money(Number(value), currency);
}

function sameCurrency(a: Money, b: Money): Currency {
  if (a.currency !== b.currency)
    throw new TypeError(`Can't mix currencies: ${a.currency} and ${b.currency}`);
  return a.currency;
}

export function money(amountMinor: number, currency: Currency): Money {
  assertSafe(amountMinor, "amountMinor");
  if (!isCurrency(currency)) throw new TypeError(`Unknown currency: ${String(currency)}`);
  // 0 - 0 is 0, so a negated zero never becomes -0.
  return Object.freeze({ amountMinor: amountMinor === 0 ? 0 : amountMinor, currency });
}

export function add(a: Money, b: Money): Money {
  return fromBigInt(BigInt(a.amountMinor) + BigInt(b.amountMinor), sameCurrency(a, b));
}

export function subtract(a: Money, b: Money): Money {
  return fromBigInt(BigInt(a.amountMinor) - BigInt(b.amountMinor), sameCurrency(a, b));
}

export function negate(m: Money): Money {
  return money(-m.amountMinor, m.currency);
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b);
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0;
}

export function isZero(m: Money): boolean {
  return m.amountMinor === 0;
}

// m × numerator / denominator, computed exactly and rounded with the given mode (no default).
export function multiplyRatio(
  m: Money,
  numerator: number,
  denominator: number,
  mode: RoundingMode,
): Money {
  assertSafe(numerator, "numerator");
  assertSafe(denominator, "denominator");
  if (denominator <= 0) throw new RangeError("denominator must be above zero");
  if (!ROUNDING_MODES.includes(mode)) throw new TypeError(`Unknown rounding mode: ${String(mode)}`);
  const product = BigInt(m.amountMinor) * BigInt(numerator);
  const divisor = BigInt(denominator);
  // BigInt division truncates toward zero; the remainder takes the product's sign.
  const quotient = product / divisor;
  const remainder = product % divisor;
  if (remainder === ZERO) return fromBigInt(quotient, m.currency);
  const away = product < ZERO ? quotient - ONE : quotient + ONE;
  const twice = (remainder < ZERO ? -remainder : remainder) * TWO;
  let rounded: bigint;
  switch (mode) {
    case "floor":
      rounded = product < ZERO ? away : quotient;
      break;
    case "ceil":
      rounded = product > ZERO ? away : quotient;
      break;
    case "halfUp":
      rounded = twice >= divisor ? away : quotient;
      break;
    case "halfEven":
      rounded = twice > divisor || (twice === divisor && quotient % TWO !== ZERO) ? away : quotient;
      break;
  }
  return fromBigInt(rounded, m.currency);
}

// Splits m by the weights with the largest remainder rule: leftover units go to the largest
// remainders first, and to the earlier index on a tie, so the parts always add up to m.
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new RangeError("allocate needs at least one weight");
  for (const weight of weights) {
    assertSafe(weight, "A weight");
    if (weight < 0) throw new RangeError("Weights can't be negative");
  }
  const total = weights.reduce((sum, weight) => sum + BigInt(weight), ZERO);
  if (total === ZERO) throw new RangeError("The weights must add up to more than zero");
  // Split the size, then give the parts the amount's sign, so a refund splits like a charge.
  const sign = m.amountMinor < 0 ? -ONE : ONE;
  const size = BigInt(m.amountMinor) * sign;
  const shares = weights.map((weight, index) => ({
    index,
    base: (size * BigInt(weight)) / total,
    remainder: (size * BigInt(weight)) % total,
  }));
  let leftover = size - shares.reduce((sum, share) => sum + share.base, ZERO);
  const order = [...shares].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const share of order) {
    if (leftover === ZERO) break;
    share.base += ONE;
    leftover -= ONE;
  }
  return shares.map((share) => fromBigInt(share.base * sign, m.currency));
}

// The amount as an exact decimal string ("-12.05"), so formatting never goes through a float.
function decimalOf(m: Money): string {
  const digits = CURRENCIES[m.currency].minorDigits;
  const size = String(Math.abs(m.amountMinor)).padStart(digits + 1, "0");
  const whole = size.slice(0, size.length - digits);
  const fraction = size.slice(size.length - digits);
  return `${m.amountMinor < 0 ? "-" : ""}${whole}${digits > 0 ? `.${fraction}` : ""}`;
}

// The caller passes the locale; Intl formats the exact decimal string.
export function formatMoney(m: Money, locale: string): string {
  const digits = CURRENCIES[m.currency].minorDigits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency.toUpperCase(),
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(decimalOf(m) as `${number}`);
}

// The same shape on the wire: { amountMinor: integer, currency: "usd" }. Bad money in input fails
// as validation_failed, not as a thrown programming error.
export const moneySchema = z
  .strictObject({
    amountMinor: z.int(),
    currency: z.enum(Object.keys(CURRENCIES) as [Currency, ...Currency[]]),
  })
  .transform(({ amountMinor, currency }) => money(amountMinor, currency));
