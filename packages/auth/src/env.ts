// The auth environment slice (spec 0010). Rules only, never values, and no server-only
// import, so the env-schema exporter can load it in plain Node.
import { createEnvAccessor, defineEnv } from "@aft/config/env";
import type { Check } from "@aft/config/env";
import { z } from "zod";

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const httpsInProduction: Check = (value, tier) =>
  tier === "production" && new URL(value).protocol !== "https:"
    ? "must use https:// in production"
    : null;

const notLocalhostInProduction: Check = (value, tier) =>
  tier === "production" && ["localhost", "127.0.0.1"].includes(new URL(value).hostname)
    ? "must not point at localhost in production"
    : null;

const present = z.string().min(1);

export const authEnvSlice = defineEnv({
  BETTER_AUTH_SECRET: {
    description: "Better Auth signing secret, a random string of at least 32 characters.",
    secret: true,
    required: "always",
    schema: z.string().min(32),
    message: "must be at least 32 characters",
  },
  BETTER_AUTH_URL: {
    description: "The public base URL of the app, used for OAuth callbacks and trusted origins.",
    secret: false,
    required: "always",
    schema: z.string().refine(isHttpUrl),
    message: "must be an absolute http:// or https:// URL",
    checks: [httpsInProduction, notLocalhostInProduction],
  },
  GOOGLE_CLIENT_ID: {
    description: "Google OAuth client ID; Google sign in is on only when its secret is set too.",
    secret: false,
    required: "optional",
    schema: present,
    message: "must not be empty",
    pair: "GOOGLE_CLIENT_SECRET",
  },
  GOOGLE_CLIENT_SECRET: {
    description: "Google OAuth client secret; Google sign in is on only when its ID is set too.",
    secret: true,
    required: "optional",
    schema: present,
    message: "must not be empty",
    pair: "GOOGLE_CLIENT_ID",
  },
  GITHUB_CLIENT_ID: {
    description: "GitHub OAuth client ID; GitHub sign in is on only when its secret is set too.",
    secret: false,
    required: "optional",
    schema: present,
    message: "must not be empty",
    pair: "GITHUB_CLIENT_SECRET",
  },
  GITHUB_CLIENT_SECRET: {
    description: "GitHub OAuth client secret; GitHub sign in is on only when its ID is set too.",
    secret: true,
    required: "optional",
    schema: present,
    message: "must not be empty",
    pair: "GITHUB_CLIENT_ID",
  },
});

export const authEnv = createEnvAccessor(authEnvSlice);
