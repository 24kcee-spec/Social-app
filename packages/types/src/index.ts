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

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roles: UserRole[];
  createdAt: string;
  lastActiveAt: string | null;
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
