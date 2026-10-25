'use client';

import type { ConversationView } from '@sp/types';
import { applyReadWatermark, mergeMessages, type ThreadMessage } from '@sp/profile-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/auth';
import { getMessagingClient, subscribeToConversation } from '../lib/messaging';
import { getSignedMediaUrl } from '../lib/profile';

import type { RichMessage } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { MessageDetails, RichComposer } from './message-tools';

type Bubble = ThreadMessage;

function Avatar({ name, url, size = 42 }: { name: string; url?: string; size?: number }) {
  if (url) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <img
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          src={url}
          alt={`${name}'s profile`}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await client.listConversations();
      setConversations(list);
      onUnread?.(list.reduce((n, c) => n + c.unreadCount, 0));
      const people = list.filter((c) => c.other.thumbnailPath);
      const pairs = await Promise.all(
        people.map(async (c) => {
          try {
            return [c.other.userId, await getSignedMediaUrl(c.other.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        }),
      );
      setPhotos(
        Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)),
      );
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
          list.some((c) => c.id === conversation.id) ? list : [conversation, ...list],
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

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredConversations = conversations.filter((c) =>
    c.other.displayName.toLocaleLowerCase().includes(normalizedSearch),
  );
  const openConversation = conversations.find((c) => c.id === openId) ?? null;

  return (
    <section aria-label="Messages" className="messages-page">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">SIDLE · CONVERSATIONS</span>
          <h1 style={{ margin: '2px 0 0' }}>Messages</h1>
          <div className="discover-philosophy" style={{ marginTop: 8 }}>
            <span>Text, photos, videos and voice messages with your connections.</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-state-card" aria-busy="true">
          <p className="muted" role="status">
            Loading your conversations…
          </p>
        </div>
      ) : (
        <div className="messages-layout">
          <div className="conversations-sidebar">
            <div className="conversations-head">
              <label className="sidle-sr-only" htmlFor="conversation-search">
                Search conversations
              </label>
              <input
                id="conversation-search"
                type="search"
                placeholder="Search conversations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                style={{ padding: '8px 12px', fontSize: '0.88rem', minHeight: 38 }}
              />
            </div>

            <ul className="conversations-list" aria-label="Conversation list">
              {filteredConversations.length === 0 ? (
                <li style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
                    {conversations.length === 0
                      ? 'No active conversations yet. Say hi to someone in Discover to connect!'
                      : 'No matching conversations found.'}
                  </p>
                  {normalizedSearch && conversations.length > 0 && (
                    <button type="button" className="link" onClick={() => setSearch('')}>
                      Clear search
                    </button>
                  )}
                </li>
              ) : (
                filteredConversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`conversation-item ${openId === c.id ? 'active' : ''}`}
                      onClick={() => setOpenId(c.id)}
                      aria-current={openId === c.id ? 'true' : undefined}
                      aria-label={`${c.other.displayName}${c.unreadCount ? `, ${c.unreadCount} unread message${c.unreadCount === 1 ? '' : 's'}` : ''}`}
                    >
                      <Avatar name={c.other.displayName} url={photos[c.other.userId]} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}
                          >
                            <span
                              style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text)' }}
                            >
                              {c.other.displayName}
                            </span>
                            {c.other.verificationLevel === 'student_verified' && (
                              <span
                                className="campus-badge-dot"
                                title="Academic email confirmed"
                                aria-label="Academic email confirmed"
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          {c.unreadCount > 0 && (
                            <span className="nav-badge" aria-hidden="true">
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                        <p
                          className="muted"
                          style={{
                            margin: '2px 0 0',
                            fontSize: '0.82rem',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {c.lastMessage ? c.lastMessage.body : 'Connected. Say hello!'}
                        </p>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

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
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 40,
                  textAlign: 'center',
                }}
              >
                <img
                  className="sidle-mark sidle-mark-empty"
                  src="/brand/sidle-mark.svg"
                  alt=""
                  aria-hidden="true"
                />
                <h2>Your Conversations</h2>
                <p className="muted" style={{ maxWidth: 400 }}>
                  Choose a conversation, or discover someone new when you feel like widening your
                  circle.
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
  const [status, setStatus] = useState<string>('connecting');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<Record<string, RichMessage>>({});
  const [replyTo, setReplyTo] = useState<{ id: string; body: string } | null>(null);

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
      // A transient resync failure should not discard the local thread. Realtime can retry later.
    }
  }, [client, conversation.id, merge]);

  const refreshDetails = useCallback(async () => {
    const ids = messages
      .filter((message) => !message.id.startsWith('local-'))
      .slice(-100)
      .map((message) => message.id);
    if (ids.length) {
      const values = await getPlatformClient().getMessageDetails(ids);
      setDetails(Object.fromEntries(values.map((value) => [value.id, value])));
    }
  }, [messages]);
  useEffect(() => {
    void refreshDetails().catch(() => undefined);
  }, [refreshDetails]);
  async function changed() {
    await refetchLatest();
    await refreshDetails();
  }

  useEffect(() => {
    setMessages([]);
    setError(null);
    void refetchLatest();
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (message) => {
        merge([{ ...message, read: false }]);
        if (message.senderId !== conversation.other.userId) return;
        void client.markRead(conversation.id);
      },
      onStatus: setStatus,
      onRead: (read) => {
        if (read.userId === conversation.other.userId) {
          setMessages((current) =>
            applyReadWatermark(current, conversation.other.userId, read.lastReadAt),
          );
        }
      },
      onResync: () => void refetchLatest(),
    });
    return () => sub.close();
  }, [conversation.id, conversation.other.userId, client, merge, refetchLatest]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    const el = scrollerRef.current;
    const previousHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    setError(null);
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
    } finally {
      setLoadingOlder(false);
    }
  }

  const realtimeLabel =
    status === 'live'
      ? 'Live updates connected'
      : status === 'connecting'
        ? 'Connecting live updates'
        : 'Live updates reconnecting';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={conversation.other.displayName} url={photo} size={42} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text)' }}>
                {conversation.other.displayName}
              </div>
              {conversation.other.verificationLevel === 'student_verified' && (
                <span className="campus-badge" title="Academic email confirmed">
                  ✓ Academic email
                </span>
              )}
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              role="status"
              aria-live="polite"
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: status === 'live' ? 'var(--success)' : 'var(--text-muted)',
                }}
              />
              <span className="muted" style={{ fontSize: '0.76rem' }}>
                {realtimeLabel}
              </span>
            </div>
          </div>
        </div>

        <button type="button" className="secondary compact" onClick={onBack}>
          Close
        </button>
      </div>

      {error && (
        <div className="notice err" role="alert" style={{ margin: '10px 16px 0' }}>
          <span>{error}</span>
        </div>
      )}

      <div
        className="chat-messages-scroll"
        ref={scrollerRef}
        aria-label={`Conversation with ${conversation.other.displayName}`}
      >
        {hasMore && (
          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              className="link"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              style={{ fontSize: '0.84rem' }}
            >
              {loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }} aria-hidden="true">
              👋
            </div>
            <h3 style={{ margin: 0 }}>Start the conversation</h3>
            <p className="muted" style={{ fontSize: '0.88rem', marginTop: 4 }}>
              Break the ice with something from their profile, campus life, or a shared interest.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId !== conversation.other.userId;
            return (
              <div key={message.id} className={`chat-bubble-row ${isMine ? 'mine' : 'theirs'}`}>
                <div className="chat-bubble">
                  <div>{details[message.id]?.deleted ? '[Message removed]' : message.body}</div>
                  {details[message.id] && (
                    <MessageDetails
                      message={details[message.id]!}
                      mine={isMine}
                      onReply={() => setReplyTo({ id: message.id, body: message.body })}
                      onChanged={changed}
                    />
                  )}
                  <span className="bubble-time">
                    {message.pending
                      ? 'Sending…'
                      : message.failed
                        ? 'Failed to send'
                        : new Date(message.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    {isMine &&
                      !message.pending &&
                      !message.failed &&
                      (message.read ? ' · Read' : ' · Sent')}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <RichComposer
        key={conversation.id}
        conversationId={conversation.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSent={changed}
      />
    </div>
  );
}
