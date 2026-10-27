import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = {
  onSuccess?: () => unknown;
  onError?: (ctx: { error: { message: string } }) => void;
};

const { signUpEmail, signInSocial, sendVerificationOtp, push, toast } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInSocial: vi.fn(),
  sendVerificationOtp: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@aft/auth/client", () => ({
  authClient: {
    signUp: { email: signUpEmail },
    signIn: { social: signInSocial },
    emailOtp: { sendVerificationOtp },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("sonner", () => ({ toast }));

import { SignUp } from "./sign-up";

const EMAIL = "ada@example.com";

async function fillAndSubmit() {
  const user = userEvent.setup();
  const [password, confirmPassword] = screen.getAllByPlaceholderText("••••••••");
  await user.type(screen.getByPlaceholderText("John Doe"), "Ada Lovelace");
  await user.type(screen.getByPlaceholderText("you@example.com"), EMAIL);
  await user.type(password, "Analytical1");
  await user.type(confirmPassword, "Analytical1");
  await user.click(screen.getByRole("button", { name: "Continue" }));
}

describe("SignUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUpEmail.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("shows validation messages for an empty form and makes no network call", async () => {
    const user = userEvent.setup();
    render(<SignUp socialProviders={["google", "github"]} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("creates the account, sends the code, and goes to verify email", async () => {
    sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) =>
      cb.onSuccess?.(),
    );
    render(<SignUp socialProviders={["google", "github"]} />);

    await fillAndSubmit();

    expect(signUpEmail).toHaveBeenCalledWith(
      { email: EMAIL, password: "Analytical1", name: "Ada Lovelace", callbackURL: "/dashboard" },
      expect.any(Object),
    );
    expect(sendVerificationOtp).toHaveBeenCalledWith(
      { email: EMAIL, type: "email-verification" },
      expect.any(Object),
    );
    expect(sessionStorage.getItem("verify_email")).toBe(EMAIL);
    expect(push).toHaveBeenCalledWith("/auth/verify-email");
  });

  it("still goes to verify email when the code fails to send, so you can resend", async () => {
    sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) =>
      cb.onError?.({ error: { message: "Email provider down" } }),
    );
    render(<SignUp socialProviders={["google", "github"]} />);

    await fillAndSubmit();

    expect(toast.error).toHaveBeenCalledWith(
      "Account created but failed to send verification email. Please try resending.",
    );
    expect(sessionStorage.getItem("verify_email")).toBe(EMAIL);
    expect(push).toHaveBeenCalledWith("/auth/verify-email");
  });

  it("stays on the form when sign up is rejected, without logging the request context", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    signUpEmail.mockImplementation(async (_body: unknown, cb: Callbacks) =>
      cb.onError?.({ error: { message: "User already exists" } }),
    );
    render(<SignUp socialProviders={["google", "github"]} />);

    await fillAndSubmit();

    expect(toast.error).toHaveBeenCalledWith("User already exists");
    expect(sendVerificationOtp).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("A11: shows no social buttons and no divider when no provider is configured", () => {
    const { container } = render(<SignUp socialProviders={[]} />);

    expect(screen.queryByRole("button", { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /github/i })).not.toBeInTheDocument();
    expect(container.querySelector("hr")).toBeNull();
  });

  it("A11: shows a single full width button when one provider is configured", () => {
    render(<SignUp socialProviders={["google"]} />);

    const google = screen.getByRole("button", { name: "Google" });
    expect(google).toHaveClass("w-full");
    expect(google.parentElement).toHaveClass("grid-cols-1");
    expect(screen.queryByRole("button", { name: /github/i })).not.toBeInTheDocument();
  });

  it("A11: shows both buttons side by side when both providers are configured", () => {
    render(<SignUp socialProviders={["google", "github"]} />);

    expect(screen.getByRole("button", { name: "Google" }).parentElement).toHaveClass("grid-cols-2");
    expect(screen.getByRole("button", { name: "Github" })).toBeInTheDocument();
  });
});
