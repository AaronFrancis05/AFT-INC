import { sendVerificationEmail } from "@aft/email";
import { log } from "./log";

// The emailOTP plugin's sender. When the email fails, or is skipped because no Resend key
// is set (null, spec 0010 AC-7), the OTP is printed only under `next dev` so local sign up
// still works; every other environment (next start, CI, tests, AWS) never logs it
// (edge case A3, spec 0002).
export async function sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
  try {
    const sent = await sendVerificationEmail(email, otp);
    if (sent === null) printDevFallback(email, otp);
  } catch (error) {
    log.error({ err: error }, "verification email failed");
    printDevFallback(email, otp);
  }
}

function printDevFallback(email: string, otp: string) {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- A3: dev only OTP line; the logger would redact it
    console.log(`[DEV FALLBACK] OTP for ${email}: ${otp}`);
  }
}
