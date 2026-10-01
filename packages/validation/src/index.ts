import { z } from "zod";
import { SOCIAL_STYLES, USER_ROLES } from "@sp/types";

/** Emails are normalised to lower case so uniqueness is case-insensitive (the DB enforces the same rule). */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** E.164: + then 7-15 digits, first digit non-zero. Matches the DB check constraint. */
export const phoneSchema = z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be in E.164 format, e.g. +263771234567");

export const displayNameSchema = z.string().trim().min(2).max(50);

export const roleSchema = z.enum(USER_ROLES);
export const socialStyleSchema = z.enum(SOCIAL_STYLES);

/** Signup needs a display name plus at least one contact method. Minimum data, per onboarding principle. */
export const signupSchema = z
  .object({
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
    displayName: displayNameSchema,
  })
  .refine((v) => v.email !== undefined || v.phone !== undefined, {
    message: "Provide an email or a phone number",
    path: ["email"],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().trim().max(280).optional(),
  socialStyles: z.array(socialStyleSchema).max(SOCIAL_STYLES.length).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Supabase Auth caps passwords at 72 bytes; 8 is our minimum. Used identically by web and mobile. */
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(72) });
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpFormSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema.optional() });
export type SignUpFormInput = z.infer<typeof signUpFormSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z.object({ password: passwordSchema });
