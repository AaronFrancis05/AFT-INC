import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  EnvError,
  aftEnv,
  checkEnvOrExit,
  composeEnv,
  coreEnv,
  createEnvAccessor,
  defineEnv,
  liveKeyInProduction,
  parseEnv,
  toEnvSchemaJson,
} from "./index";

const SENTINEL = "zz-sentinel-value-zz";

const fixture = defineEnv({
  ALWAYS_URL: {
    description: "a required URL",
    secret: true,
    required: "always",
    schema: z.string().startsWith("https://"),
    message: "must start with https://",
  },
  PROD_ONLY: {
    description: "required in production",
    secret: true,
    required: "production",
    schema: z.string().min(1),
    message: "must not be empty",
  },
  WITH_DEFAULT: {
    description: "has a default outside production",
    secret: false,
    required: "production",
    schema: z.string().min(1),
    message: "must not be empty",
    default: { nonProduction: "fallback" },
  },
  PAIR_ID: {
    description: "pair, first half",
    secret: false,
    required: "optional",
    schema: z.string().min(1),
    message: "must not be empty",
    pair: "PAIR_SECRET",
  },
  PAIR_SECRET: {
    description: "pair, second half",
    secret: true,
    required: "optional",
    schema: z.string().min(1),
    message: "must not be empty",
    pair: "PAIR_ID",
  },
});

const app = composeEnv("fixture", [coreEnv, fixture]);

const valid = { AFT_ENV: "development", ALWAYS_URL: "https://example.test" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseEnv", () => {
  it("covers AC-1: a valid source returns typed values, defaults applied outside production", () => {
    const result = parseEnv(app, valid, "development");
    expect(result).toEqual({
      ok: true,
      env: {
        AFT_ENV: "development",
        ALWAYS_URL: "https://example.test",
        PROD_ONLY: undefined,
        WITH_DEFAULT: "fallback",
        PAIR_ID: undefined,
        PAIR_SECRET: undefined,
      },
    });
  });

  it("covers AC-1: lists every problem at once, sorted by name", () => {
    const result = parseEnv(
      app,
      { AFT_ENV: "production", PAIR_SECRET: "s", ALWAYS_URL: "http://plain" },
      "production",
    );
    expect(result).toEqual({
      ok: false,
      problems: [
        { name: "ALWAYS_URL", rule: "must start with https://" },
        { name: "PAIR_ID", rule: "set PAIR_ID and PAIR_SECRET together, or neither" },
        { name: "PROD_ONLY", rule: "required when AFT_ENV is production" },
        { name: "WITH_DEFAULT", rule: "required when AFT_ENV is production" },
      ],
    });
  });

  it("I46: covers AC-3, AFT_ENV unset or unknown is refused with no default", () => {
    for (const AFT_ENV of [undefined, "staging", "prod"]) {
      const result = parseEnv(app, { ...valid, AFT_ENV }, "development");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.problems).toContainEqual({
        name: "AFT_ENV",
        rule: "required, one of development, test, production",
      });
    }
  });

  it("I47: covers AC-3, AFT_ENV=production under next dev is refused", () => {
    const result = parseEnv(app, { ...valid, AFT_ENV: "production" }, "development");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([
      {
        name: "AFT_ENV",
        rule: "production needs NODE_ENV=production (use next start, not next dev)",
      },
    ]);
  });

  it("covers AC-3: an invalid AFT_ENV skips the production requirements", () => {
    const result = parseEnv(app, { AFT_ENV: "nope", ALWAYS_URL: "https://x.test" }, "production");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map((p) => p.name)).toEqual(["AFT_ENV"]);
  });

  it("I48: covers AC-4, empty and whitespace only count as unset, other values are trimmed", () => {
    for (const blank of ["", " ", "\t  "]) {
      const result = parseEnv(app, { ...valid, ALWAYS_URL: blank }, "development");
      expect(result.ok ? [] : result.problems).toEqual([{ name: "ALWAYS_URL", rule: "required" }]);
    }
    const trimmed = parseEnv(app, { AFT_ENV: " test ", ALWAYS_URL: "  https://x.test " }, "test");
    expect(trimmed.ok && trimmed.env.ALWAYS_URL).toBe("https://x.test");
    expect(trimmed.ok && trimmed.env.AFT_ENV).toBe("test");
  });

  it("I48: a blank pair half is unset, so a pair of blanks is off, not half set", () => {
    const result = parseEnv(app, { ...valid, PAIR_ID: " ", PAIR_SECRET: "" }, "development");
    expect(result.ok).toBe(true);
  });

  it("I49: covers AC-2, no refusal ever echoes the value", () => {
    const sources = [
      { AFT_ENV: SENTINEL },
      { ...valid, ALWAYS_URL: SENTINEL },
      { ...valid, PAIR_ID: SENTINEL },
      { ...valid, PAIR_SECRET: SENTINEL },
    ];
    for (const source of sources) {
      const result = parseEnv(app, source, "development");
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain(SENTINEL);
      if (!result.ok) expect(new EnvError(result.problems).message).not.toContain(SENTINEL);
    }
  });
});

describe("composeEnv", () => {
  it("covers AC-9: two slices declaring the same name fail at once", () => {
    expect(() => composeEnv("clash", [coreEnv, coreEnv])).toThrow(
      "[env] AFT_ENV is declared in more than one slice",
    );
  });
});

describe("checkEnvOrExit", () => {
  it("covers AC-1, AC-2: prints every problem by name to stderr and exits 1", () => {
    vi.stubEnv("AFT_ENV", "test");
    vi.stubEnv("ALWAYS_URL", SENTINEL);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    checkEnvOrExit(app);
    expect(exit).toHaveBeenCalledWith(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toBe(
      "[env] The fixture app can't start. Fix these variables " +
        "(.env locally, Parameter Store /aft/prod/fixture/ in production):\n" +
        "  - ALWAYS_URL: must start with https://",
    );
    expect(message).not.toContain(SENTINEL);
  });

  it("covers AC-1: a valid environment neither prints nor exits", () => {
    vi.stubEnv("AFT_ENV", "test");
    vi.stubEnv("ALWAYS_URL", "https://x.test");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    checkEnvOrExit(app);
    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe("createEnvAccessor", () => {
  const accessor = createEnvAccessor(fixture);

  it("I51: covers AC-9, returns only the slice's values when AFT_ENV and the slice are valid", () => {
    vi.stubEnv("ALWAYS_URL", "https://x.test");
    expect(accessor()).toEqual({
      ALWAYS_URL: "https://x.test",
      PROD_ONLY: undefined,
      WITH_DEFAULT: "fallback",
      PAIR_ID: undefined,
      PAIR_SECRET: undefined,
    });
  });

  it("I51: covers AC-9, validates AFT_ENV too, and throws a names only EnvError", () => {
    vi.stubEnv("AFT_ENV", "");
    vi.stubEnv("ALWAYS_URL", SENTINEL);
    expect(() => accessor()).toThrow(EnvError);
    try {
      accessor();
    } catch (error) {
      expect((error as EnvError).problems.map((p) => p.name)).toEqual(["AFT_ENV", "ALWAYS_URL"]);
      expect((error as EnvError).message).not.toContain(SENTINEL);
    }
  });

  it("I51: covers AC-9, parses on every call, so a changed value is seen at once (no cache)", () => {
    vi.stubEnv("ALWAYS_URL", "https://first.test");
    expect(accessor().ALWAYS_URL).toBe("https://first.test");
    vi.stubEnv("ALWAYS_URL", "https://second.test");
    expect(accessor().ALWAYS_URL).toBe("https://second.test");
  });

  it("aftEnv returns the tier, and the test setup sets it to test", () => {
    expect(aftEnv()).toBe("test");
    vi.stubEnv("AFT_ENV", "staging");
    expect(() => aftEnv()).toThrow(EnvError);
  });
});

describe("toEnvSchemaJson", () => {
  it("covers AC-11: names and metadata sorted by name, pair on both halves, no defaults", () => {
    expect(toEnvSchemaJson(app)).toEqual({
      app: "fixture",
      variables: [
        expect.objectContaining({ name: "AFT_ENV", secret: false, required: "always" }),
        expect.objectContaining({ name: "ALWAYS_URL", secret: true, required: "always" }),
        expect.objectContaining({ name: "PAIR_ID", pair: "PAIR_SECRET" }),
        expect.objectContaining({ name: "PAIR_SECRET", pair: "PAIR_ID" }),
        expect.objectContaining({ name: "PROD_ONLY", required: "production" }),
        {
          name: "WITH_DEFAULT",
          description: expect.any(String),
          secret: false,
          required: "production",
        },
      ],
    });
  });
});

describe("liveKeyInProduction (B13)", () => {
  const payments = composeEnv("payments-fixture", [
    coreEnv,
    defineEnv({
      PAYMENT_KEY: {
        description: "a payment provider key",
        secret: true,
        required: "always",
        schema: z.string().min(1),
        message: "must not be empty",
        checks: [liveKeyInProduction(["sk_test_", "rk_test_", "pk_test_"])],
      },
    }),
  ]);

  function problemsFor(PAYMENT_KEY: string, tier: "development" | "production") {
    const result = parseEnv(payments, { AFT_ENV: tier, PAYMENT_KEY }, tier);
    return result.ok ? [] : result.problems;
  }

  it.each(["sk_test_123", "rk_test_123", "pk_test_123"])(
    "B13: covers AC-8, refuses the test mode key %s in production",
    (key) => {
      expect(problemsFor(key, "production")).toEqual([
        { name: "PAYMENT_KEY", rule: "test mode key, not allowed in production" },
      ]);
    },
  );

  it.each(["sk_test_123", "rk_test_123", "pk_test_123"])(
    "B13: covers AC-8, allows the test mode key %s outside production",
    (key) => {
      expect(problemsFor(key, "development")).toEqual([]);
    },
  );

  it("B13: covers AC-8, allows a live key in production", () => {
    expect(problemsFor("sk_live_123", "production")).toEqual([]);
  });
});
