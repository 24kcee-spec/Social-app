import { describe, expect, it, vi } from "vitest";
import { subscribeToConversationMessages, type RealtimeChannelLike } from "./realtime";

const CONV = "c0000000-0000-4000-8000-000000000000";

type PayloadCb = (payload: { new: Record<string, unknown> }) => void;
type StatusCb = (status: string, err?: Error) => void;

/** A fake Supabase channel: tests push payloads and status changes through it by hand. */
class FakeChannel implements RealtimeChannelLike {
  payloadCb: PayloadCb | null = null;
  statusCb: StatusCb | null = null;
  filter: Record<string, unknown> | null = null;
  unsubscribed = false;
  on(_type: "postgres_changes", filter: Record<string, unknown>, cb: PayloadCb) {
    this.filter = filter;
    this.payloadCb = cb;
    return this;
  }
  subscribe(cb?: StatusCb) {
    this.statusCb = cb ?? null;
    return this;
  }
  unsubscribe() {
    this.unsubscribed = true;
  }
  emit(row: Record<string, unknown>) {
    this.payloadCb?.({ new: row });
  }
  status(s: string) {
    this.statusCb?.(s);
  }
}

function row(id: string, body: string, conversationId = CONV) {
  return { id, conversation_id: conversationId, sender_id: "u1", kind: "text", body, client_tag: "t-" + id, created_at: "2026-10-12 12:00:00+00" };
}

function setup(opts: { retryDelaysMs?: number[] } = {}) {
  const channels: FakeChannel[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const messages: { id: string; body: string; conversationId: string }[] = [];
  const statuses: string[] = [];
  const resyncs: number[] = [];
  const sub = subscribeToConversationMessages(() => {
    const ch = new FakeChannel();
    channels.push(ch);
    return ch;
  }, {
    conversationId: CONV,
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    onResync: () => resyncs.push(1),
    retryDelaysMs: opts.retryDelaysMs,
    setTimeoutImpl: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeoutImpl: () => { timers.length = 0; },
  });
  return { sub, channels, timers, messages, statuses, resyncs };
}

describe("subscribeToConversationMessages", () => {
  it("delivers new messages for this conversation and goes live", () => {
    const { channels, messages, statuses, resyncs } = setup();
    const ch = channels[0]!;
    expect(ch.filter).toMatchObject({ event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${CONV}` });
    ch.status("SUBSCRIBED");
    ch.emit(row("m1", "hi"));
    expect(messages.map((m) => m.body)).toEqual(["hi"]);
    expect(statuses).toEqual(["connecting", "live"]);
    expect(resyncs).toHaveLength(1); // gap-fill on first subscribe
  });

  it("ignores duplicates and messages from other conversations", () => {
    const { channels, messages } = setup();
    const ch = channels[0]!;
    ch.status("SUBSCRIBED");
    ch.emit(row("m1", "hi"));
    ch.emit(row("m1", "hi")); // realtime re-delivery / multi-tab overlap
    ch.emit(row("m2", "stranger", "c9999999-0000-4000-8000-000000000000"));
    expect(messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("resubscribes with backoff after a drop and gap-fills again", () => {
    const { channels, timers, statuses, resyncs } = setup({ retryDelaysMs: [1000, 2000] });
    const first = channels[0]!;
    first.status("SUBSCRIBED");
    first.status("TIMED_OUT");
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(1000);
    timers[0]!.fn();
    expect(first.unsubscribed).toBe(true);
    expect(channels).toHaveLength(2);
    const second = channels[1]!;
    second.status("CHANNEL_ERROR");
    expect(timers[1]!.ms).toBe(2000);
    timers[1]!.fn();
    expect(channels).toHaveLength(3);
    channels[2]!.status("SUBSCRIBED");
    expect(resyncs).toHaveLength(2); // gap-fill after every reconnect
    expect(statuses.filter((s) => s === "reconnecting").length).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1]).toBe("live");
  });

  it("close() stops everything: no retry, no late messages", () => {
    const { sub, channels, timers, messages, statuses } = setup();
    const ch = channels[0]!;
    ch.status("CLOSED");
    sub.close();
    expect(timers).toHaveLength(0);
    expect(ch.unsubscribed).toBe(true);
    ch.emit(row("m9", "late"));
    expect(messages).toHaveLength(0);
    expect(statuses[statuses.length - 1]).toBe("closed");
  });
});
