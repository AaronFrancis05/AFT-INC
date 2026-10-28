import "server-only";

// Decides which social sign in providers are configured (edge case A11).
// lib/auth.ts registers exactly these, and the sign in and sign up pages show
// exactly these buttons, so the two can never disagree. Spec 0002.
// The values come from authEnv() (spec 0010), which already refuses a half set pair (A12).

export type SocialProvider = "google" | "github";

type ProviderEnv = Partial<
  Record<
    "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET",
    string | undefined
  >
>;

type ProviderCredentials = { clientId: string; clientSecret: string };

const PROVIDERS = [
  { id: "google", idVar: "GOOGLE_CLIENT_ID", secretVar: "GOOGLE_CLIENT_SECRET" },
  { id: "github", idVar: "GITHUB_CLIENT_ID", secretVar: "GITHUB_CLIENT_SECRET" },
] as const;

export type ResolvedSocialProviders = {
  // The Better Auth socialProviders config; an unconfigured provider has no key.
  config: Partial<Record<SocialProvider, ProviderCredentials>>;
  // Enabled providers in a fixed order (Google, then GitHub).
  enabled: SocialProvider[];
};

export function resolveSocialProviders(env: ProviderEnv): ResolvedSocialProviders {
  const resolved: ResolvedSocialProviders = { config: {}, enabled: [] };

  for (const { id, idVar, secretVar } of PROVIDERS) {
    const clientId = env[idVar];
    const clientSecret = env[secretVar];

    if (clientId && clientSecret) {
      resolved.config[id] = { clientId, clientSecret };
      resolved.enabled.push(id);
    }
  }

  return resolved;
}
