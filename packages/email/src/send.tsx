import type { ReactElement } from "react";
import { Resend } from "resend";
import { emailEnv } from "./env";
import { OTPTemplate } from "./templates/otp-template";
import { ResetPasswordTemplate } from "./templates/reset-password-template";

// The client is built per call from the validated env (spec 0010). Without a key, which
// emailEnv() allows only outside production, the email is skipped and null is returned (AC-7).
async function send(email: string, subject: string, label: string, react: ReactElement) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = emailEnv();
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY is not set, so the ${label} email was not sent.`);
    return null;
  }

  try {
    console.log(`Attempting to send ${label} email to ${email}...`);

    const { data, error } = await new Resend(RESEND_API_KEY).emails.send({
      from: RESEND_FROM_EMAIL,
      to: email,
      subject,
      react,
    });

    if (error) {
      console.error("Resend API Error:", error);
      throw error;
    }

    console.log(`${label} email sent successfully to ${email}. ID:`, data?.id);
    return data;
  } catch (error) {
    console.error(`Failed to send ${label} email:`, error);
    if (error instanceof Error) {
      console.error("Error Message:", error.message);
      console.error("Error Stack:", error.stack);
    }
    throw error;
  }
}

export async function sendVerificationEmail(email: string, otp: string) {
  return send(email, "Your Verification Code", "OTP", <OTPTemplate otp={otp} />);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  return send(email, "Reset your password", "Reset Password", <ResetPasswordTemplate url={url} />);
}
