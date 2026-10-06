import type { ConversationView, MessagePage, MessageView, NotificationSettings, PushPlatform } from "@sp/types";
import { ProfileApiError, describeFailure, type ProfileClientConfig } from "./index";

const FRIENDLY: Record<string, string> = {
  onboarding_required: "Finish your profile before messaging.",
  not_found: "That conversation is not available.",
  not_member: "That conversation is not available.",
  not_connected: "You can message people you are connected with. If the connection was removed, this chat is read-only.",
  rate_limited: "Easy there - a short pause, then you can send more.",
  daily_limit: "That is a lot of messages for one day. Try again tomorrow.",
  messages_off: "This person is not accepting messages right now.",
  account_inactive: "Your account cannot send messages right now.",
};

/** A fresh tag per composed message. Retrying a send with the same tag is safe (never duplicates). */
export function newClientTag(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for older React Native runtimes without crypto.randomUUID.
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function createMessagingClient(config: ProfileClientConfig) {
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
    /** Open (or reopen) the direct conversation with a connected person. */
    openConversation: async (userId: string): Promise<ConversationView> => (await json<{ conversation: ConversationView }>(await call("/conversations", "POST", { userId }))).conversation,
    listConversations: async (): Promise<ConversationView[]> => (await json<{ conversations: ConversationView[] }>(await call("/conversations", "GET"))).conversations,
    listMessages: async (conversationId: string, opts: { limit?: number; before?: string } = {}): Promise<MessagePage> => {
      const qs = new URLSearchParams();
      if (opts.limit) qs.set("limit", String(opts.limit));
      if (opts.before) qs.set("before", opts.before);
      const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
      return json<MessagePage>(await call(`/conversations/${encodeURIComponent(conversationId)}/messages${suffix}`, "GET"));
    },
    /** Pass the same clientTag when retrying after a network failure. */
    sendMessage: async (conversationId: string, body: string, clientTag: string): Promise<MessageView> =>
      (await json<{ message: MessageView }>(await call(`/conversations/${encodeURIComponent(conversationId)}/messages`, "POST", { body, clientTag }))).message,
    markRead: async (conversationId: string): Promise<void> => done(await call(`/conversations/${encodeURIComponent(conversationId)}/read`, "POST")),
    getNotificationSettings: async (): Promise<NotificationSettings> => json(await call("/me/notification-settings", "GET")),
    setNotificationSettings: async (settings: NotificationSettings): Promise<NotificationSettings> => json(await call("/me/notification-settings", "PUT", settings)),
    registerPushToken: async (platform: PushPlatform, token: string): Promise<void> => done(await call("/me/push-tokens", "POST", { platform, token })),
    removePushToken: async (token: string): Promise<void> => done(await call("/me/push-tokens", "DELETE", { token })),
  };
}
export type MessagingClient = ReturnType<typeof createMessagingClient>;
