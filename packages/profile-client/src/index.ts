import type { Interest, Profile, ProfileMedia, PromptDefinition } from "@sp/types";
import type { InterestSelectionsRequest, OnboardingInput, ProfileMediaRegistrationInput, ProfileUpdateInput, PromptAnswersRequest } from "@sp/validation";

export class ProfileApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fields: Record<string, string> = {}) {
    super(message);
    this.name = "ProfileApiError";
  }
}

export interface ProfileClientConfig {
  apiUrl: string;
  getAccessToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
}

const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  bio: "Bio",
  socialStyles: "Social style (pick at least 1)",
  interests: "Interests (pick 3 to 12)",
  answers: "Prompt answers (answer 1 to 3)",
  privacy: "Privacy settings",
};

/** Turns an API failure with no message into something the person can act on. */
export function describeFailure(status: number, fields?: Record<string, string>): string {
  if (status === 401) return "Your session has ended. Please sign in again.";
  const entries = Object.entries(fields ?? {});
  if (entries.length > 0) return `Please fix: ${entries.map(([k, v]) => `${FIELD_LABELS[k] ?? k} - ${v}`).join("; ")}`;
  if (status >= 500) return `We could not save that (server error ${status}). Please try again.`;
  return "We could not save that yet. Please try again.";
}

type ProfileRequestInit = { method?: string; body?: unknown };

export function createProfileClient(config: ProfileClientConfig) {
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: ProfileRequestInit = {}): Promise<T> {
    const token = await config.getAccessToken();
    let response: Response;
    try {
      response = await doFetch(`${api}${path}`, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch {
      throw new ProfileApiError(503, "service_unavailable", "The service is not reachable right now. Please try again shortly.");
    }
    if (response.ok) return (await response.json()) as T;
    let payload: { error?: string; message?: string; fields?: Record<string, string> } = {};
    try { payload = (await response.json()) as typeof payload; } catch { /* generic */ }
    const code = payload.error ?? (response.status === 401 ? "unauthorized" : "request_failed");
    const message = payload.message ?? describeFailure(response.status, payload.fields);
    throw new ProfileApiError(response.status, code, message, payload.fields ?? {});
  }

  return {
    getProfile: () => request<Profile>("/me/profile"),
    listInterests: async () => (await request<{ interests: Interest[] }>("/interests")).interests,
    listPrompts: async () => (await request<{ prompts: PromptDefinition[] }>("/prompts")).prompts,
    updateProfile: (input: ProfileUpdateInput) => request<Profile>("/me/profile", { method: "PUT", body: input }),
    updateInterests: (input: InterestSelectionsRequest) => request<Profile>("/me/interests", { method: "PUT", body: input }),
    updatePrompts: (input: PromptAnswersRequest) => request<Profile>("/me/prompts", { method: "PUT", body: input }),
    completeOnboarding: (input: OnboardingInput) => request<Profile>("/me/onboarding", { method: "PUT", body: input }),
    registerMedia: (input: ProfileMediaRegistrationInput) => request<ProfileMedia>("/me/profile/media", { method: "POST", body: input }),
    deleteMedia: async (id: string) => {
      const token = await config.getAccessToken();
      let response: Response;
      try {
        response = await doFetch(`${api}/me/profile/media/${encodeURIComponent(id)}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      } catch {
        throw new ProfileApiError(503, "service_unavailable", "The service is not reachable right now. Please try again shortly.");
      }
      if (response.status === 204) return;
      let payload: { error?: string; message?: string } = {};
      try { payload = (await response.json()) as typeof payload; } catch { /* generic */ }
      throw new ProfileApiError(response.status, payload.error ?? "request_failed", payload.message ?? "We could not remove that image yet.");
    },
  };
}
export type ProfileClient = ReturnType<typeof createProfileClient>;
export { createDiscoveryClient, type DiscoveryClient } from "./discovery";
