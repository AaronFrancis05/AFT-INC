import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendVerificationEmail } = vi.hoisted(() => ({ sendVerificationEmail: vi.fn() }));

vi.mock("@aft/email", () => ({ sendVerificationEmail }));

import { sendVerificationOTP } from "./auth-otp";

const EMAIL = "ada@example.com";
const OTP = "493817";
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

function spyOnConsole() {
  return LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
}

function consoleArgsContaining(spies: ReturnType<typeof spyOnConsole>, text: string) {
  return spies.flatMap((spy) => spy.mock.calls.flat()).filter((arg) => String(arg).includes(text));
}

describe("sendVerificationOTP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sends the code by email and logs nothing about it on success", async () => {
    const spies = spyOnConsole();
    sendVerificationEmail.mockResolvedValue({ id: "email-1" });

    await sendVerificationOTP({ email: EMAIL, otp: OTP });

    expect(sendVerificationEmail).toHaveBeenCalledWith(EMAIL, OTP);
    expect(consoleArgsContaining(spies, OTP)).toEqual([]);
  });

  it("A3: prints the OTP fallback line under next dev when the email fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const spies = spyOnConsole();
    sendVerificationEmail.mockRejectedValue(new Error("Resend down"));

    await sendVerificationOTP({ email: EMAIL, otp: OTP });

    expect(console.log).toHaveBeenCalledWith(`[DEV FALLBACK] OTP for ${EMAIL}: ${OTP}`);
    expect(console.error).toHaveBeenCalled();
    expect(consoleArgsContaining(spies, OTP)).toHaveLength(1);
  });

  it("A3: covers 0010 AC-7, prints the OTP fallback under next dev when the email is skipped (no key)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const spies = spyOnConsole();
    sendVerificationEmail.mockResolvedValue(null);

    await sendVerificationOTP({ email: EMAIL, otp: OTP });

    expect(console.log).toHaveBeenCalledWith(`[DEV FALLBACK] OTP for ${EMAIL}: ${OTP}`);
    expect(consoleArgsContaining(spies, OTP)).toHaveLength(1);
  });

  it.each(["production", "test"])(
    "A3: covers 0010 AC-7, never logs the OTP under NODE_ENV=%s when the email is skipped",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const spies = spyOnConsole();
      sendVerificationEmail.mockResolvedValue(null);

      await sendVerificationOTP({ email: EMAIL, otp: OTP });

      expect(consoleArgsContaining(spies, OTP)).toEqual([]);
    },
  );

  it.each(["production", "test"])(
    "A3: never logs the OTP at any level under NODE_ENV=%s when the email fails",
    async (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      const spies = spyOnConsole();
      sendVerificationEmail.mockRejectedValue(new Error("Resend down"));

      await sendVerificationOTP({ email: EMAIL, otp: OTP });

      expect(console.error).toHaveBeenCalled();
      expect(consoleArgsContaining(spies, OTP)).toEqual([]);
    },
  );
});
