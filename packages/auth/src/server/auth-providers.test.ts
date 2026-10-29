import { describe, expect, it } from "vitest";
import { resolveSocialProviders } from "./auth-providers";

const ALL = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("resolveSocialProviders", () => {
  it("A11: registers both providers when all four values are set", () => {
    const { config, enabled } = resolveSocialProviders(ALL);
    expect(config).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      github: { clientId: "github-id", clientSecret: "github-secret" },
    });
    expect(enabled).toEqual(["google", "github"]);
  });

  it("A11: registers nothing when no value is set", () => {
    const { config, enabled } = resolveSocialProviders({});
    expect(config).toEqual({});
    expect(enabled).toEqual([]);
  });

  it("A11: registers only the provider whose pair is set", () => {
    const { config, enabled } = resolveSocialProviders({
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
    });
    expect(Object.keys(config)).toEqual(["github"]);
    expect(enabled).toEqual(["github"]);
  });

  it("A12: a half pair never registers (authEnv refuses it before this point)", () => {
    const { enabled } = resolveSocialProviders({ GOOGLE_CLIENT_ID: "google-id" });
    expect(enabled).toEqual([]);
  });

  it("A11: keeps a fixed order, Google then GitHub", () => {
    const { enabled } = resolveSocialProviders({
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });
    expect(enabled).toEqual(["google", "github"]);
  });
});
