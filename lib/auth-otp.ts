import { sendVerificationEmail } from "./email";

// The emailOTP plugin's sender. When the email fails, the OTP is printed only
// under `next dev` so local sign up still works; every other environment
// (next start, CI, tests, AWS) never logs it (edge case A3, spec 0002).
export async function sendVerificationOTP({ email, otp }: { email: string; otp: string }) {
  try {
    await sendVerificationEmail(email, otp);
  } catch (error) {
    console.error("Error in sendVerificationOTP plugin wrapper:", error);
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEV FALLBACK] OTP for ${email}: ${otp}`);
    }
  }
}
