"use client";

import type { ConversationView, NotificationSettings } from "@sp/types";
import { applyReadWatermark, mergeMessages, newClientTag, type ThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getMessagingClient, subscribeToConversation } from "../lib/messaging";
import { getSignedMediaUrl } from "../lib/profile";

type Bubble = ThreadMessage;

function Avatar({ name, url }: { name: string; url?: string }) {
  return url ? <img className="avatar small" src={url} alt={`${name}'s profile`} /> : <div className="avatar small placeholder" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</div>;
}

/** Conversation list + thread. Realtime keeps the open thread live; a resync after every reconnect closes any gap. */
export function Messages({ onUnread, openWithUserId, onOpened }: { onUnread?: (total: number) => void; openWithUserId?: string | null; onOpened?: () => void }) {
  const client = getMessagingClient();
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, s] = await Promise.all([client.listConversations(), client.getNotificationSettings()]);
      setConversations(list);
      setSettings(s);
      onUnread?.(list.reduce((n, c) => n + c.unreadCount, 0));
      const people = list.filter((c) => c.other.thumbnailPath);
      const pairs = await Promise.all(people.map(async (c) => { try { return [c.other.userId, await getSignedMediaUrl(c.other.thumbnailPath!)] as const; } catch { return null; } }));
      setPhotos(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, onUnread]);
  useEffect(() => { void load(); }, [load]);

  // "Message" on a connection: open (or reuse) the direct conversation, then show the thread.
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  useEffect(() => {
    if (!openWithUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const conversation = await client.openConversation(openWithUserId);
        if (cancelled) return;
        setConversations((list) => (list.some((c) => c.id === conversation.id) ? list : [conversation, ...list]));
        setOpenId(conversation.id);
      } catch (err) { if (!cancelled) setError(errorMessage(err)); }
      finally { if (!cancelled) onOpenedRef.current?.(); }
    })();
    return () => { cancelled = true; };
  }, [openWithUserId, client]);

  async function toggleSetting(key: keyof NotificationSettings, value: boolean) {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try { await client.setNotificationSettings(next); } catch (err) { setSettings(settings); setError(errorMessage(err)); }
  }

  const open = conversations.find((c) => c.id === openId) ?? null;
  if (open) return <Thread conversation={open} photo={photos[open.other.userId]} onBack={() => { setOpenId(null); void load(); }} />;

  return <section aria-label="Messages">
    {error && <div className="notice err" role="alert">{error} <button className="link" onClick={() => void load()}>Try again</button></div>}
    {settings && <div className="card">
      <h2>Notifications</h2>
      <label className="check"><input type="checkbox" checked={settings.messages} onChange={(e) => void toggleSetting("messages", e.target.checked)} /> <span><strong>New messages</strong><br /><span className="muted">A gentle nudge when someone writes to you.</span></span></label>
      <label className="check"><input type="checkbox" checked={settings.connectionRequests} onChange={(e) => void toggleSetting("connectionRequests", e.target.checked)} /> <span><strong>Someone says hi</strong><br /><span className="muted">When someone new would like to connect.</span></span></label>
    </div>}
    {loading ? <div className="card skeleton" aria-busy="true" /> : conversations.length === 0
      ? <div className="card"><p className="muted">No conversations yet. Connect with someone from Discover, and you can write to each other here.</p></div>
      : conversations.map((c) => <button key={c.id} className="card conv-item" onClick={() => setOpenId(c.id)}>
        <div className="person-head"><Avatar name={c.other.displayName} url={photos[c.other.userId]} />
          <div className="conv-body">
            <h3>{c.other.displayName} {c.unreadCount > 0 && <span className="tag">{c.unreadCount}</span>}</h3>
            <p className="muted conv-preview">{c.lastMessage ? c.lastMessage.body : "Say hello."}</p>
          </div>
        </div>
      </button>)}
  </section>;
}

function Thread({ conversation, photo, onBack }: { conversation: ConversationView; photo?: string; onBack: () => void }) {
  const client = getMessagingClient();
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<string>("connecting");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  /** Shared, tested merge: dedupe by id, optimistic bubbles replaced by clientTag, deterministic order. */
  const merge = useCallback((incoming: Bubble[]) => { setMessages((current) => mergeMessages(current, incoming)); }, []);

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      await client.markRead(conversation.id);
    } catch { /* transient; realtime resync will retry */ }
  }, [client, conversation.id, merge]);

  useEffect(() => {
    setMessages([]);
    void refetchLatest();
    // Live stream: new messages arrive via Supabase Realtime; after any reconnect we refetch the
    // latest page so a dropped socket can never silently lose a message.
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (m) => {
        merge([{ ...m, read: false }]);
        if (m.senderId !== conversation.other.userId) return;
        void client.markRead(conversation.id);
      },
      onStatus: setStatus,
      onRead: (r) => { if (r.userId === conversation.other.userId) setMessages((current) => applyReadWatermark(current, conversation.other.userId, r.lastReadAt)); },
      onResync: () => void refetchLatest(),
    });
    return () => sub.close();
  }, [conversation.id, conversation.other.userId, client, merge, refetchLatest]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function loadOlder() {
    if (!nextCursor) return;
    const el = scrollerRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - previousHeight; });
    } catch (err) { setError(errorMessage(err)); }
  }

  async function send(body: string, tag: string) {
    setSending(true); setError(null);
    try {
      const saved = await client.sendMessage(conversation.id, body, tag);
      merge([saved]);
      setDraft("");
    } catch (err) {
      setMessages((current) => current.map((m) => m.clientTag === tag && m.pending ? { ...m, pending: false, failed: true } : m));
      setError(errorMessage(err));
    } finally { setSending(false); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((current) => [...current, { id: `local-${tag}`, conversationId: conversation.id, senderId: "me", kind: "text", body, clientTag: tag, createdAt: new Date().toISOString(), read: false, pending: true }]);
    void send(body, tag);
  }

  return <section aria-label={`Conversation with ${conversation.other.displayName}`}>
    <div className="topbar">
      <div className="person-head"><Avatar name={conversation.other.displayName} url={photo} />
        <div><h2>{conversation.other.displayName}</h2>
          <p className="muted">{status === "live" ? "Connected" : status === "closed" ? "Offline" : "Reconnecting…"}</p></div>
      </div>
      <button className="secondary compact" onClick={onBack}>All messages</button>
    </div>
    {error && <div className="notice err" role="alert">{error}</div>}
    <div className="card chat" ref={scrollerRef}>
      {hasMore && <button className="link" onClick={() => void loadOlder()}>Load older messages</button>}
      {messages.map((m) => <div key={m.id} className={`bubble-row ${m.senderId === conversation.other.userId ? "theirs" : "mine"}`}>
        <div className={`bubble ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
          <p>{m.body}</p>
          <span className="bubble-meta">
            {m.pending ? "Sending…" : m.failed ? "Not sent" : new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {m.senderId !== conversation.other.userId && !m.pending && !m.failed && m.read ? " · Read" : ""}
            {m.failed && <button className="link" onClick={() => { setMessages((c) => c.filter((x) => x.id !== m.id)); void send(m.body, m.clientTag); }}> Retry</button>}
          </span>
        </div>
      </div>)}
      <div ref={bottomRef} />
    </div>
    <form className="composer" onSubmit={submit}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a message…" maxLength={2000} aria-label="Message" />
      <button type="submit" disabled={sending || !draft.trim()}>Send</button>
    </form>
  </section>;
}
