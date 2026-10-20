import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = { onSuccess?: () => unknown; onError?: (ctx: { error: { message: string } }) => void };

const { signUpEmail, signInSocial, sendVerificationOtp, push, toast } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  signInSocial: vi.fn(),
  sendVerificationOtp: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({
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
    render(<SignUp />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Name must be at least 2 characters")).toBeInTheDocument();
    expect(screen.getByText("Please enter a valid email address")).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("creates the account, sends the code, and goes to verify email", async () => {
    sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
    render(<SignUp />);

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
    render(<SignUp />);

    await fillAndSubmit();

    expect(toast.error).toHaveBeenCalledWith(
      "Account created but failed to send verification email. Please try resending.",
    );
    expect(sessionStorage.getItem("verify_email")).toBe(EMAIL);
    expect(push).toHaveBeenCalledWith("/auth/verify-email");
  });

  it("stays on the form when sign up is rejected", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    signUpEmail.mockImplementation(async (_body: unknown, cb: Callbacks) =>
      cb.onError?.({ error: { message: "User already exists" } }),
    );
    render(<SignUp />);

    await fillAndSubmit();

    expect(toast.error).toHaveBeenCalledWith("User already exists");
    expect(sendVerificationOtp).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});
