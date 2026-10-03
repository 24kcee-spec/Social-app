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
