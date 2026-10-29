// Instants in UTC, rendered with Intl (spec 0011, AC-15, X10). Handlers use ctx.now, never
// new Date(); where a user's time zone comes from is feature 28's decision, so callers pass it.
import { z } from "zod";

// API timestamps: ISO 8601 UTC ending in Z.
export function isoUtc(date: Date): string {
  return date.toISOString();
}

// Durations are milliseconds.
export function addMs(date: Date, ms: number): Date {
  if (!Number.isSafeInteger(ms)) throw new RangeError("ms must be a safe integer");
  return new Date(date.getTime() + ms);
}

// ISO 8601 with a required offset (Z or ±hh:mm); a local time without one is refused.
export const instantSchema = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// An IANA name Intl knows (for example "Africa/Kampala" or "UTC").
export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isTimeZone, { message: "Is not a known time zone" });

export type FormatInstantOptions = {
  locale: string;
  timeZone: string;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
};

export function formatInstant(
  date: Date,
  { locale, timeZone, dateStyle, timeStyle }: FormatInstantOptions,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...(dateStyle ? { dateStyle } : {}),
    ...(timeStyle ? { timeStyle } : {}),
  }).format(date);
}
