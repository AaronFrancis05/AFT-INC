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
    render(<SignIn socialProviders={["google", "github"]} />);

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Please enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Password is required")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
    expect(signInSocial).not.toHaveBeenCalled();
  });

  it("A11: shows no social buttons and no divider when no provider is configured", () => {
    const { container } = render(<SignIn socialProviders={[]} />);

    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /github/i })).not.toBeInTheDocument();
    expect(container.querySelector("hr")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("A11: shows a single full width button when one provider is configured", () => {
    const { container } = render(<SignIn socialProviders={["github"]} />);

    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    const github = screen.getByRole("button", { name: "Github" });
    expect(github).toHaveClass("w-full");
    expect(github.parentElement).toHaveClass("grid-cols-1");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("A11: shows both buttons side by side and signs in with the chosen provider", async () => {
    const user = userEvent.setup();
    render(<SignIn socialProviders={["google", "github"]} />);

    const google = screen.getByRole("button", { name: "Google" });
    expect(google.parentElement).toHaveClass("grid-cols-2");
    await user.click(google);

    expect(signInSocial).toHaveBeenCalledWith(
      { provider: "google", callbackURL: "/dashboard" },
      expect.any(Object),
    );
  });
});
