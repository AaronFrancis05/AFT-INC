import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@aft/db";
import { emailOTP } from "better-auth/plugins";
import { sendResetPasswordEmail } from "@aft/email";
import { sendVerificationOTP } from "./auth-otp";
import { resolveSocialProviders, warnMissingSocialProviders } from "./auth-providers";

const socialProviders = resolveSocialProviders();
warnMissingSocialProviders(socialProviders.missing);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    async sendResetPassword(data) {
      try {
        await sendResetPasswordEmail(data.user.email, data.url);
      } catch (error) {
        console.error("Error sending reset password email:", error);
      }
    },
  },
  socialProviders: socialProviders.config,
  plugins: [
    emailOTP({
      sendVerificationOTP,
    }),
  ],
});
