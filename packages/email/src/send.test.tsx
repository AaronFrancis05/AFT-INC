import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Resend is a boundary (a real client sends mail), so it is a stand in recording its calls.
const { construct, sendEmail } = vi.hoisted(() => ({ construct: vi.fn(), sendEmail: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
    constructor(key: string) {
      construct(key);
    }
  },
}));

import { sendResetPasswordEmail, sendVerificationEmail } from "./send";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendEmail.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("send (spec 0010, AC-7)", () => {
  it("covers AC-7: without a key outside production, skips Resend, warns by name, returns null", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await sendVerificationEmail("ada@example.com", "493817")).toBeNull();
    expect(await sendResetPasswordEmail("ada@example.com", "https://x.test/reset")).toBeNull();

    expect(construct).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[email] RESEND_API_KEY is not set, so the OTP email was not sent.",
    );
  });

  it("covers AC-7: with a key, builds the client per call and sends from the sandbox default", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_value");
    vi.stubEnv("RESEND_FROM_EMAIL", "");

    expect(await sendVerificationEmail("ada@example.com", "493817")).toEqual({ id: "email-1" });

    expect(construct).toHaveBeenCalledWith("re_test_value");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "onboarding@resend.dev",
        to: "ada@example.com",
        subject: "Your Verification Code",
      }),
    );
  });

  it("uses the configured sender when one is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_value");
    vi.stubEnv("RESEND_FROM_EMAIL", "AFT <noreply@aft.remwa.tech>");

    await sendResetPasswordEmail("ada@example.com", "https://x.test/reset");

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "AFT <noreply@aft.remwa.tech>",
        subject: "Reset your password",
      }),
    );
  });

  it("throws when Resend returns an error, as before", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_value");
    sendEmail.mockResolvedValue({ data: null, error: new Error("Resend down") });

    await expect(sendVerificationEmail("ada@example.com", "493817")).rejects.toThrow("Resend down");
  });

  it("in production without a key, fails with a names only env error instead of skipping", async () => {
    vi.stubEnv("AFT_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(sendVerificationEmail("ada@example.com", "493817")).rejects.toThrow(
      "  - RESEND_API_KEY: required when AFT_ENV is production",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
