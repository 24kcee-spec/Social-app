import type { EventMessage, MessageView } from "@sp/types";

/** A message as shown in a thread: server messages plus local optimistic bubbles. */
export type ThreadMessage = MessageView & { pending?: boolean; failed?: boolean };

function compare(a: ThreadMessage, b: ThreadMessage): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merges server messages (API pages or Realtime events, in any order, any number of times) into a thread.
 * - Deduplicates by message id, so replays and double-delivered events are harmless.
 * - A server copy replaces the local pending/failed bubble with the same clientTag (no double bubble).
 * - A copy that says `read: false` never downgrades one already known to be read (Realtime rows carry no read state).
 * - Output is always oldest-first with (createdAt, id) as the deterministic tie-break.
 */
export function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    for (const [key, existing] of byId) {
      if (existing.id !== m.id && (existing.pending || existing.failed) && existing.clientTag === m.clientTag) byId.delete(key);
    }
    const known = byId.get(m.id);
    byId.set(m.id, known ? { ...m, read: known.read || m.read } : m);
  }
  return [...byId.values()].sort(compare);
}

/** The other person's read watermark moved: everything of mine up to it is now read. Returns the same array if nothing changed. */
export function applyReadWatermark(messages: ThreadMessage[], otherUserId: string, lastReadAt: string): ThreadMessage[] {
  const limit = new Date(lastReadAt).getTime();
  if (Number.isNaN(limit)) return messages;
  let changed = false;
  const next = messages.map((m) => {
    if (m.senderId === otherUserId || m.pending || m.failed || m.read || new Date(m.createdAt).getTime() > limit) return m;
    changed = true;
    return { ...m, read: true };
  });
  return changed ? next : messages;
}

/** An event-chat message as shown in a thread: server messages plus local optimistic bubbles. */
export type EventThreadMessage = EventMessage & { pending?: boolean; failed?: boolean };

/**
 * Same guarantees as mergeMessages for the event chat (which is polled, not streamed): dedupe by id,
 * a server copy replaces the local pending/failed bubble with the same clientTag, stable (createdAt, id) order.
 */
export function mergeEventMessages(current: EventThreadMessage[], incoming: EventThreadMessage[]): EventThreadMessage[] {
  const byId = new Map<string, EventThreadMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    for (const [key, existing] of byId) {
      if (existing.id !== m.id && (existing.pending || existing.failed) && existing.clientTag === m.clientTag) byId.delete(key);
    }
    byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
