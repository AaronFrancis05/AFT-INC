// Decides which social sign in providers are configured (edge case A11).
// lib/auth.ts registers exactly these, and the sign in and sign up pages show
// exactly these buttons, so the two can never disagree. Spec 0002.

export type SocialProvider = "google" | "github";

type Env = Record<string, string | undefined>;

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
  // Empty variable names of providers that have only one of their two values.
  missing: string[];
};

export function resolveSocialProviders(env: Env = process.env): ResolvedSocialProviders {
  const resolved: ResolvedSocialProviders = { config: {}, enabled: [], missing: [] };

  for (const { id, idVar, secretVar } of PROVIDERS) {
    const clientId = env[idVar]?.trim() ?? "";
    const clientSecret = env[secretVar]?.trim() ?? "";

    if (clientId && clientSecret) {
      resolved.config[id] = { clientId, clientSecret };
      resolved.enabled.push(id);
    } else if (clientId || clientSecret) {
      resolved.missing.push(clientId ? secretVar : idVar);
    }
  }

  return resolved;
}

export function warnMissingSocialProviders(
  missing: string[],
  log: (message: string) => void = console.warn,
) {
  for (const name of missing) {
    const provider = PROVIDERS.find((p) => p.idVar === name || p.secretVar === name);
    if (!provider) continue;
    log(
      `[auth] ${name} is not set, so the ${provider.id} provider is off. ` +
        `Set both ${provider.idVar} and ${provider.secretVar} to enable it.`,
    );
  }
}
