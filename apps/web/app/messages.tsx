"use client";

import type { ConversationView, NotificationSettings } from "@sp/types";
import { applyReadWatermark, mergeMessages, newClientTag, type ThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getMessagingClient, subscribeToConversation } from "../lib/messaging";
import { getSignedMediaUrl } from "../lib/profile";

type Bubble = ThreadMessage;

function Avatar({ name, url, size = 42 }: { name: string; url?: string; size?: number }) {
  if (url) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
        <img style={{ width: "100%", height: "100%", objectFit: "cover" }} src={url} alt={`${name}'s profile`} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Messages({
  onUnread,
  openWithUserId,
  onOpened,
}: {
  onUnread?: (total: number) => void;
  openWithUserId?: string | null;
  onOpened?: () => void;
}) {
  const client = getMessagingClient();
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, s] = await Promise.all([client.listConversations(), client.getNotificationSettings()]);
      setConversations(list);
      setSettings(s);
      onUnread?.(list.reduce((n, c) => n + c.unreadCount, 0));
      const people = list.filter((c) => c.other.thumbnailPath);
      const pairs = await Promise.all(
        people.map(async (c) => {
          try {
            return [c.other.userId, await getSignedMediaUrl(c.other.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        })
      );
      setPhotos(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, onUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  useEffect(() => {
    if (!openWithUserId) return;
    let cancelled = false;
    (async () => {
      try {
        const conversation = await client.openConversation(openWithUserId);
        if (cancelled) return;
        setConversations((list) =>
          list.some((c) => c.id === conversation.id) ? list : [conversation, ...list]
        );
        setOpenId(conversation.id);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) onOpenedRef.current?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openWithUserId, client]);

  async function toggleSetting(key: keyof NotificationSettings, value: boolean) {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      await client.setNotificationSettings(next);
    } catch (err) {
      setSettings(settings);
      setError(errorMessage(err));
    }
  }

  const filteredConversations = conversations.filter((c) =>
    c.other.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const openConversation = conversations.find((c) => c.id === openId) ?? null;

  return (
    <section aria-label="Messages" className="messages-page">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ SECURE CONVERSATIONS</span>
          <h1 style={{ margin: "2px 0 0" }}>Messages</h1>
          <div className="discover-philosophy" style={{ marginTop: 8 }}>
            <span>Direct, end-to-end authenticated conversations with verified connections.</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {loading ? (
        <div className="empty-state-card">
          <p className="muted">Loading your conversations…</p>
        </div>
      ) : (
        <div className="messages-layout">
          {/* Left Pane: Conversations List */}
          <div className="conversations-sidebar">
            <div className="conversations-head">
              <input
                type="text"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ padding: "8px 12px", fontSize: "0.88rem", minHeight: 38 }}
              />
            </div>

            <ul className="conversations-list">
              {filteredConversations.length === 0 ? (
                <li style={{ padding: "32px 16px", textAlign: "center" }}>
                  <p className="muted" style={{ fontSize: "0.88rem", margin: 0 }}>
                    {conversations.length === 0
                      ? "No active conversations yet. Say hi to someone in Discover to connect!"
                      : "No matching conversations found."}
                  </p>
                </li>
              ) : (
                filteredConversations.map((c) => (
                  <li
                    key={c.id}
                    className={`conversation-item ${openId === c.id ? "active" : ""}`}
                    onClick={() => setOpenId(c.id)}
                  >
                    <Avatar
                      name={c.other.displayName}
                      url={photos[c.other.userId]}
                      size={44}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 650, fontSize: "0.92rem", color: "var(--text)" }}>
                          {c.other.displayName}
                        </span>
                        {c.unreadCount > 0 && <span className="nav-badge">{c.unreadCount}</span>}
                      </div>
                      <p
                        className="muted"
                        style={{
                          margin: "2px 0 0",
                          fontSize: "0.82rem",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.lastMessage ? c.lastMessage.body : "Connected. Say hello!"}
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>

            {/* Notification settings toggle strip */}
            {settings && (
              <div style={{ padding: 14, borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
                <span className="eyebrow" style={{ fontSize: "0.7rem", marginBottom: 6 }}>NOTIFICATIONS</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "0.82rem" }}>
                    <span>New message alerts</span>
                    <input
                      type="checkbox"
                      checked={settings.messages}
                      onChange={(e) => void toggleSetting("messages", e.target.checked)}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "0.82rem" }}>
                    <span>When someone says hi</span>
                    <input
                      type="checkbox"
                      checked={settings.connectionRequests}
                      onChange={(e) => void toggleSetting("connectionRequests", e.target.checked)}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Right Pane: Active Chat Thread or Welcome Placeholder */}
          <div className="chat-thread-pane">
            {openConversation ? (
              <Thread
                conversation={openConversation}
                photo={photos[openConversation.other.userId]}
                onBack={() => {
                  setOpenId(null);
                  void load();
                }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 40,
                  textAlign: "center",
                }}
              >
                <div className="brand-mark-glow" style={{ width: 56, height: 56, fontSize: "1.75rem", marginBottom: 16 }}>
                  💬
                </div>
                <h2>Your Conversations</h2>
                <p className="muted" style={{ maxWidth: 400 }}>
                  Select a chat on the left to start writing, or discover classmates to expand your circle.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Thread({
  conversation,
  photo,
  onBack,
}: {
  conversation: ConversationView;
  photo?: string;
  onBack: () => void;
}) {
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

  const merge = useCallback((incoming: Bubble[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      await client.markRead(conversation.id);
    } catch {
      /* transient */
    }
  }, [client, conversation.id, merge]);

  useEffect(() => {
    setMessages([]);
    void refetchLatest();
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (m) => {
        merge([{ ...m, read: false }]);
        if (m.senderId !== conversation.other.userId) return;
        void client.markRead(conversation.id);
      },
      onStatus: setStatus,
      onRead: (r) => {
        if (r.userId === conversation.other.userId) {
          setMessages((current) => applyReadWatermark(current, conversation.other.userId, r.lastReadAt));
        }
      },
      onResync: () => void refetchLatest(),
    });
    return () => sub.close();
  }, [conversation.id, conversation.other.userId, client, merge, refetchLatest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length]);

  async function loadOlder() {
    if (!nextCursor) return;
    const el = scrollerRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - previousHeight;
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function send(body: string, tag: string) {
    setSending(true);
    setError(null);
    try {
      const saved = await client.sendMessage(conversation.id, body, tag);
      merge([saved]);
      setDraft("");
    } catch (err) {
      setMessages((current) =>
        current.map((m) =>
          m.clientTag === tag && m.pending ? { ...m, pending: false, failed: true } : m
        )
      );
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((current) => [
      ...current,
      {
        id: `local-${tag}`,
        conversationId: conversation.id,
        senderId: "me",
        kind: "text",
        body,
        clientTag: tag,
        createdAt: new Date().toISOString(),
        read: false,
        pending: true,
      },
    ]);
    void send(body, tag);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Thread Header */}
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Avatar name={conversation.other.displayName} url={photo} size={42} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text)" }}>
              {conversation.other.displayName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: status === "live" ? "var(--success)" : "var(--text-muted)",
                }}
              />
              <span className="muted" style={{ fontSize: "0.76rem" }}>
                {status === "live" ? "Online · Real-time" : "Connected"}
              </span>
            </div>
          </div>
        </div>

        <button className="secondary compact" onClick={onBack}>
          Close
        </button>
      </div>

      {error && (
        <div className="notice err" role="alert" style={{ margin: "10px 16px 0" }}>
          <span>{error}</span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="chat-messages-scroll" ref={scrollerRef}>
        {hasMore && (
          <div style={{ textAlign: "center" }}>
            <button className="link" onClick={() => void loadOlder()} style={{ fontSize: "0.84rem" }}>
              Load earlier messages
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>👋</div>
            <h3 style={{ margin: 0 }}>Start the conversation</h3>
            <p className="muted" style={{ fontSize: "0.88rem", marginTop: 4 }}>
              Break the ice! Ask about campus, favorite tracks, or weekend plans.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMine = m.senderId !== conversation.other.userId;
            return (
              <div key={m.id} className={`chat-bubble-row ${isMine ? "mine" : "theirs"}`}>
                <div className="chat-bubble">
                  <div>{m.body}</div>
                  <span className="bubble-time">
                    {m.pending
                      ? "Sending…"
                      : m.failed
                      ? "Failed to send"
                      : new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {isMine && !m.pending && !m.failed && (m.read ? " · Read" : " · Sent")}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Chat Composer */}
      <form className="chat-composer" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${conversation.other.displayName}…`}
          maxLength={2000}
          aria-label="Write message"
          autoFocus
        />
        <button type="submit" disabled={sending || !draft.trim()} className="compact">
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
