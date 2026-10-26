'use client';

import type { ConversationView } from '@sp/types';
import { applyReadWatermark, mergeMessages, type ThreadMessage } from '@sp/profile-client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/auth';
import { getMessagingClient, subscribeToConversation } from '../lib/messaging';
import { getSignedMediaUrl } from '../lib/profile';
import { dayLabel, nearLatest, type OutgoingMessage } from '../lib/chat-state';
import { MemberActions } from './member-actions';
import { ConversationTools } from './conversation-tools';

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
  const [openId, setOpenId] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('conversation'),
  );
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
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
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [client, onUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && navigator.onLine) void load();
    };
    const timer = setInterval(refresh, 15_000);
    window.addEventListener('sidle:messages-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('sidle:messages-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
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
        <div className={`messages-layout ${openConversation ? 'has-open-thread' : ''}`}>
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
                key={openConversation.id}
                conversation={openConversation}
                photo={photos[openConversation.other.userId]}
                onChanged={load}
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
  onChanged,
}: {
  conversation: ConversationView;
  photo?: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const client = getMessagingClient();
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<string>('connecting');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingThread, setLoadingThread] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<Record<string, RichMessage>>({});
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const messagesRef = useRef<Bubble[]>([]);
  messagesRef.current = messages;
  const stickToBottom = useRef(true);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const [newMessages, setNewMessages] = useState(false);
  const [unreadDivider] = useState(conversation.unreadCount);
  const [firstUnread, setFirstUnread] = useState<string | null>(null);
  const initialNewest = useRef<string | null>(null);
  useEffect(() => {
    if (firstUnread || !unreadDivider || !initialNewest.current) return;
    const incoming = messages.filter(
      (message) =>
        message.senderId === conversation.other.userId &&
        message.createdAt <= initialNewest.current!,
    );
    if (incoming.length >= unreadDivider)
      setFirstUnread(incoming[incoming.length - unreadDivider]!.id);
  }, [messages, firstUnread, unreadDivider, conversation.other.userId]);
  const readInFlight = useRef(false);
  const markVisibleRead = useCallback(async () => {
    if (document.hidden || !document.hasFocus() || !stickToBottom.current || readInFlight.current)
      return;
    readInFlight.current = true;
    try {
      await client.markRead(conversation.id);
      void onChanged();
    } catch {
      /* A receipt failure does not hide loaded history. */
    } finally {
      readInFlight.current = false;
    }
  }, [client, conversation.id, onChanged]);
  const [replyTo, setReplyTo] = useState<{ id: string; body: string } | null>(null);
  useEffect(() => {
    const discard = (event: Event) =>
      setMessages((current) =>
        current.filter(
          (message) => message.id !== `local-${(event as CustomEvent<string>).detail}`,
        ),
      );
    window.addEventListener('sidle:discard-outgoing', discard);
    return () => window.removeEventListener('sidle:discard-outgoing', discard);
  }, []);

  const merge = useCallback((incoming: Bubble[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      if (!initialNewest.current && page.messages.length)
        initialNewest.current = page.messages.at(-1)!.createdAt;
      merge(page.messages);
      if (messagesRef.current.length <= 50) {
        setHasMore(page.hasMore);
        setNextCursor(page.nextCursor);
      }
      setError(null);
      // A delayed read receipt must not prevent loaded history from appearing.
      void markVisibleRead();
    } catch (err) {
      // A transient resync failure should not discard the local thread. Realtime can retry later.
      setError(errorMessage(err));
    } finally {
      setLoadingThread(false);
    }
  }, [client, conversation.id, merge, markVisibleRead]);

  const refreshDetails = useCallback(async (force = false) => {
    const ids = messagesRef.current
      .filter((message) => !message.id.startsWith('local-'))
      .filter((message) => force || !detailsRef.current[message.id])
      .map((message) => message.id);
    for (let offset = 0; offset < ids.length; offset += 100) {
      const values = await getPlatformClient().getMessageDetails(ids.slice(offset, offset + 100));
      setDetails((current) => ({
        ...current,
        ...Object.fromEntries(values.map((value) => [value.id, value])),
      }));
    }
  }, []);
  useEffect(() => {
    void refreshDetails().catch(() =>
      setError('Some message details could not be loaded. Try again.'),
    );
  }, [messages, refreshDetails]);
  const changed = useCallback(async () => {
    await refetchLatest();
    await refreshDetails(true);
    await onChanged();
    window.dispatchEvent(new Event('sidle:messages-changed'));
  }, [refetchLatest, refreshDetails, onChanged]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void changed().catch(() => setError('Updates were interrupted. Try again.'));
      }, 120);
    };
    void refetchLatest();
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (message) => {
        merge([{ ...message, read: false }]);
        if (!stickToBottom.current) setNewMessages(true);
        if (message.senderId === conversation.other.userId) void markVisibleRead();
        void onChanged();
      },
      onStatus: setStatus,
      onRead: (read) => {
        if (read.userId === conversation.other.userId)
          setMessages((current) =>
            applyReadWatermark(current, conversation.other.userId, read.lastReadAt),
          );
      },
      onChange: invalidate,
      onResync: invalidate,
    });
    const resume = () => {
      if (!document.hidden) {
        invalidate();
        void markVisibleRead();
      }
    };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      sub.close();
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [
    conversation.id,
    conversation.other.userId,
    client,
    merge,
    refetchLatest,
    changed,
    markVisibleRead,
    onChanged,
  ]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (olderAnchor.current) {
      el.scrollTop = olderAnchor.current.top + el.scrollHeight - olderAnchor.current.height;
      olderAnchor.current = null;
    } else if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, details, loadingThread]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    const el = scrollerRef.current;
    setLoadingOlder(true);
    setError(null);
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      if (el) olderAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }
  const jumpLatest = () => {
    stickToBottom.current = true;
    setNewMessages(false);
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    void markVisibleRead();
  };
  async function jumpReply(id: string) {
    try {
      if (!messagesRef.current.some((message) => message.id === id))
        merge([await getPlatformClient().lookupMessage(conversation.id, id)]);
      stickToBottom.current = false;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const element = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
          if (element) {
            element.tabIndex = -1;
            element.focus({ preventScroll: true });
            element.scrollIntoView({ block: 'center' });
          }
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const realtimeLabel =
    status === 'live'
      ? 'Live updates connected'
      : status === 'connecting'
        ? 'Connecting live updates'
        : 'Live updates reconnecting';

  return (
    <div className="chat-thread">
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
          <button type="button" className="link" onClick={() => void refetchLatest()}>
            Try again
          </button>
        </div>
      )}

      <details className="conversation-options">
        <summary>Conversation options</summary>
        <a href={`/u/${conversation.other.userId}`}>View profile</a>
        <MemberActions id={conversation.other.userId} name={conversation.other.displayName} />
        <ConversationTools id={conversation.id} onJump={jumpReply} />
      </details>
      <div
        onScroll={() => {
          const el = scrollerRef.current;
          if (el)
            stickToBottom.current = nearLatest(el.scrollTop, el.scrollHeight, el.clientHeight);
          if (stickToBottom.current) {
            setNewMessages(false);
            void markVisibleRead();
          }
        }}
        className="chat-messages-scroll"
        ref={scrollerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
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

        {loadingThread ? (
          <p className="muted chat-loading" role="status">
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
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
          messages.map((message, index) => {
            const isMine = message.senderId !== conversation.other.userId;
            const previous = messages[index - 1];
            const showDay =
              !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
            const grouped =
              previous &&
              previous.senderId === message.senderId &&
              !showDay &&
              Date.parse(message.createdAt) - Date.parse(previous.createdAt) < 180_000;
            return (
              <Fragment key={message.id}>
                {showDay && <div className="chat-date-divider">{dayLabel(message.createdAt)}</div>}
                {message.id === firstUnread && (
                  <div className="chat-unread-divider">Unread messages</div>
                )}
                <div
                  className={`chat-bubble-row ${isMine ? 'mine' : 'theirs'} ${grouped ? 'grouped' : ''}`}
                  aria-label={
                    isMine ? 'Message from you' : `Message from ${conversation.other.displayName}`
                  }
                  data-message-id={message.id}
                >
                  <div className="chat-bubble">
                    <span className="message-sender">
                      {isMine ? 'You' : conversation.other.displayName}
                    </span>
                    {details[message.id]?.replyTo && !details[message.id]?.deleted && (
                      <blockquote
                        className="message-quoted-reply"
                        onClick={() => void jumpReply(details[message.id]!.replyTo!)}
                      >
                        <button
                          className="link"
                          type="button"
                          aria-label="Jump to original message"
                        >
                          {details[message.id]?.replyBody ?? 'Earlier message'}
                        </button>
                      </blockquote>
                    )}
                    <div className="message-body">
                      {details[message.id]?.deleted ? 'Message removed' : message.body}
                    </div>
                    {details[message.id] && (
                      <MessageDetails
                        message={details[message.id]!}
                        mine={isMine}
                        body={message.body}
                        onReply={() => setReplyTo({ id: message.id, body: message.body })}
                        onChanged={changed}
                      />
                    )}
                    {message.failed && (
                      <button
                        className="link"
                        onClick={() => window.dispatchEvent(new Event('sidle:retry-message'))}
                      >
                        Retry message
                      </button>
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
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {newMessages && (
        <button className="chat-jump-latest" type="button" onClick={jumpLatest}>
          New messages ↓
        </button>
      )}
      <RichComposer
        key={conversation.id}
        conversationId={conversation.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onOutgoing={(item: OutgoingMessage | null) => {
          if (!item) return;
          stickToBottom.current = true;
          merge([
            {
              id: `local-${item.clientId}`,
              conversationId: item.conversationId,
              senderId: item.senderId,
              kind: 'text',
              body: item.body || 'Attachment',
              clientTag: item.clientId,
              createdAt: item.createdAt,
              pending: !item.failed,
              failed: item.failed,
              read: false,
            },
          ]);
        }}
        onSent={changed}
      />
    </div>
  );
}
