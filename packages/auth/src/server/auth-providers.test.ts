import { describe, expect, it, vi } from "vitest";
import { resolveSocialProviders, warnMissingSocialProviders } from "./auth-providers";

const ALL = {
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GITHUB_CLIENT_ID: "github-id",
  GITHUB_CLIENT_SECRET: "github-secret",
};

describe("resolveSocialProviders", () => {
  it("A11: registers both providers when all four values are set", () => {
    const { config, enabled, missing } = resolveSocialProviders(ALL);

    expect(enabled).toEqual(["google", "github"]);
    expect(config).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      github: { clientId: "github-id", clientSecret: "github-secret" },
    });
    expect(missing).toEqual([]);
  });

  it("A11: registers nothing and reports nothing when every value is empty", () => {
    const { config, enabled, missing } = resolveSocialProviders({});

    expect(Object.keys(config)).toEqual([]);
    expect(enabled).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("A11: keeps a half configured provider off and names the missing variable", () => {
    const { config, enabled, missing } = resolveSocialProviders({
      ...ALL,
      GITHUB_CLIENT_SECRET: undefined,
    });

    expect(Object.keys(config)).toEqual(["google"]);
    expect(enabled).toEqual(["google"]);
    expect(missing).toEqual(["GITHUB_CLIENT_SECRET"]);
  });

  it("A11: names the ID when only the secret is set", () => {
    const { missing } = resolveSocialProviders({ GOOGLE_CLIENT_SECRET: "google-secret" });

    expect(missing).toEqual(["GOOGLE_CLIENT_ID"]);
  });

  it("A11: treats whitespace as empty and passes trimmed values to Better Auth", () => {
    const { config, enabled, missing } = resolveSocialProviders({
      GOOGLE_CLIENT_ID: " google-id\n",
      GOOGLE_CLIENT_SECRET: "google-secret\r\n",
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "   ",
    });

    expect(config).toEqual({ google: { clientId: "google-id", clientSecret: "google-secret" } });
    expect(enabled).toEqual(["google"]);
    expect(missing).toEqual(["GITHUB_CLIENT_SECRET"]);
  });

  it("A11: lists providers in a fixed order", () => {
    const { enabled } = resolveSocialProviders({
      GITHUB_CLIENT_ID: "github-id",
      GITHUB_CLIENT_SECRET: "github-secret",
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });

    expect(enabled).toEqual(["google", "github"]);
  });
});

describe("warnMissingSocialProviders", () => {
  it("A11: warns once per missing variable with the exact text and no values", () => {
    const log = vi.fn();
    warnMissingSocialProviders(["GITHUB_CLIENT_SECRET"], log);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[auth] GITHUB_CLIENT_SECRET is not set, so the github provider is off. " +
        "Set both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to enable it.",
    );
  });

  it("A11: stays silent when nothing is missing", () => {
    const log = vi.fn();
    warnMissingSocialProviders([], log);

    expect(log).not.toHaveBeenCalled();
  });

  it("A11: never includes a configured value in the warning", () => {
    const log = vi.fn();
    const { missing } = resolveSocialProviders({ GITHUB_CLIENT_ID: "github-id-value" });
    warnMissingSocialProviders(missing, log);

    expect(log.mock.calls[0][0]).not.toContain("github-id-value");
  });
});
