import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth", () => ({ SignIn: () => null }));

import SignInPage, { dynamic } from "./page";

describe("SignInPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A11: renders per request so runtime keys are read without a rebuild", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("A11: passes the providers configured in the environment", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GITHUB_CLIENT_ID", "github-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");

    expect(SignInPage().props.socialProviders).toEqual(["github"]);
  });
});
