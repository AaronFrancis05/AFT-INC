import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendVerificationEmail, log } = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@aft/email", () => ({ sendVerificationEmail }));
// The package logger (spec 0011) is replaced, so its lines can be read back.
vi.mock("./log", () => ({ log }));

import { sendVerificationOTP } from "./auth-otp";

const EMAIL = "ada@example.com";
const OTP = "493817";
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

function spyOnConsole() {
  return LEVELS.map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
}

// Every console and logger argument holding the text, objects included.
function consoleArgsContaining(spies: ReturnType<typeof spyOnConsole>, text: string) {
  const loggerCalls = Object.values(log).flatMap((level) => level.mock.calls.flat());
  return [...spies.flatMap((spy) => spy.mock.calls.flat()), ...loggerCalls].filter((arg) =>
    (typeof arg === "string" ? arg : inspect(arg, { depth: 5 })).includes(text),
  );
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
    expect(log.error).toHaveBeenCalledWith({ err: expect.any(Error) }, "verification email failed");
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

      expect(log.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        "verification email failed",
      );
      expect(consoleArgsContaining(spies, OTP)).toEqual([]);
    },
  );
});
