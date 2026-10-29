import { parseEnv } from "@aft/config/env";
import { describe, expect, it } from "vitest";
import { emailEnvSlice } from "./env";

function parse(source: Record<string, string>, tier = "development") {
  return parseEnv(
    emailEnvSlice,
    { AFT_ENV: tier, ...source },
    tier === "production" ? "production" : "development",
  );
}

function problems(source: Record<string, string>, tier = "development") {
  const result = parse(source, tier);
  return result.ok ? [] : result.problems;
}

describe("email env slice (spec 0010, AC-5, AC-7)", () => {
  it("covers AC-7: outside production both are optional and the sender defaults to the sandbox", () => {
    for (const tier of ["development", "test"]) {
      expect(parse({}, tier)).toEqual({
        ok: true,
        env: {
          RESEND_API_KEY: undefined,
          RESEND_FROM_EMAIL: "onboarding@resend.dev",
        },
      });
    }
  });

  it("covers AC-5: production requires both, with no default", () => {
    expect(problems({}, "production")).toEqual([
      { name: "RESEND_API_KEY", rule: "required when AFT_ENV is production" },
      { name: "RESEND_FROM_EMAIL", rule: "required when AFT_ENV is production" },
    ]);
  });

  it("covers AC-5: accepts a live key and a verified sender in production", () => {
    expect(
      problems(
        { RESEND_API_KEY: "re_live_value", RESEND_FROM_EMAIL: "AFT <noreply@aft.remwa.tech>" },
        "production",
      ),
    ).toEqual([]);
  });

  it("covers AC-5: refuses a key that does not start with re_", () => {
    expect(problems({ RESEND_API_KEY: "sk_live_value" })).toEqual([
      { name: "RESEND_API_KEY", rule: "must start with re_" },
    ]);
  });

  it("covers AC-5: accepts name@domain and Name <name@domain>, refuses anything else", () => {
    for (const RESEND_FROM_EMAIL of [
      "noreply@aft.remwa.tech",
      "AFT Inc <noreply@aft.remwa.tech>",
    ]) {
      expect(problems({ RESEND_FROM_EMAIL })).toEqual([]);
    }
    for (const RESEND_FROM_EMAIL of ["noreply", "AFT <noreply>", "a b@c.d", "<x@y.z"]) {
      expect(problems({ RESEND_FROM_EMAIL })).toEqual([
        { name: "RESEND_FROM_EMAIL", rule: "must be name@domain or Name <name@domain>" },
      ]);
    }
  });

  it("covers AC-5: production refuses the resend.dev sandbox sender, other tiers allow it", () => {
    const source = {
      RESEND_API_KEY: "re_live_value",
      RESEND_FROM_EMAIL: "AFT <onboarding@Resend.dev>",
    };
    expect(problems(source, "production")).toEqual([
      {
        name: "RESEND_FROM_EMAIL",
        rule: "must not use the resend.dev sandbox sender in production",
      },
    ]);
    expect(problems(source, "development")).toEqual([]);
  });
});
