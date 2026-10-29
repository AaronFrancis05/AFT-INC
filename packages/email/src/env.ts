// The email environment slice (spec 0010). Rules only, never values, and no server-only
// import, so the env-schema exporter can load it in plain Node.
import { createEnvAccessor, defineEnv } from "@aft/config/env";
import type { Check } from "@aft/config/env";
import { z } from "zod";

const ADDRESS = /^(?:[^<>]+<\s*([^\s@<>]+@[^\s@<>]+)\s*>|([^\s@<>]+@[^\s@<>]+))$/;

function domainOf(value: string): string {
  const match = ADDRESS.exec(value);
  const address = match?.[1] ?? match?.[2] ?? "";
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

const noSandboxSenderInProduction: Check = (value, tier) =>
  tier === "production" && domainOf(value) === "resend.dev"
    ? "must not use the resend.dev sandbox sender in production"
    : null;

export const emailEnvSlice = defineEnv({
  RESEND_API_KEY: {
    description:
      "Resend API key. Required in production; elsewhere, without it emails are skipped.",
    secret: true,
    required: "production",
    schema: z.string().startsWith("re_"),
    message: "must start with re_",
  },
  RESEND_FROM_EMAIL: {
    description:
      "Sender address on a domain verified in Resend, as name@domain or Name <name@domain>.",
    secret: false,
    required: "production",
    schema: z.string().regex(ADDRESS),
    message: "must be name@domain or Name <name@domain>",
    checks: [noSandboxSenderInProduction],
    default: { nonProduction: "onboarding@resend.dev" },
  },
});

export const emailEnv = createEnvAccessor(emailEnvSlice);
