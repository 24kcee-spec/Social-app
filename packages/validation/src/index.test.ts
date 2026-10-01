import { describe, expect, it } from "vitest";
import { newPasswordSchema, passwordResetRequestSchema, profileUpdateSchema, signInSchema, signUpFormSchema, signupSchema } from "./index";

describe("signupSchema", () => {
  it("normalises email to lower case and trims", () => {
    const r = signupSchema.parse({ email: "  Kuda@Example.COM ", displayName: "Kuda" });
    expect(r.email).toBe("kuda@example.com");
  });
  it("accepts phone only", () => {
    expect(signupSchema.safeParse({ phone: "+263771234567", displayName: "Kuda" }).success).toBe(true);
  });
  it("rejects when no contact method is given", () => {
    expect(signupSchema.safeParse({ displayName: "Kuda" }).success).toBe(false);
  });
  it("rejects malformed phone numbers", () => {
    expect(signupSchema.safeParse({ phone: "0771234567", displayName: "Kuda" }).success).toBe(false);
    expect(signupSchema.safeParse({ phone: "+0123456789", displayName: "Kuda" }).success).toBe(false);
  });
  it("rejects too-short display names", () => {
    expect(signupSchema.safeParse({ email: "a@b.co", displayName: "K" }).success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts a valid partial update", () => {
    expect(profileUpdateSchema.safeParse({ bio: "Hello", socialStyles: ["low_pressure"] }).success).toBe(true);
  });
  it("rejects unknown social styles and over-long bios", () => {
    expect(profileUpdateSchema.safeParse({ socialStyles: ["loud"] }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ bio: "x".repeat(281) }).success).toBe(false);
  });
});

describe("auth form schemas", () => {
  it("signIn normalises email and requires a password", () => {
    expect(signInSchema.parse({ email: " A@B.Co ", password: "x" }).email).toBe("a@b.co");
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
  it("signUp enforces password length 8-72 and a valid email", () => {
    expect(signUpFormSchema.safeParse({ email: "a@b.co", password: "1234567" }).success).toBe(false);
    expect(signUpFormSchema.safeParse({ email: "a@b.co", password: "x".repeat(73) }).success).toBe(false);
    expect(signUpFormSchema.safeParse({ email: "nope", password: "12345678" }).success).toBe(false);
    expect(signUpFormSchema.safeParse({ email: "a@b.co", password: "12345678", displayName: "Kuda" }).success).toBe(true);
  });
  it("reset request and new password schemas validate", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "bad" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "short" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "long-enough-1" }).success).toBe(true);
  });
});
