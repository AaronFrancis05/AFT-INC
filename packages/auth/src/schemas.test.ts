import { describe, expect, it } from "vitest";
import { signUpSchema, verifyEmailSchema } from "./schemas";

const validSignUp = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "Analytical1",
  confirmPassword: "Analytical1",
};

function messagesFor(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("signUpSchema", () => {
  it("accepts a valid sign up", () => {
    expect(signUpSchema.safeParse(validSignUp).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: "Ab1",
      confirmPassword: "Ab1",
    });
    expect(messagesFor(result)).toContain("Password must be at least 8 characters");
  });

  it("rejects a password with no uppercase letter", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: "analytical1",
      confirmPassword: "analytical1",
    });
    expect(messagesFor(result)).toContain("Password must contain at least one uppercase letter");
  });

  it("rejects a password with no number", () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: "Analytical",
      confirmPassword: "Analytical",
    });
    expect(messagesFor(result)).toContain("Password must contain at least one number");
  });

  it("rejects mismatched passwords on the confirm field", () => {
    const result = signUpSchema.safeParse({ ...validSignUp, confirmPassword: "Different1" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
  });
});

describe("verifyEmailSchema", () => {
  it("accepts a 6 digit code", () => {
    expect(verifyEmailSchema.safeParse({ code: "123456" }).success).toBe(true);
  });

  it.each(["12345", "1234567", ""])("rejects a code of length %#", (code) => {
    const result = verifyEmailSchema.safeParse({ code });
    expect(messagesFor(result)).toContain("Code must be 6 digits");
  });
});
