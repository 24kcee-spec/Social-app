import { z } from "zod";
import { CONTENT_VISIBILITIES, DISCOVERY_EVENT_TYPES, INTEREST_STRENGTHS, MESSAGE_PERMISSIONS, PROFILE_MEDIA_KINDS, SOCIAL_STYLES, USER_ROLES } from "@sp/types";

/** Emails are normalised to lower case so uniqueness is case-insensitive (the DB enforces the same rule). */
export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** E.164: + then 7-15 digits, first digit non-zero. Matches the DB check constraint. */
export const phoneSchema = z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/, "Phone must be in E.164 format, e.g. +263771234567");

export const displayNameSchema = z.string().trim().min(2).max(50);

export const roleSchema = z.enum(USER_ROLES);
export const socialStyleSchema = z.enum(SOCIAL_STYLES);
export const messagePermissionSchema = z.enum(MESSAGE_PERMISSIONS);
export const contentVisibilitySchema = z.enum(CONTENT_VISIBILITIES);
export const interestStrengthSchema = z.number().int().min(1).max(3).transform((v) => v as 1 | 2 | 3);
export const profileMediaKindSchema = z.enum(PROFILE_MEDIA_KINDS);

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

export const profilePrivacySchema = z.object({
  discoverable: z.boolean(),
  messagePermission: messagePermissionSchema,
  storyVisibility: contentVisibilitySchema,
  activityVisibility: contentVisibilitySchema,
});

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  bio: z.string().trim().max(280).optional(),
  socialStyles: z.array(socialStyleSchema).max(SOCIAL_STYLES.length).refine((v) => new Set(v).size === v.length, "Choose each social style only once").optional(),
  privacy: profilePrivacySchema.optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const interestSelectionSchema = z.object({
  interestId: z.string().uuid(),
  strength: interestStrengthSchema.default(2),
});

export const interestSelectionsRequestSchema = z
  .object({ interests: z.array(interestSelectionSchema).max(12) })
  .refine((v) => new Set(v.interests.map((i) => i.interestId)).size === v.interests.length, "Choose each interest only once");
export type InterestSelectionsRequest = z.infer<typeof interestSelectionsRequestSchema>;

export const promptAnswerSchema = z.object({
  promptId: z.string().min(1).max(60),
  answer: z.string().trim().min(2).max(240),
});

export const promptAnswersRequestSchema = z
  .object({ answers: z.array(promptAnswerSchema).max(3) })
  .refine((v) => new Set(v.answers.map((a) => a.promptId)).size === v.answers.length, "Choose each prompt only once");
export type PromptAnswersRequest = z.infer<typeof promptAnswersRequestSchema>;

export const onboardingSchema = z
  .object({
    displayName: displayNameSchema,
    bio: z.string().trim().max(280),
    socialStyles: z.array(socialStyleSchema).min(1).max(SOCIAL_STYLES.length).refine((v) => new Set(v).size === v.length, "Choose each social style only once"),
    privacy: profilePrivacySchema,
    interests: z.array(interestSelectionSchema).min(3).max(12),
    answers: z.array(promptAnswerSchema).min(1).max(3),
  })
  .refine((v) => new Set(v.interests.map((i) => i.interestId)).size === v.interests.length, { message: "Choose each interest only once", path: ["interests"] })
  .refine((v) => new Set(v.answers.map((a) => a.promptId)).size === v.answers.length, { message: "Choose each prompt only once", path: ["answers"] });
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const profileMediaRegistrationSchema = z.object({
  kind: profileMediaKindSchema,
  storagePath: z.string().min(5).max(300).regex(/^[A-Za-z0-9._/-]+$/, "Storage path contains unsupported characters").refine((v) => !v.split("/").includes(".."), "Storage path cannot contain parent traversal"),
  thumbnailPath: z.string().min(5).max(300).regex(/^[A-Za-z0-9._/-]+$/, "Thumbnail path contains unsupported characters").refine((v) => !v.split("/").includes(".."), "Thumbnail path cannot contain parent traversal"),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
  sortOrder: z.number().int().min(0).max(5),
});
export type ProfileMediaRegistrationInput = z.infer<typeof profileMediaRegistrationSchema>;

/** Supabase Auth caps passwords at 72 bytes; 8 is our minimum. Used identically by web and mobile. */
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(72, "Use at most 72 characters");

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(72) });
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpFormSchema = z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema.optional() });
export type SignUpFormInput = z.infer<typeof signUpFormSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export const newPasswordSchema = z.object({ password: passwordSchema });

export const discoveryEventTypeSchema = z.enum(DISCOVERY_EVENT_TYPES);

/** Query strings arrive as text; coerce, clamp and reject junk. */
export const discoveryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(200).default(0),
});
export type DiscoveryQueryInput = z.infer<typeof discoveryQuerySchema>;

export const discoveryEventsRequestSchema = z.object({
  events: z
    .array(z.object({ candidateId: z.string().uuid(), type: discoveryEventTypeSchema }))
    .min(1)
    .max(50),
});
export type DiscoveryEventsRequest = z.infer<typeof discoveryEventsRequestSchema>;

export const blockRequestSchema = z.object({ userId: z.string().uuid() });
export type BlockRequest = z.infer<typeof blockRequestSchema>;
