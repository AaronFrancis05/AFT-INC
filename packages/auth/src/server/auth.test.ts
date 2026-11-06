import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Captures the options lib/auth.ts hands to Better Auth, so the server wiring
// (spec 0002, AC-2, AC-3, AC-6; spec 0010, AC-6) is checked without a database or network.
const { betterAuth } = vi.hoisted(() => ({
  betterAuth: vi.fn((options: unknown) => ({ options })),
}));

vi.mock("better-auth", () => ({ betterAuth }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn(() => "prisma-adapter") }));
vi.mock("better-auth/plugins", () => ({
  emailOTP: (options: unknown) => ({ id: "email-otp", options }),
}));
vi.mock("@aft/db", () => ({ default: {} }));
const { sendResetPasswordEmail, log } = vi.hoisted(() => ({
  sendResetPasswordEmail: vi.fn(),
  log: { error: vi.fn() },
}));
vi.mock("@aft/email", () => ({ sendResetPasswordEmail, sendVerificationEmail: vi.fn() }));
vi.mock("./log", () => ({ log }));

type AuthOptions = {
  secret: string;
  baseURL: string;
  socialProviders: Record<string, { clientId: string; clientSecret: string }>;
  emailAndPassword: { enabled: boolean; requireEmailVerification: boolean };
  plugins: { id: string; options: { sendVerificationOTP: unknown } }[];
};

const SECRET = "test-only-secret-0123456789abcdefghij";

function setOAuthEnv(
  values: Partial<
    Record<
      "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET",
      string
    >
  >,
) {
  for (const name of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
  ] as const) {
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
  beforeEach(() => {
    betterAuth.mockClear();
    vi.stubEnv("BETTER_AUTH_SECRET", ` ${SECRET} `);
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000\n");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("I48: hands Better Auth the trimmed, validated secret and base URL (0010 AC-4)", async () => {
    setOAuthEnv({});

    const options = await loadAuthOptions();

    expect(options.secret).toBe(SECRET);
    expect(options.baseURL).toBe("http://localhost:3000");
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
  });

  it("A12: a half configured provider fails the module load, naming both variables and no value (0010 AC-6)", async () => {
    setOAuthEnv({ GITHUB_CLIENT_ID: "github-id-value" });

    const load = loadAuthOptions();

    await expect(load).rejects.toThrow(
      "  - GITHUB_CLIENT_SECRET: set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET together, or neither",
    );
    await expect(load).rejects.not.toThrow("github-id-value");
  });

  it("A11: registers no provider when every value is empty or whitespace (AC-2)", async () => {
    setOAuthEnv({ GOOGLE_CLIENT_ID: "   ", GITHUB_CLIENT_SECRET: "\n" });

    const options = await loadAuthOptions();

    expect(options.socialProviders).toEqual({});
  });

  it("A3: wires the gated OTP sender into the emailOTP plugin (AC-6)", async () => {
    setOAuthEnv({});

    const options = await loadAuthOptions();
    const { sendVerificationOTP } = await import("./auth-otp");

    const otpPlugin = options.plugins.find((plugin) => plugin.id === "email-otp");
    expect(otpPlugin?.options.sendVerificationOTP).toBe(sendVerificationOTP);
  });

  it("covers 0011 AC-19: a failed reset email is logged once with no address, and never thrown", async () => {
    const options = await loadAuthOptions();
    const { sendResetPassword } = options.emailAndPassword as unknown as {
      sendResetPassword(data: { user: { email: string }; url: string }): Promise<void>;
    };
    sendResetPasswordEmail.mockRejectedValueOnce(new Error("Resend down"));
    log.error.mockClear();

    await sendResetPassword({ user: { email: "ada@example.com" }, url: "https://x.test/reset" });

    expect(sendResetPasswordEmail).toHaveBeenCalledWith("ada@example.com", "https://x.test/reset");
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "reset password email failed",
    );
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("ada@example.com");
  });

  it("keeps email and password sign in with required email verification (AC-8)", async () => {
    setOAuthEnv({});

    const options = await loadAuthOptions();

    expect(options.emailAndPassword).toMatchObject({
      enabled: true,
      requireEmailVerification: true,
    });
  });
});
