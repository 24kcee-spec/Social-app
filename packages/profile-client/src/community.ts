import type { Activity, CommunityEvent, EventAttendee, EventMessage, EventMessagePage, GroupMember, GroupSummary, RsvpStatus } from "@sp/types";
import { ProfileApiError, describeFailure, type ProfileClientConfig } from "./index";

const FRIENDLY: Record<string, string> = {
  onboarding_required: "Finish your profile first, then you can join groups and create your own.",
  not_found: "That is no longer available.",
  forbidden: "You do not have access to that.",
  full: "This one is full.",
  invalid: "That did not work. Please check the details and try again.",
  limit_reached: "You have reached the limit for that.",
  rate_limited: "Easy there - a short pause, then you can send more.",
  daily_limit: "That is a lot of messages for one day. Try again tomorrow.",
};

export interface CreateGroupBody { name: string; description?: string; generalArea: string; capacity?: number; activityIds?: string[] }
export interface CreateEventBody { groupId: string; title: string; description?: string; generalArea: string; startsAt: string; endsAt: string; capacity: number }

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0);
  return entries.length ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
}

export function createCommunityClient(config: ProfileClientConfig) {
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await config.getAccessToken();
    let response: Response;
    try {
      response = await doFetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      throw new ProfileApiError(503, "service_unavailable", "The service is not reachable right now. Please try again shortly.");
    }
    if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T;
    let payload: { error?: string; message?: string; fields?: Record<string, string> } = {};
    try { payload = (await response.json()) as typeof payload; } catch { /* generic */ }
    const code = payload.error ?? (response.status === 401 ? "unauthorized" : "request_failed");
    throw new ProfileApiError(response.status, code, FRIENDLY[code] ?? payload.message ?? describeFailure(response.status, payload.fields), payload.fields ?? {});
  }

  return {
    listActivities: async () => (await call<{ activities: Activity[] }>("/activities", "GET")).activities,
    listGroups: async (q: { generalArea?: string; activityId?: string } = {}) => (await call<{ groups: GroupSummary[] }>(`/groups${qs(q)}`, "GET")).groups,
    getGroup: async (id: string) => (await call<{ group: GroupSummary }>(`/groups/${id}`, "GET")).group,
    createGroup: async (body: CreateGroupBody) => (await call<{ group: GroupSummary }>("/groups", "POST", body)).group,
    deleteGroup: (id: string) => call<void>(`/groups/${id}`, "DELETE"),
    joinGroup: (id: string) => call<void>(`/groups/${id}/join`, "POST"),
    leaveGroup: (id: string) => call<void>(`/groups/${id}/join`, "DELETE"),
    listMembers: async (id: string) => (await call<{ members: GroupMember[] }>(`/groups/${id}/members`, "GET")).members,
    listEvents: async (q: { generalArea?: string; groupId?: string } = {}) => (await call<{ events: CommunityEvent[] }>(`/events${qs(q)}`, "GET")).events,
    getEvent: async (id: string) => (await call<{ event: CommunityEvent }>(`/events/${id}`, "GET")).event,
    createEvent: async (body: CreateEventBody) => (await call<{ event: CommunityEvent }>("/events", "POST", body)).event,
    deleteEvent: (id: string) => call<void>(`/events/${id}`, "DELETE"),
    rsvp: (id: string) => call<{ status: RsvpStatus }>(`/events/${id}/rsvp`, "POST"),
    cancelRsvp: (id: string) => call<void>(`/events/${id}/rsvp`, "DELETE"),
    listAttendees: async (id: string) => (await call<{ attendees: EventAttendee[] }>(`/events/${id}/attendees`, "GET")).attendees,
    listEventMessages: (id: string, q: { limit?: number; before?: string } = {}) => call<EventMessagePage>(`/events/${id}/messages${qs({ limit: q.limit?.toString(), before: q.before })}`, "GET"),
    sendEventMessage: async (id: string, body: string, clientTag: string): Promise<EventMessage> => (await call<{ message: EventMessage }>(`/events/${id}/messages`, "POST", { body, clientTag })).message,
  };
}
export type CommunityClient = ReturnType<typeof createCommunityClient>;
