import { describe, expect, it } from "vitest";
import { addMs, formatInstant, instantSchema, isoUtc, timeZoneSchema } from "./time";
import { parseInput } from "./validate";

const instant = new Date("2026-10-29T21:30:00.000Z");

describe("time helpers (AC-15, X10)", () => {
  it("writes API timestamps as ISO 8601 UTC ending in Z", () => {
    expect(isoUtc(instant)).toBe("2026-10-29T21:30:00.000Z");
  });

  it("adds integer milliseconds only", () => {
    expect(isoUtc(addMs(instant, 90_000))).toBe("2026-10-29T21:31:30.000Z");
    expect(() => addMs(instant, 1.5)).toThrow(RangeError);
  });

  it("instantSchema needs an offset and returns the same instant as a Date", () => {
    expect(parseInput(instantSchema, "2026-10-29T21:30:00Z")).toEqual(instant);
    expect(parseInput(instantSchema, "2026-10-30T00:30:00+03:00")).toEqual(instant);
    for (const bad of ["2026-10-29T21:30:00", "2026-10-29", "yesterday", 1_700_000_000_000])
      expect(() => parseInput(instantSchema, bad), String(bad)).toThrow(
        expect.objectContaining({ code: "validation_failed" }),
      );
  });

  it("timeZoneSchema accepts names Intl knows and refuses the rest", () => {
    for (const zone of ["UTC", "Africa/Kampala", "America/New_York"])
      expect(parseInput(timeZoneSchema, zone)).toBe(zone);
    for (const bad of ["Mars/Olympus", "", "x".repeat(65)])
      expect(() => parseInput(timeZoneSchema, bad), bad).toThrow(
        expect.objectContaining({ code: "validation_failed" }),
      );
  });

  it("formatInstant renders in the caller's zone and locale", () => {
    const options = { locale: "en-US", dateStyle: "medium", timeStyle: "short" } as const;
    expect(formatInstant(instant, { ...options, timeZone: "UTC" })).toBe("Oct 29, 2026, 9:30 PM");
    // Kampala is UTC+3, so the date moves to the next day.
    expect(formatInstant(instant, { ...options, timeZone: "Africa/Kampala" })).toBe(
      "Oct 30, 2026, 12:30 AM",
    );
  });
});
