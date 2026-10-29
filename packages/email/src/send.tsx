import type { ReactElement } from "react";
import { Resend } from "resend";
import { emailEnv } from "./env";
import { log } from "./log";
import { OTPTemplate } from "./templates/otp-template";
import { ResetPasswordTemplate } from "./templates/reset-password-template";

// The client is built per call from the validated env (spec 0010). Without a key, which
// emailEnv() allows only outside production, the email is skipped and null is returned (AC-7).
// A failure is thrown, not logged: the caller decides, and logs it once. Logs never hold the
// recipient (spec 0011, AC-19).
async function send(email: string, subject: string, label: string, react: ReactElement) {
  const { RESEND_API_KEY, RESEND_FROM_EMAIL } = emailEnv();
  if (!RESEND_API_KEY) {
    log.warn({ label }, "RESEND_API_KEY is not set, so the email was not sent");
    return null;
  }

  const { data, error } = await new Resend(RESEND_API_KEY).emails.send({
    from: RESEND_FROM_EMAIL,
    to: email,
    subject,
    react,
  });
  if (error) throw error;

  log.info({ label, emailId: data?.id }, "email sent");
  return data;
}

export async function sendVerificationEmail(email: string, otp: string) {
  return send(email, "Your Verification Code", "OTP", <OTPTemplate otp={otp} />);
}

export async function sendResetPasswordEmail(email: string, url: string) {
  return send(email, "Reset your password", "Reset Password", <ResetPasswordTemplate url={url} />);
}
