import type { ConnectionRequestView, ConnectionView, InteractionSettings, SendRequestResult, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import { ProfileApiError, describeFailure, type ProfileClientConfig } from "./index";

const FRIENDLY: Record<string, string> = {
  onboarding_required: "Finish your profile before saying hi.",
  not_found: "That person is not available.",
  not_accepting: "This person is not accepting new connections right now.",
  already_connected: "You are already connected.",
  already_pending: "You already said hi. They have a couple of weeks to reply.",
  cooldown: "You can try again with this person a little later.",
  daily_limit: "That is plenty of hellos for today. Try again tomorrow.",
  pending_limit: "You have a lot of open requests. Give people time to reply first.",
  custom_not_allowed: "This person prefers a low-pressure start. Pick one of the suggested openers.",
  invalid_intro: "That opener is not available. Pick another one.",
  not_pending: "This request is no longer open.",
};

export function createConnectionsClient(config: ProfileClientConfig) {
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function call(path: string, method: string, body?: unknown): Promise<Response> {
    const token = await config.getAccessToken();
    try {
      return await doFetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      throw new ProfileApiError(503, "service_unavailable", "The service is not reachable right now. Please try again shortly.");
    }
  }
  async function fail(response: Response): Promise<never> {
    let payload: { error?: string; message?: string; fields?: Record<string, string> } = {};
    try { payload = (await response.json()) as typeof payload; } catch { /* generic */ }
    const code = payload.error ?? (response.status === 401 ? "unauthorized" : "request_failed");
    throw new ProfileApiError(response.status, code, FRIENDLY[code] ?? payload.message ?? describeFailure(response.status, payload.fields), payload.fields ?? {});
  }
  const json = async <T>(r: Response): Promise<T> => (r.ok ? ((await r.json()) as T) : fail(r));
  const done = async (r: Response): Promise<void> => { if (!r.ok) await fail(r); };

  return {
    getStarters: async (userId: string): Promise<StarterSet> => json(await call(`/people/${encodeURIComponent(userId)}/starters`, "GET")),
    sendRequest: async (recipientId: string, intro: IntroInput): Promise<SendRequestResult> => json(await call("/connections/requests", "POST", { recipientId, intro })),
    listRequests: async (box: "incoming" | "outgoing"): Promise<ConnectionRequestView[]> => (await json<{ requests: ConnectionRequestView[] }>(await call(`/connections/requests?box=${box}`, "GET"))).requests,
    accept: async (id: string): Promise<void> => done(await call(`/connections/requests/${encodeURIComponent(id)}/accept`, "POST")),
    /** Private: the sender only ever sees "no reply". */
    decline: async (id: string): Promise<void> => done(await call(`/connections/requests/${encodeURIComponent(id)}/decline`, "POST")),
    withdraw: async (id: string): Promise<void> => done(await call(`/connections/requests/${encodeURIComponent(id)}`, "DELETE")),
    listConnections: async (): Promise<ConnectionView[]> => (await json<{ connections: ConnectionView[] }>(await call("/connections", "GET"))).connections,
    removeConnection: async (userId: string): Promise<void> => done(await call(`/connections/${encodeURIComponent(userId)}`, "DELETE")),
    getSettings: async (): Promise<InteractionSettings> => json(await call("/me/interaction-settings", "GET")),
    setLowPressure: async (lowPressureMode: boolean): Promise<InteractionSettings> => json(await call("/me/interaction-settings", "PUT", { lowPressureMode })),
  };
}
export type ConnectionsClient = ReturnType<typeof createConnectionsClient>;
