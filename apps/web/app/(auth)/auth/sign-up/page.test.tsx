import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth", () => ({ SignUp: () => null }));

import SignUpPage, { dynamic } from "./page";

describe("SignUpPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A11: renders per request so runtime keys are read without a rebuild", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("A11: passes the providers configured in the environment", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-0123456789abcdefghij");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");

    expect(SignUpPage().props.socialProviders).toEqual(["google"]);
  });
});
