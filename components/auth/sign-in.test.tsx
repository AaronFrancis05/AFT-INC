import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInEmail, signInSocial, push } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmail, social: signInSocial } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { SignIn } from "./sign-in";

describe("SignIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation messages for an empty form and makes no network call", async () => {
    const user = userEvent.setup();
    render(<SignIn />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
    expect(signInSocial).not.toHaveBeenCalled();
  });
});
