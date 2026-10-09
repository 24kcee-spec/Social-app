import { describe, expect, it } from "vitest";
import { applyReadWatermark, mergeMessages, type ThreadMessage } from "./thread";

const ME = "u-me";
const THEM = "u-them";
const msg = (id: string, createdAt: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id, conversationId: "c1", senderId: THEM, kind: "text", body: id, clientTag: "t-" + id, createdAt, read: false, ...extra,
});

describe("mergeMessages", () => {
  it("ignores duplicate events and page overlaps", () => {
    const a = msg("a", "2026-10-12T10:00:00.000Z");
    const once = mergeMessages([], [a]);
    expect(mergeMessages(once, [a, a])).toHaveLength(1);
    expect(mergeMessages(once, [{ ...a }])).toHaveLength(1);
  });

  it("keeps out-of-order arrivals sorted, with id as the tie-break for identical timestamps", () => {
    const t = "2026-10-12T10:00:00.000Z";
    const merged = mergeMessages([], [msg("c", "2026-10-12T10:00:02.000Z"), msg("b", t), msg("a", t), msg("d", "2026-10-12T09:59:59.000Z")]);
    expect(merged.map((m) => m.id)).toEqual(["d", "a", "b", "c"]);
    // Same set delivered in a different order gives the same thread.
    const other = mergeMessages([], [msg("a", t), msg("d", "2026-10-12T09:59:59.000Z"), msg("c", "2026-10-12T10:00:02.000Z"), msg("b", t)]);
    expect(other).toEqual(merged);
  });

  it("replaces the optimistic bubble when the server copy arrives, via Realtime or the API response, in either order", () => {
    const pending = msg("local-t1", "2026-10-12T10:00:00.000Z", { senderId: ME, clientTag: "t1", pending: true });
    const real = msg("srv-1", "2026-10-12T10:00:00.050Z", { senderId: ME, clientTag: "t1" });
    const first = mergeMessages([pending], [real]);
    expect(first.map((m) => m.id)).toEqual(["srv-1"]);
    // The API response arriving after the Realtime echo must not recreate a duplicate.
    expect(mergeMessages(first, [real]).map((m) => m.id)).toEqual(["srv-1"]);
  });

  it("also replaces a failed bubble that the server turns out to have stored (retry after a lost response)", () => {
    const failed = msg("local-t2", "2026-10-12T10:00:00.000Z", { senderId: ME, clientTag: "t2", failed: true });
    const real = msg("srv-2", "2026-10-12T10:00:01.000Z", { senderId: ME, clientTag: "t2" });
    expect(mergeMessages([failed], [real]).map((m) => m.id)).toEqual(["srv-2"]);
  });

  it("never downgrades a message that is already read", () => {
    const read = msg("a", "2026-10-12T10:00:00.000Z", { senderId: ME, read: true });
    expect(mergeMessages([read], [{ ...read, read: false }])[0]!.read).toBe(true);
  });
});

describe("applyReadWatermark", () => {
  it("marks only my earlier, settled messages as read", () => {
    const mine1 = msg("m1", "2026-10-12T10:00:00.000Z", { senderId: ME });
    const mine2 = msg("m2", "2026-10-12T10:05:00.000Z", { senderId: ME });
    const theirs = msg("t1", "2026-10-12T10:01:00.000Z", { senderId: THEM });
    const pending = msg("p", "2026-10-12T10:00:30.000Z", { senderId: ME, pending: true });
    const out = applyReadWatermark([mine1, theirs, pending, mine2], THEM, "2026-10-12T10:02:00.000Z");
    expect(out.map((m) => [m.id, m.read])).toEqual([["m1", true], ["t1", false], ["p", false], ["m2", false]]);
  });

  it("returns the same array when nothing changes and ignores a bad timestamp", () => {
    const list = [msg("m1", "2026-10-12T10:00:00.000Z", { senderId: ME })];
    expect(applyReadWatermark(list, THEM, "2026-10-12T09:00:00.000Z")).toBe(list);
    expect(applyReadWatermark(list, THEM, "garbage")).toBe(list);
  });
});

import { mergeEventMessages, type EventThreadMessage } from "./thread";
const ev = (id: string, createdAt: string, extra: Partial<EventThreadMessage> = {}): EventThreadMessage => ({ id, eventId: "e1", senderId: "u1", senderName: "Ann", body: id, clientTag: "t-" + id, createdAt, ...extra });

describe("mergeEventMessages", () => {
  it("dedupes polled pages, orders deterministically and swaps optimistic bubbles for the server copy", () => {
    const t = "2026-10-12T10:00:00.000Z";
    const pending = ev("local-x", t, { clientTag: "x", pending: true });
    const merged = mergeEventMessages([pending], [ev("b", t), ev("a", t), ev("srv-x", "2026-10-12T10:00:01.000Z", { clientTag: "x" })]);
    expect(merged.map((m) => m.id)).toEqual(["a", "b", "srv-x"]);
    expect(mergeEventMessages(merged, [ev("a", t), ev("b", t)])).toHaveLength(3);
  });
  it("keeps a failed bubble until the server confirms that exact message", () => {
    const failed = ev("local-y", "2026-10-12T10:00:00.000Z", { clientTag: "y", failed: true });
    expect(mergeEventMessages([failed], [ev("other", "2026-10-12T10:00:02.000Z")]).map((m) => m.id)).toEqual(["local-y", "other"]);
  });
});
