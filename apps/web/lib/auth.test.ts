import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captures the options lib/auth.ts hands to Better Auth, so the server wiring
// (spec 0002, AC-2, AC-3, AC-6) is checked without a database or network.
const { betterAuth } = vi.hoisted(() => ({
  betterAuth: vi.fn((options: unknown) => ({ options })),
}));

vi.mock("better-auth", () => ({ betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn(() => "prisma-adapter") }));
vi.mock("better-auth/plugins", () => ({
  emailOTP: (options: unknown) => ({ id: "email-otp", options }),
}));
vi.mock("@aft/db", () => ({ default: {} }));
vi.mock("./email", () => ({ sendResetPasswordEmail: vi.fn(), sendVerificationEmail: vi.fn() }));

type AuthOptions = {
  socialProviders: Record<string, { clientId: string; clientSecret: string }>;
  emailAndPassword: { enabled: boolean; requireEmailVerification: boolean };
  plugins: { id: string; options: { sendVerificationOTP: unknown } }[];
};

function setOAuthEnv(values: Partial<Record<
  "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET",
  string
>>) {
  for (const name of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const) {
    vi.stubEnv(name, values[name] ?? "");
  }
}

// Loads lib/auth.ts fresh, so its module load code runs against the stubbed env.
async function loadAuthOptions() {
  vi.resetModules();
  await import("./auth");
  return betterAuth.mock.lastCall![0] as AuthOptions;
}

describe("lib/auth.ts", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    betterAuth.mockClear();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it("A11: registers both providers with trimmed values when all four are set (AC-2)", async () => {
    setOAuthEnv({
      GOOGLE_CLIENT_ID: " google-id\n",
      GOOGLE_CLIENT_SECRET: "google-secret ",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "\tgithub-secret",
    });

    const options = await loadAuthOptions();

    expect(options.socialProviders).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      github: { clientId: "github-id", clientSecret: "github-secret" },
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("A11: leaves a half configured provider out of socialProviders entirely (AC-2)", async () => {
    setOAuthEnv({ GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", GITHUB_CLIENT_ID: "github-id" });

    const options = await loadAuthOptions();

    expect(Object.keys(options.socialProviders)).toEqual(["google"]);
    expect(options.socialProviders).not.toHaveProperty("github");
  });

  it("A11: registers no provider when every value is empty or whitespace, and stays silent (AC-2, AC-3)", async () => {
    setOAuthEnv({ GOOGLE_CLIENT_ID: "   ", GITHUB_CLIENT_SECRET: "\n" });

    const options = await loadAuthOptions();

    expect(options.socialProviders).toEqual({});
    expect(warn).not.toHaveBeenCalled();
  });

  it("A11: warns once at module load with the exact text and no value when a secret is missing (AC-3)", async () => {
    setOAuthEnv({ GITHUB_CLIENT_ID: "github-id-value" });

    await loadAuthOptions();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[auth] GITHUB_CLIENT_SECRET is not set, so the github provider is off. Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.",
    );
    expect(String(warn.mock.calls[0][0])).not.toContain("github-id-value");
  });

  it("A3: wires the gated OTP sender into the emailOTP plugin (AC-6)", async () => {
    setOAuthEnv({});

    const options = await loadAuthOptions();
    const { sendVerificationOTP } = await import("./auth-otp");

    const otpPlugin = options.plugins.find((plugin) => plugin.id === "email-otp");
    expect(otpPlugin?.options.sendVerificationOTP).toBe(sendVerificationOTP);
  });

  it("keeps email and password sign in with required email verification (AC-8)", async () => {
    setOAuthEnv({});

    const options = await loadAuthOptions();

    expect(options.emailAndPassword).toMatchObject({ enabled: true, requireEmailVerification: true });
  });
});
