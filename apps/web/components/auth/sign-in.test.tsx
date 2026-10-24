import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = { onSuccess?: () => unknown; onError?: (ctx: { error: { message: string } }) => void };

const { signInEmail, signInSocial, push, toast } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signInSocial: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@aft/auth/client", () => ({
  authClient: { signIn: { email: signInEmail, social: signInSocial } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("sonner", () => ({ toast }));

import { SignIn } from "./sign-in";

async function fillAndSubmit() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("you@example.com"), "ada@example.com");
  await user.type(screen.getByPlaceholderText("••••••••"), "Analytical1");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

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

  it("signs in by email and goes to the dashboard (AC-8)", async () => {
    signInEmail.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
    render(<SignIn socialProviders={[]} />);

    await fillAndSubmit();

    expect(signInEmail).toHaveBeenCalledWith(
      { email: "ada@example.com", password: "Analytical1" },
      expect.any(Object),
    );
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("stays on the form and shows the error when sign in is rejected (AC-8)", async () => {
    signInEmail.mockImplementation(async (_body: unknown, cb: Callbacks) =>
      cb.onError?.({ error: { message: "Invalid email or password" } }),
    );
    render(<SignIn socialProviders={["google"]} />);

    await fillAndSubmit();

    expect(toast.error).toHaveBeenCalledWith("Invalid email or password");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Google" })).toBeEnabled();
  });

  it("A11: disables the social buttons while an email sign in is in flight", async () => {
    signInEmail.mockImplementation(() => new Promise(() => {}));
    render(<SignIn socialProviders={["google", "github"]} />);

    await fillAndSubmit();

    expect(await screen.findByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Github" })).toBeDisabled();
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
