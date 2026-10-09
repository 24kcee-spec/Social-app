import { z } from "zod";
import { CONTENT_VISIBILITIES, DISCOVERY_EVENT_TYPES, INTEREST_STRENGTHS, MESSAGE_PERMISSIONS, PROFILE_MEDIA_KINDS, PUSH_PLATFORMS, SOCIAL_STYLES, USER_ROLES } from "@sp/types";

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

/** The intro is chosen, never typed, unless "custom" (a short note, refused for people in low-pressure mode). */
export const introSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("icebreaker"), ref: z.string().uuid() }),
  z.object({ kind: z.literal("question"), ref: z.string().min(1).max(60) }),
  z.object({ kind: z.literal("this_or_that"), ref: z.string().min(1).max(60), choice: z.enum(["a", "b"]) }),
  z.object({ kind: z.literal("custom"), text: z.string().trim().min(2).max(240) }),
]);
export type IntroInput = z.infer<typeof introSchema>;

export const sendRequestSchema = z.object({ recipientId: z.string().uuid(), intro: introSchema });
export type SendRequestInput = z.infer<typeof sendRequestSchema>;

export const requestBoxSchema = z.object({ box: z.enum(["incoming", "outgoing"]).default("incoming") });

export const interactionSettingsSchema = z.object({ lowPressureMode: z.boolean() });
export type InteractionSettingsInput = z.infer<typeof interactionSettingsSchema>;

export const activationQuerySchema = z.object({ sinceDays: z.coerce.number().int().min(1).max(365).default(30) });

// ---- Phase 5: messaging + notifications ----
export const openConversationSchema = z.object({ userId: z.string().uuid() });
export type OpenConversationInput = z.infer<typeof openConversationSchema>;

/** clientTag is generated by the client per composed message; resending the same tag after a reconnect is a no-op. */
export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(2000, "Keep messages under 2000 characters"),
  clientTag: z.string().uuid(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:\d{2})?)?$/;
const CURSOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Opaque message-page cursor: `<timestamptz>~<message id>` as issued in MessagePage.nextCursor.
 * A bare timestamptz (no `~id`) is accepted for backward compatibility with early Phase 5 clients.
 */
export const messageCursorSchema = z.string().max(200).refine((v) => {
  const i = v.lastIndexOf("~");
  const [ts, id] = i === -1 ? [v, undefined] : [v.slice(0, i), v.slice(i + 1)];
  return CURSOR_TS_RE.test(ts) && (id === undefined || CURSOR_ID_RE.test(id));
}, "Invalid cursor");

export const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: messageCursorSchema.optional(),
});
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;

export const notificationSettingsSchema = z.object({
  messages: z.boolean(),
  connectionRequests: z.boolean(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

export const pushTokenSchema = z.object({
  platform: z.enum(PUSH_PLATFORMS),
  token: z.string().trim().min(8).max(500),
});
export type PushTokenInput = z.infer<typeof pushTokenSchema>;


// ---- Phase 6: groups + activities + events ----
export const createGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  generalArea: z.string().trim().min(2).max(120),
  capacity: z.coerce.number().int().min(2).max(500).default(30),
  activityIds: z.array(z.string().uuid()).max(10).default([]),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const createEventSchema = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  generalArea: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  capacity: z.coerce.number().int().min(1).max(500),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventListQuerySchema = z.object({
  generalArea: z.string().trim().min(2).max(120).optional(),
  groupId: z.string().uuid().optional(),
});
export const groupListQuerySchema = z.object({
  generalArea: z.string().trim().min(2).max(120).optional(),
  activityId: z.string().uuid().optional(),
});
export const eventMessageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().min(10).max(80).optional(),
});
export type EventListQueryInput = z.infer<typeof eventListQuerySchema>;

export const eventMessageSchema = z.object({ body: z.string().trim().min(1).max(2000), clientTag: z.string().uuid() });
export type EventMessageInput = z.infer<typeof eventMessageSchema>;
