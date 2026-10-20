import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = { onSuccess?: () => void; onError?: (ctx: { error: { message: string } }) => void };

const { verifyEmail, sendVerificationOtp, push, toast } = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  sendVerificationOtp: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { emailOtp: { verifyEmail, sendVerificationOtp } },
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

import { VerifyEmail } from "./verify-email";

const EMAIL = "ada@example.com";

function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.setItem("verify_email", EMAIL);
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("shows the email the code was sent to", () => {
    render(<VerifyEmail />);

    expect(screen.getByText(`We sent a verification code to ${EMAIL}`)).toBeInTheDocument();
  });

  describe("resend countdown", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("starts disabled at 60 seconds", () => {
      render(<VerifyEmail />);

      expect(screen.getByRole("button", { name: "Resend in 60s" })).toBeDisabled();
    });

    it("counts down once per second", () => {
      render(<VerifyEmail />);

      tick(1);

      expect(screen.getByRole("button", { name: "Resend in 59s" })).toBeDisabled();
    });

    it("enables Resend when the countdown reaches zero and stops there", () => {
      render(<VerifyEmail />);

      tick(60);
      expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled();

      tick(5);
      expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled();
    });

    it("resends the code to the stored email and restarts the countdown", async () => {
      sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
      render(<VerifyEmail />);
      tick(60);
      vi.useRealTimers();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Resend" }));

      expect(sendVerificationOtp).toHaveBeenCalledWith(
        { email: EMAIL, type: "email-verification" },
        expect.any(Object),
      );
      expect(toast.success).toHaveBeenCalledWith("Code resent! Check your email.");
      expect(screen.getByRole("button", { name: "Resend in 60s" })).toBeDisabled();
    });

    it("lets you try again straight away when the resend fails", async () => {
      sendVerificationOtp.mockImplementation(async (_body: unknown, cb: Callbacks) =>
        cb.onError?.({ error: { message: "Too many requests" } }),
      );
      render(<VerifyEmail />);
      tick(60);
      vi.useRealTimers();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Resend" }));

      expect(toast.error).toHaveBeenCalledWith("Too many requests");
      expect(screen.getByRole("button", { name: "Resend" })).toBeEnabled();
    });

    it("does not call the server when no email is stored", async () => {
      sessionStorage.clear();
      render(<VerifyEmail />);
      tick(60);
      vi.useRealTimers();
      const user = userEvent.setup();

      await user.click(screen.getByRole("button", { name: "Resend" }));

      expect(toast.error).toHaveBeenCalledWith("No email found to resend code.");
      expect(sendVerificationOtp).not.toHaveBeenCalled();
    });
  });

  describe("verifying the code", () => {
    it("shows a validation message for an empty code and makes no network call", async () => {
      const user = userEvent.setup();
      render(<VerifyEmail />);

      await user.click(screen.getByRole("button", { name: "Verify email" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Code must be 6 digits");
      expect(verifyEmail).not.toHaveBeenCalled();
    });

    it("verifies the code, clears the stored email, and goes to sign in", async () => {
      verifyEmail.mockImplementation(async (_body: unknown, cb: Callbacks) => cb.onSuccess?.());
      const user = userEvent.setup();
      render(<VerifyEmail />);

      await user.type(screen.getByRole("textbox"), "123456");
      await user.click(screen.getByRole("button", { name: "Verify email" }));

      expect(verifyEmail).toHaveBeenCalledWith({ email: EMAIL, otp: "123456" }, expect.any(Object));
      expect(sessionStorage.getItem("verify_email")).toBeNull();
      expect(push).toHaveBeenCalledWith("/auth/sign-in");
    });

    it("stays on the page and shows the server error for a wrong code", async () => {
      verifyEmail.mockImplementation(async (_body: unknown, cb: Callbacks) =>
        cb.onError?.({ error: { message: "Invalid OTP" } }),
      );
      const user = userEvent.setup();
      render(<VerifyEmail />);

      await user.type(screen.getByRole("textbox"), "000000");
      await user.click(screen.getByRole("button", { name: "Verify email" }));

      expect(toast.error).toHaveBeenCalledWith("Invalid OTP");
      expect(push).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("verify_email")).toBe(EMAIL);
      expect(screen.getByRole("button", { name: "Verify email" })).toBeEnabled();
    });
  });
});
