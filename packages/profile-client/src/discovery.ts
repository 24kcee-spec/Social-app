import type { BlockedUser, DiscoveryEventType, DiscoveryFeed } from "@sp/types";
import { ProfileApiError, describeFailure, type ProfileClientConfig } from "./index";

const FRIENDLY: Record<string, string> = {
  onboarding_required: "Finish your profile to start seeing people.",
  rate_limited: "Slow down a little and try again shortly.",
};

/** Same transport rules as the profile client: bearer token, friendly errors, never a raw status dump. */
export function createDiscoveryClient(config: ProfileClientConfig) {
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

  return {
    async getPeople(limit = 20, offset = 0): Promise<DiscoveryFeed> {
      const r = await call(`/discovery/people?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`, "GET");
      return r.ok ? ((await r.json()) as DiscoveryFeed) : fail(r);
    },
    /** Fire-and-forget safe: callers may ignore failures; ranking just has less history. */
    async recordEvents(events: { candidateId: string; type: DiscoveryEventType }[]): Promise<number> {
      if (events.length === 0) return 0;
      const r = await call("/discovery/events", "POST", { events: events.slice(0, 50) });
      return r.ok ? ((await r.json()) as { recorded: number }).recorded : fail(r);
    },
    async listBlocks(): Promise<BlockedUser[]> {
      const r = await call("/blocks", "GET");
      return r.ok ? ((await r.json()) as { blocks: BlockedUser[] }).blocks : fail(r);
    },
    async block(userId: string): Promise<void> {
      const r = await call("/blocks", "POST", { userId });
      if (!r.ok) await fail(r);
    },
    async unblock(userId: string): Promise<void> {
      const r = await call(`/blocks/${encodeURIComponent(userId)}`, "DELETE");
      if (r.status !== 204 && !r.ok) await fail(r);
    },
  };
}
export type DiscoveryClient = ReturnType<typeof createDiscoveryClient>;
