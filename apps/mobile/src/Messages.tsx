import type { ConversationView } from '@sp/types';
import {
  applyReadWatermark,
  mergeMessages,
  newClientTag,
  type ThreadMessage,
} from '@sp/profile-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { errorMessage } from './auth';
import { getMessagingClient, subscribeToConversation } from './messagingClient';
import { getSignedMediaUrl } from './profile';
import { useTheme } from './theme';
import { Avatar, Badge, Banner, Button, EmptyState, ReportSheet } from './ui';

export function Messages({
  onUnread,
  openWithUserId,
  openConversationId,
  onPushOpened,
  onOpened,
}: {
  onUnread?: (total: number) => void;
  openWithUserId?: string | null;
  openConversationId?: string | null;
  onPushOpened?: () => void;
  onOpened?: () => void;
}) {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getMessagingClient();

  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    if (!openConversationId || loading) return;
    if (conversations.some((c) => c.id === openConversationId)) setOpenId(openConversationId);
    else setError('That conversation is no longer available to this account.');
    onPushOpened?.();
  }, [openConversationId, loading, conversations, onPushOpened]);

  const open = conversations.find((c) => c.id === openId) ?? null;
  if (open) {
    return (
      <Thread
        conversation={open}
        photo={photos[open.other.userId]}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[3] }]}>
            Loading conversations…
          </Text>
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Go to Connections and tap Message next to someone you're connected with to begin a conversation."
          mark="✉"
        />
      ) : (
        <View style={{ marginTop: space[3] }}>
          {conversations.map((c) => {
            const hasUnread = c.unreadCount > 0;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={`Conversation with ${c.other.displayName}${hasUnread ? `, ${c.unreadCount} unread` : ''}`}
                onPress={() => setOpenId(c.id)}
                style={({ pressed }) => [
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: hasUnread ? colors.accentLine : colors.line,
                    borderRadius: radius.md,
                    padding: space[4],
                    marginTop: space[2],
                    opacity: pressed ? 0.85 : 1,
                  },
                  shadow[1],
                ]}
              >
                <View style={styles.conversationRow}>
                  <Avatar name={c.other.displayName} url={photos[c.other.userId]} size="md" />
                  <View style={{ flex: 1, marginLeft: space[3] }}>
                    <View style={styles.convoTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text
                          style={[
                            styles.convoName,
                            { color: colors.text, fontSize: type.bodyStrong.size },
                          ]}
                        >
                          {c.other.displayName}
                        </Text>
                        {c.other.verificationLevel === 'student_verified' ? (
                          <Badge label="✓ Campus" tone="success" compact />
                        ) : c.other.verificationLevel === 'trusted' ? (
                          <Badge label="✓" tone="accent" compact />
                        ) : null}
                      </View>
                      {hasUnread ? <Badge count={c.unreadCount} tone="accent" compact /> : null}
                    </View>
                    <Text
                      style={[
                        styles.convoPreview,
                        {
                          color: hasUnread ? colors.text : colors.textMuted,
                          fontWeight: hasUnread ? '600' : '400',
                          fontSize: type.small.size,
                          marginTop: 2,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {c.lastMessage ? c.lastMessage.body : 'Say hello.'}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
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
  const { colors, radius, space, type } = useTheme();
  const client = getMessagingClient();

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const followLatest = useRef(true);
  const [newMessages, setNewMessages] = useState(false);

  const merge = useCallback((incoming: ThreadMessage[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      if (AppState.currentState === 'active' && followLatest.current)
        await client.markRead(conversation.id);
    } catch {
      // transient; the next realtime resync retries
    }
  }, [client, conversation.id, merge]);

  useEffect(() => {
    setMessages([]);
    void refetchLatest();
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (msg) => {
        merge([{ ...msg, read: false }]);
        if (!followLatest.current) setNewMessages(true);
        if (
          AppState.currentState === 'active' &&
          followLatest.current &&
          msg.senderId === conversation.other.userId
        )
          void client.markRead(conversation.id).catch(() => undefined);
      },
      onStatus: setStatus,
      onRead: (r) => {
        if (r.userId === conversation.other.userId) {
          setMessages((current) =>
            applyReadWatermark(current, conversation.other.userId, r.lastReadAt),
          );
        }
      },
      onResync: () => void refetchLatest(),
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchLatest();
    });
    return () => {
      sub.close();
      foreground.remove();
    };
  }, [conversation.id, conversation.other.userId, client, merge, refetchLatest]);

  async function loadOlder() {
    if (!nextCursor) return;
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function send(body: string, tag: string) {
    setSending(true);
    setError(null);
    try {
      merge([await client.sendMessage(conversation.id, body, tag)]);
      setDraft('');
    } catch (err) {
      setMessages((current) =>
        current.map((x) =>
          x.clientTag === tag && x.pending ? { ...x, pending: false, failed: true } : x,
        ),
      );
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((current) => [
      ...current,
      {
        id: `local-${tag}`,
        conversationId: conversation.id,
        senderId: 'me',
        kind: 'text',
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
    <KeyboardAvoidingView
      style={styles.threadContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Thread Top Bar */}
      <View
        style={[
          styles.topbar,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[3],
          },
        ]}
      >
        <Button label="← All" secondary compact onPress={onBack} />
        <View style={styles.topbarCenter}>
          <Avatar name={conversation.other.displayName} url={photo} size="sm" />
          <View style={{ marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.threadName, { color: colors.text, fontSize: type.small.size }]}>
                {conversation.other.displayName}
              </Text>
              {conversation.other.verificationLevel === 'student_verified' ? (
                <Badge label="✓ Campus Verified" tone="success" compact />
              ) : conversation.other.verificationLevel === 'trusted' ? (
                <Badge label="✓ Verified" tone="accent" compact />
              ) : null}
            </View>
            <Text
              style={[
                styles.statusText,
                { color: status === 'live' ? colors.success : colors.textMuted },
              ]}
            >
              {status === 'live' ? 'Connected' : status === 'closed' ? 'Offline' : 'Reconnecting…'}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Report ${conversation.other.displayName}`}
          onPress={() => setReporting(true)}
          hitSlop={8}
          style={styles.flagBtn}
        >
          <Text style={[styles.flagText, { color: colors.textMuted }]}>⚑</Text>
        </Pressable>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {newMessages && (
        <Button
          label="New messages ↓"
          onPress={() => {
            followLatest.current = true;
            setNewMessages(false);
            scroller.current?.scrollToEnd({ animated: true });
          }}
        />
      )}
      {/* Messages Scroll Area */}
      <ScrollView
        ref={scroller}
        style={[
          styles.chat,
          {
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[3],
          },
        ]}
        scrollEventThrottle={100}
        onScroll={({ nativeEvent: e }) => {
          followLatest.current =
            e.contentSize.height - e.contentOffset.y - e.layoutMeasurement.height < 100;
          if (followLatest.current) setNewMessages(false);
        }}
        onContentSizeChange={() => {
          if (followLatest.current) scroller.current?.scrollToEnd({ animated: false });
        }}
      >
        {hasMore ? (
          <Button
            label="Load older messages"
            secondary
            compact
            onPress={() => void loadOlder()}
            style={{ alignSelf: 'center', marginBottom: space[3] }}
          />
        ) : null}

        {messages.map((x) => {
          const theirs = x.senderId === conversation.other.userId;
          const mediaUri = (x as any).mediaThumbUrl || (x as any).mediaUrl;
          return (
            <View key={x.id} style={[styles.bubbleRow, theirs ? styles.left : styles.right]}>
              <View
                style={[
                  styles.bubble,
                  {
                    borderRadius: radius.md,
                    paddingVertical: space[2],
                    paddingHorizontal: space[3],
                    backgroundColor: theirs ? colors.surface : colors.accent,
                    borderColor: theirs ? colors.line : colors.accent,
                    borderWidth: 1,
                  },
                  x.pending && styles.pendingBubble,
                  x.failed && { backgroundColor: colors.danger, borderColor: colors.danger },
                ]}
              >
                {mediaUri ? (
                  <Image
                    source={{ uri: mediaUri }}
                    style={{ width: 220, height: 160, borderRadius: 10, marginBottom: 6 }}
                    resizeMode="cover"
                  />
                ) : null}
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color: theirs ? colors.text : colors.onAccent,
                      fontSize: type.body.size - 1,
                    },
                  ]}
                >
                  {x.body}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    {
                      color: theirs ? colors.textMuted : colors.accentLine,
                    },
                  ]}
                >
                  {x.pending
                    ? 'Sending…'
                    : x.failed
                      ? 'Not sent'
                      : new Date(x.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  {!theirs && !x.pending && !x.failed && x.read ? ' · Read' : ''}
                </Text>

                {x.failed ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMessages((c) => c.filter((y) => y.id !== x.id));
                      setMessages((c) => [...c, { ...x, failed: false, pending: true }]);
                      void send(x.body, x.clientTag);
                    }}
                    style={{ marginTop: 4 }}
                  >
                    <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 13 }}>
                      Retry
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Message Composer */}
      <View style={[styles.composer, { marginTop: space[3] }]}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              color: colors.text,
              borderRadius: radius.sm,
              paddingHorizontal: space[3],
              paddingVertical: space[2],
            },
          ]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message…"
          placeholderTextColor={colors.textMuted}
          maxLength={2000}
          multiline
          accessibilityLabel="Message text"
        />

        <Button
          label={sending ? '…' : 'Send'}
          compact
          onPress={submit}
          disabled={sending || !draft.trim()}
          style={{ minWidth: 64 }}
        />
      </View>

      {/* Report Modal */}
      {reporting ? (
        <ReportSheet
          visible={reporting}
          targetType="profile"
          targetId={conversation.other.userId}
          targetLabel={conversation.other.displayName}
          onClose={() => setReporting(false)}
          onSuccess={() => {
            setReporting(false);
            onBack();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  card: {
    borderWidth: 1,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingName: {
    fontWeight: '600',
    fontSize: 15,
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
  },
  loaderWrap: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  convoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  convoName: {
    fontWeight: '700',
  },
  convoPreview: {
    lineHeight: 18,
  },
  threadContainer: {
    flex: 1,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    marginBottom: 8,
  },
  topbarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  threadName: {
    fontWeight: '700',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  flagBtn: {
    padding: 6,
  },
  flagText: {
    fontSize: 16,
  },
  chat: {
    maxHeight: 460,
    minHeight: 280,
    borderWidth: 1,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  left: {
    justifyContent: 'flex-start',
  },
  right: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
  },
  bubbleText: {
    lineHeight: 20,
  },
  pendingBubble: {
    opacity: 0.6,
  },
  meta: {
    fontSize: 10,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  attachBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    fontSize: 15,
  },
});
