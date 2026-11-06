import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@aft/db";
import { emailOTP } from "better-auth/plugins";
import { sendResetPasswordEmail } from "@aft/email";
import { authEnv } from "../env";
import { sendVerificationOTP } from "./auth-otp";
import { log } from "./log";
import { resolveSocialProviders } from "./auth-providers";

// Validated, trimmed values (spec 0010); Better Auth gets them explicitly instead of
// reading the raw variables itself.
const env = authEnv();
const socialProviders = resolveSocialProviders(env);

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
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
        log.error({ err: error }, "reset password email failed");
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
