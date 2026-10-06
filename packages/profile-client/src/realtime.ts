import type { MessageKind, RealtimeMessage } from "@sp/types";

/**
 * Minimal shape of a Supabase Realtime channel. `supabase.channel(name)` satisfies this, so no
 * dependency on @supabase/supabase-js is needed here and tests can inject a fake channel.
 */
export interface RealtimeChannelLike {
  on(
    type: "postgres_changes",
    filter: { event: string; schema: string; table: string; filter?: string },
    callback: (payload: { new: Record<string, unknown> }) => void,
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string, err?: Error) => void): unknown;
  unsubscribe(): unknown;
}
export type RealtimeChannelFactory = (name: string) => RealtimeChannelLike;

/** The other person's read watermark moved (conversation_members UPDATE). */
export interface ReadReceipt {
  userId: string;
  lastReadAt: string;
}

export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "closed";

export interface ConversationSubscriptionOptions {
  conversationId: string;
  /** Newest message from the other person (or yourself, echoed back) — deduplicated by id. */
  onMessage: (message: RealtimeMessage) => void;
  onStatus?: (status: RealtimeStatus) => void;
  /** Live read receipts: fires when either member's read watermark moves. Optional. */
  onRead?: (receipt: ReadReceipt) => void;
  /**
   * Called after every (re)subscribe. Fetch the latest page from the API here: Realtime can drop
   * messages while the socket is down, so the stream alone is never the source of truth.
   */
  onResync?: () => void;
  /** Backoff between resubscribe attempts; the last delay repeats forever. */
  retryDelaysMs?: number[];
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown;
  clearTimeoutImpl?: (handle: unknown) => void;
}

export interface ConversationSubscription {
  close(): void;
}

const DEFAULT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000];
const DEDUPE_CAP = 500;

function toMessage(raw: Record<string, unknown>, conversationId: string): RealtimeMessage | null {
  if (String(raw.conversation_id ?? "") !== conversationId) return null;
  const id = String(raw.id ?? "");
  if (!id) return null;
  return {
    id,
    conversationId,
    senderId: String(raw.sender_id ?? ""),
    kind: String(raw.kind ?? "text") as MessageKind,
    body: String(raw.body ?? ""),
    clientTag: String(raw.client_tag ?? ""),
    createdAt: new Date(String(raw.created_at ?? "")).toISOString(),
  };
}

/**
 * Subscribes to new messages in one conversation via Supabase Realtime (postgres_changes on
 * public.messages; RLS limits delivery to the two members). Handles reconnects by resubscribing
 * with backoff and asks the caller to gap-fill via onResync, so a dropped connection never
 * silently loses messages. Safe alongside other tabs/devices: every subscriber gets every event.
 */
export function subscribeToConversationMessages(
  createChannel: RealtimeChannelFactory,
  opts: ConversationSubscriptionOptions,
): ConversationSubscription {
  const delays = opts.retryDelaysMs ?? DEFAULT_DELAYS;
  const setT = opts.setTimeoutImpl ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearT = opts.clearTimeoutImpl ?? ((h: unknown) => clearTimeout(h as never));
  const seen = new Set<string>();
  let closed = false;
  let channel: RealtimeChannelLike | null = null;
  let timer: unknown = null;
  let attempts = 0;

  const status = (s: RealtimeStatus) => opts.onStatus?.(s);

  function remember(id: string) {
    seen.add(id);
    // Bound the dedupe set so a long-lived subscription cannot grow without limit.
    if (seen.size > DEDUPE_CAP) seen.delete(seen.values().next().value!);
  }

  function open() {
    if (closed) return;
    status(attempts === 0 ? "connecting" : "reconnecting");
    channel = createChannel(`messages:${opts.conversationId}`);
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${opts.conversationId}` }, (payload) => {
        if (closed) return;
        const msg = toMessage(payload.new, opts.conversationId);
        if (!msg || seen.has(msg.id)) return;
        remember(msg.id);
        opts.onMessage(msg);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${opts.conversationId}` }, (payload) => {
        if (closed || !opts.onRead) return;
        const raw = payload.new;
        if (String(raw.conversation_id ?? "") !== opts.conversationId) return;
        const at = new Date(String(raw.last_read_at ?? ""));
        if (!raw.user_id || Number.isNaN(at.getTime())) return;
        opts.onRead({ userId: String(raw.user_id), lastReadAt: at.toISOString() });
      })
      .subscribe((s) => {
        if (closed) return;
        if (s === "SUBSCRIBED") {
          attempts = 0;
          status("live");
          opts.onResync?.();
        } else if (s === "TIMED_OUT" || s === "CHANNEL_ERROR" || s === "CLOSED") {
          scheduleRetry();
        }
      });
  }

  function scheduleRetry() {
    if (closed || timer !== null) return;
    const delay = delays[Math.min(attempts, delays.length - 1)]!;
    attempts += 1;
    status("reconnecting");
    timer = setT(() => {
      timer = null;
      // The old channel may be wedged; drop it and build a fresh one.
      try { channel?.unsubscribe(); } catch { /* best effort */ }
      channel = null;
      open();
    }, delay);
  }

  open();

  return {
    close() {
      if (closed) return;
      closed = true;
      if (timer !== null) clearT(timer);
      timer = null;
      try { channel?.unsubscribe(); } catch { /* best effort */ }
      channel = null;
      status("closed");
    },
  };
}
