// Shared domain types. Const arrays are the single source of truth; validation derives zod enums from them.

export const USER_ROLES = ["user", "moderator", "admin", "business"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "suspended", "banned", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const SOCIAL_STYLES = [
  "small_group",
  "one_to_one",
  "text_first",
  "voice_first",
  "low_pressure",
] as const;
export type SocialStyle = (typeof SOCIAL_STYLES)[number];

export const MESSAGE_PERMISSIONS = ["everyone", "connections", "nobody"] as const;
export type MessagePermission = (typeof MESSAGE_PERMISSIONS)[number];

export const CONTENT_VISIBILITIES = ["public", "connections", "private"] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITIES)[number];

export const INTEREST_STRENGTHS = [1, 2, 3] as const;
export type InterestStrength = (typeof INTEREST_STRENGTHS)[number];

export const PROFILE_MEDIA_KINDS = ["avatar"] as const;
export type ProfileMediaKind = (typeof PROFILE_MEDIA_KINDS)[number];

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: UserRole[];
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ProfilePrivacySettings {
  discoverable: boolean;
  messagePermission: MessagePermission;
  storyVisibility: ContentVisibility;
  activityVisibility: ContentVisibility;
}

export interface Profile {
  userId: string;
  displayName: string;
  bio: string;
  socialStyles: SocialStyle[];
  privacy: ProfilePrivacySettings;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
  interests: Interest[];
  prompts: PromptAnswer[];
  media: ProfileMedia[];
}

export interface Interest {
  id: string;
  name: string;
  category: string;
  slug: string;
  sortOrder: number;
  strength?: InterestStrength;
}

export interface PromptDefinition {
  id: string;
  prompt: string;
  category: string;
  sortOrder: number;
  active: boolean;
}

export interface PromptAnswer {
  promptId: string;
  prompt: string;
  category: string;
  answer: string;
  updatedAt: string;
}

export interface ProfileMedia {
  id: string;
  kind: ProfileMediaKind;
  storagePath: string;
  thumbnailPath: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  sortOrder: number;
  createdAt: string;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
}

export interface ReadyResponse {
  status: "ready" | "not_ready";
  checks: Record<string, "ok" | "fail">;
}

export const DISCOVERY_EVENT_TYPES = ["impression", "open", "ignore", "interact"] as const;
export type DiscoveryEventType = (typeof DISCOVERY_EVENT_TYPES)[number];

/** Every score component has a stable code so tests, admin tooling and the UI agree on what happened. */
export const DISCOVERY_REASON_CODES = [
  "shared_interests",
  "shared_styles",
  "shared_prompts",
  "related_interests",
  "recently_active",
  "new_member",
  "repeat_fatigue",
  "ignored_before",
  "diversity",
  "fallback",
] as const;
export type DiscoveryReasonCode = (typeof DISCOVERY_REASON_CODES)[number];

export interface DiscoveryReason {
  code: DiscoveryReasonCode;
  /** Plain-language sentence shown on the card. Only positive reasons are shown to people; all are visible to admins. */
  text: string;
  /** Signed points this component added to (or removed from) the score. */
  points: number;
}

export type DiscoveryRelation = "none" | "pending_out" | "pending_in";

export interface DiscoveryCard {
  userId: string;
  displayName: string;
  bio: string;
  socialStyles: SocialStyle[];
  messagePermission: MessagePermission;
  interests: Interest[];
  sharedInterests: Interest[];
  prompts: PromptAnswer[];
  /** Thumbnail only; originals are never exposed through discovery. */
  thumbnailPath: string | null;
  /** Where this person stands with the viewer. Connected people are not shown in discovery. */
  relation: DiscoveryRelation;
  score: number;
  /** Positive reasons only, strongest first. Never empty. */
  reasons: DiscoveryReason[];
}

export interface DiscoveryFeed {
  people: DiscoveryCard[];
  hasMore: boolean;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  blockedAt: string;
}

// ---- Phase 4: low-pressure interaction ----
export const INTRO_KINDS = ["icebreaker", "question", "this_or_that", "custom"] as const;
export type IntroKind = (typeof INTRO_KINDS)[number];

/** What a sender sees. Declined and expired both read as "no_reply" so nobody is told they were turned down. */
export type RequestStatus = "pending" | "accepted" | "no_reply";

export interface PersonSummary {
  userId: string;
  displayName: string;
  bio: string;
  thumbnailPath: string | null;
}

export interface ConnectionRequestView {
  id: string;
  other: PersonSummary;
  intro: { kind: IntroKind; text: string };
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
}

export interface ConnectionView {
  other: PersonSummary;
  connectedAt: string;
}

export interface StarterSet {
  icebreakers: { ref: string; text: string; interestName: string }[];
  questions: { ref: string; text: string }[];
  games: { ref: string; optionA: string; optionB: string }[];
  /** False when the person is in low-pressure mode: only the structured starters above can be sent. */
  allowCustom: boolean;
}

export interface InteractionSettings {
  lowPressureMode: boolean;
}

export interface SendRequestResult {
  /** "connected" means they had already said hi to you, so the two requests became a connection. */
  status: "pending" | "connected";
  requestId: string;
}

// ---- Phase 5: messaging + notifications ----
export const MESSAGE_KINDS = ["text"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface ConversationView {
  id: string;
  other: PersonSummary;
  lastMessage: { senderId: string; body: string; createdAt: string } | null;
  /** Messages from the other person newer than your read watermark. */
  unreadCount: number;
  createdAt: string;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  body: string;
  createdAt: string;
  /** Echoed back so a client can reconcile optimistic sends after a reconnect. */
  clientTag: string;
  /** True once the other person has read this far. Only meaningful on your own messages. */
  read: boolean;
}

/** Oldest-first within the page; load older messages with before = messages[0].createdAt. */
export interface MessagePage {
  messages: MessageView[];
  hasMore: boolean;
}

export interface NotificationSettings {
  messages: boolean;
  connectionRequests: boolean;
}

export const PUSH_PLATFORMS = ["android", "ios", "web"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export interface ActivationSummary {
  sinceDays: number;
  signedUp: number;
  onboarded: number;
  sentFirstRequest: number;
  connected: number;
  /** Onboarded people who sent a first request within 48 hours of signing up. */
  activatedWithin48h: number;
  /** activatedWithin48h / onboarded, or null when nobody has onboarded yet. */
  activationRate: number | null;
}
