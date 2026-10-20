import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = { onSuccess?: () => void; onError?: (ctx: { error: { message: string } }) => void };

const { resetPassword, sendVerificationOtp, push, toast } = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  sendVerificationOtp: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { emailOtp: { resetPassword, sendVerificationOtp } },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("sonner", () => ({ toast }));

// jsdom has no ResizeObserver or elementFromPoint; the OTP input needs both.
document.elementFromPoint = () => null;
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { ResetPassword } from "./reset-password";

const EMAIL = "ada@example.com";

async function fillForm(code: string, password: string, confirm: string) {
  const user = userEvent.setup();
  const [newPassword, confirmPassword] = screen.getAllByPlaceholderText("••••••••");
  await user.type(screen.getByRole("textbox"), code);
  await user.type(newPassword, password);
  await user.type(confirmPassword, confirm);
  await user.click(screen.getByRole("button", { name: "Reset Password" }));
}

describe("ResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe("without a stored reset email", () => {
    it("shows the session expired screen with a link to request a new code", () => {
      render(<ResetPassword />);

      expect(screen.getByRole("heading", { name: "Session Expired" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Request Reset Code" })).toHaveAttribute(
        "href",
        "/auth/forgot-password",
      );
      expect(screen.queryByRole("button", { name: "Reset Password" })).not.toBeInTheDocument();
    });
  });

  describe("with a stored reset email", () => {
    beforeEach(() => {
      sessionStorage.setItem("reset_email", EMAIL);
    });

    it("shows the form and the email the code was sent to", () => {
      render(<ResetPassword />);

      expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
      expect(screen.getByText(EMAIL)).toBeInTheDocument();
    });

    it("shows validation messages for an empty form and makes no network call", async () => {
      const user = userEvent.setup();
      render(<ResetPassword />);

      await user.click(screen.getByRole("button", { name: "Reset Password" }));

      expect(await screen.findByText("Please enter the 6-digit code")).toBeInTheDocument();
      expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
      expect(resetPassword).not.toHaveBeenCalled();
    });

    it("rejects mismatched passwords", async () => {
      render(<ResetPassword />);

      await fillForm("123456", "Analytical1", "Different1");

      expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
      expect(resetPassword).not.toHaveBeenCalled();
    });

    it("resets the password, clears the stored email, and goes to sign in", async () => {
      resetPassword.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
      render(<ResetPassword />);

      await fillForm("123456", "Analytical1", "Analytical1");

      expect(resetPassword).toHaveBeenCalledWith(
        { email: EMAIL, otp: "123456", password: "Analytical1" },
        expect.any(Object),
      );
      expect(sessionStorage.getItem("reset_email")).toBeNull();
      expect(push).toHaveBeenCalledWith("/auth/sign-in");
    });

    it("keeps you on the form when the server rejects the code", async () => {
      resetPassword.mockImplementation(async (_body: unknown, cb: Callbacks) =>
        cb.onError?.({ error: { message: "Invalid OTP" } }),
      );
      render(<ResetPassword />);

      await fillForm("000000", "Analytical1", "Analytical1");

      expect(toast.error).toHaveBeenCalledWith("Invalid OTP");
      expect(push).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("reset_email")).toBe(EMAIL);
    });

    it("resends a forget password code to the stored email", async () => {
      sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
      const user = userEvent.setup();
      render(<ResetPassword />);

      await user.click(screen.getByRole("button", { name: /Resend/ }));

      expect(sendVerificationOtp).toHaveBeenCalledWith(
        { email: EMAIL, type: "forget-password" },
        expect.any(Object),
      );
      expect(toast.success).toHaveBeenCalledWith("A new reset code has been sent to your email.");
    });
  });
});
