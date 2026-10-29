import { parseEnv } from "@aft/config/env";
import { describe, expect, it } from "vitest";
import { authEnvSlice } from "./env";

const SECRET = "test-only-secret-0123456789abcdefghij";
const base = { BETTER_AUTH_SECRET: SECRET, BETTER_AUTH_URL: "https://aft.remwa.tech" };

function problems(source: Record<string, string>, tier = "development") {
  const result = parseEnv(
    authEnvSlice,
    { AFT_ENV: tier, ...base, ...source },
    tier === "production" ? "production" : "development",
  );
  return result.ok ? [] : result.problems;
}

describe("auth env slice (spec 0010, AC-5)", () => {
  it("accepts a full valid set in production", () => {
    expect(
      problems({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }, "production"),
    ).toEqual([]);
  });

  it("requires the secret and the URL in every tier", () => {
    expect(problems({ BETTER_AUTH_SECRET: "", BETTER_AUTH_URL: " " })).toEqual([
      { name: "BETTER_AUTH_SECRET", rule: "required" },
      { name: "BETTER_AUTH_URL", rule: "required" },
    ]);
  });

  it("refuses a secret under 32 characters", () => {
    expect(problems({ BETTER_AUTH_SECRET: "x".repeat(31) })).toEqual([
      { name: "BETTER_AUTH_SECRET", rule: "must be at least 32 characters" },
    ]);
  });

  it("refuses a URL that is not absolute http or https", () => {
    for (const BETTER_AUTH_URL of ["aft.remwa.tech", "ftp://aft.remwa.tech", "/api/auth"]) {
      expect(problems({ BETTER_AUTH_URL })).toEqual([
        { name: "BETTER_AUTH_URL", rule: "must be an absolute http:// or https:// URL" },
      ]);
    }
  });

  it("allows http and localhost outside production", () => {
    expect(problems({ BETTER_AUTH_URL: "http://localhost:3000" })).toEqual([]);
    expect(problems({ BETTER_AUTH_URL: "http://127.0.0.1:3000" }, "test")).toEqual([]);
  });

  it("refuses http in production", () => {
    expect(problems({ BETTER_AUTH_URL: "http://aft.remwa.tech" }, "production")).toEqual([
      { name: "BETTER_AUTH_URL", rule: "must use https:// in production" },
    ]);
  });

  it("refuses localhost and 127.0.0.1 in production", () => {
    for (const BETTER_AUTH_URL of ["https://localhost:3000", "https://127.0.0.1"]) {
      expect(problems({ BETTER_AUTH_URL }, "production")).toEqual([
        { name: "BETTER_AUTH_URL", rule: "must not point at localhost in production" },
      ]);
    }
  });

  it("A12: covers AC-6, a half pair is refused in every tier under the missing half", () => {
    for (const tier of ["development", "test", "production"]) {
      expect(problems({ GOOGLE_CLIENT_ID: "id" }, tier)).toEqual([
        {
          name: "GOOGLE_CLIENT_SECRET",
          rule: "set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET together, or neither",
        },
      ]);
      expect(problems({ GITHUB_CLIENT_SECRET: "secret" }, tier)).toEqual([
        {
          name: "GITHUB_CLIENT_ID",
          rule: "set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET together, or neither",
        },
      ]);
    }
  });

  it("A11: covers AC-6, both halves unset leaves the provider off, with no problem", () => {
    expect(problems({}, "production")).toEqual([]);
  });
});
