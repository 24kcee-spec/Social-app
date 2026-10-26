import type { ConversationView } from '@sp/types';
import {
  applyReadWatermark,
  mergeMessages,
  newClientTag,
  type RichMessage,
  type ThreadMessage,
} from '@sp/profile-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { getPlatformClient } from './platformClient';
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
      onUnread?.(list.reduce((total, conversation) => total + conversation.unreadCount, 0));
      const pairs = await Promise.all(
        list
          .filter((conversation) => conversation.other.thumbnailPath)
          .map(async (conversation) => {
            try {
              return [
                conversation.other.userId,
                await getSignedMediaUrl(conversation.other.thumbnailPath!),
              ] as const;
            } catch {
              return null;
            }
          }),
      );
      setPhotos(
        Object.fromEntries(pairs.filter((pair): pair is readonly [string, string] => pair !== null)),
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
    void (async () => {
      try {
        const conversation = await client.openConversation(openWithUserId);
        if (cancelled) return;
        setConversations((current) =>
          current.some((item) => item.id === conversation.id)
            ? current
            : [conversation, ...current],
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
    if (conversations.some((conversation) => conversation.id === openConversationId))
      setOpenId(openConversationId);
    else setError('That conversation is no longer available to this account.');
    onPushOpened?.();
  }, [openConversationId, loading, conversations, onPushOpened]);

  const open = conversations.find((conversation) => conversation.id === openId) ?? null;
  if (open)
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
          {conversations.map((conversation) => {
            const hasUnread = conversation.unreadCount > 0;
            return (
              <Pressable
                key={conversation.id}
                accessibilityRole="button"
                accessibilityLabel={`Conversation with ${conversation.other.displayName}${hasUnread ? `, ${conversation.unreadCount} unread` : ''}`}
                onPress={() => setOpenId(conversation.id)}
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
                  <Avatar
                    name={conversation.other.displayName}
                    url={photos[conversation.other.userId]}
                    size="md"
                  />
                  <View style={{ flex: 1, marginLeft: space[3] }}>
                    <View style={styles.convoTop}>
                      <View style={styles.nameRow}>
                        <Text
                          style={[
                            styles.convoName,
                            { color: colors.text, fontSize: type.bodyStrong.size },
                          ]}
                        >
                          {conversation.other.displayName}
                        </Text>
                        {conversation.other.verificationLevel === 'student_verified' ? (
                          <Badge label="✓ Campus" tone="success" compact />
                        ) : conversation.other.verificationLevel === 'trusted' ? (
                          <Badge label="✓" tone="accent" compact />
                        ) : null}
                      </View>
                      {hasUnread ? <Badge count={conversation.unreadCount} tone="accent" compact /> : null}
                    </View>
                    <Text
                      style={[
                        styles.convoPreview,
                        {
                          color: hasUnread ? colors.text : colors.textMuted,
                          fontWeight: hasUnread ? '600' : '400',
                          fontSize: type.small.size,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {conversation.lastMessage?.body ?? 'Say hello.'}
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
  const platformClient = getPlatformClient();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [details, setDetails] = useState<Record<string, RichMessage>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('connecting');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [replyTo, setReplyTo] = useState<ThreadMessage | null>(null);
  const [editing, setEditing] = useState<ThreadMessage | null>(null);
  const [editText, setEditText] = useState('');
  const scroller = useRef<ScrollView>(null);
  const followLatest = useRef(true);
  const [newMessages, setNewMessages] = useState(false);

  const merge = useCallback((incoming: ThreadMessage[]) => {
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  const loadDetails = useCallback(
    async (items: ThreadMessage[]) => {
      const ids = [...new Set(items.filter((item) => !item.id.startsWith('local-')).map((item) => item.id))];
      if (ids.length === 0) return;
      try {
        const rich = await platformClient.getMessageDetails(ids);
        setDetails((current) => ({
          ...current,
          ...Object.fromEntries(rich.map((item) => [item.id, item])),
        }));
      } catch {
        // Rich metadata is additive. Plain messages remain usable if this request is transiently unavailable.
      }
    },
    [platformClient],
  );

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      merge(page.messages);
      void loadDetails(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      if (AppState.currentState === 'active' && followLatest.current)
        await client.markRead(conversation.id);
    } catch {
      // Realtime resync and foregrounding retry this path.
    }
  }, [client, conversation.id, loadDetails, merge]);

  useEffect(() => {
    setMessages([]);
    setDetails({});
    setReplyTo(null);
    setEditing(null);
    void refetchLatest();
    const subscription = subscribeToConversation(conversation.id, {
      onMessage: (message) => {
        const incoming = { ...message, read: false };
        merge([incoming]);
        void loadDetails([incoming]);
        if (!followLatest.current) setNewMessages(true);
        if (
          AppState.currentState === 'active' &&
          followLatest.current &&
          message.senderId === conversation.other.userId
        )
          void client.markRead(conversation.id).catch(() => undefined);
      },
      onStatus: setStatus,
      onRead: (receipt) => {
        if (receipt.userId === conversation.other.userId)
          setMessages((current) =>
            applyReadWatermark(current, conversation.other.userId, receipt.lastReadAt),
          );
      },
      onResync: () => void refetchLatest(),
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetchLatest();
    });
    return () => {
      subscription.close();
      foreground.remove();
    };
  }, [client, conversation.id, conversation.other.userId, loadDetails, merge, refetchLatest]);

  async function loadOlder() {
    if (!nextCursor) return;
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      merge(page.messages);
      void loadDetails(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function sendPlain(body: string, tag: string) {
    setSending(true);
    setError(null);
    try {
      const sent = await client.sendMessage(conversation.id, body, tag);
      merge([sent]);
      void loadDetails([sent]);
      setDraft('');
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          message.clientTag === tag && message.pending
            ? { ...message, pending: false, failed: true }
            : message,
        ),
      );
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function sendReply(body: string, repliedTo: ThreadMessage, tag: string) {
    setSending(true);
    setError(null);
    try {
      await platformClient.sendRichMessage({
        conversationId: conversation.id,
        clientId: tag,
        body,
        replyTo: repliedTo.id,
      });
      setDraft('');
      setReplyTo(null);
      await refetchLatest();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    if (replyTo) {
      void sendReply(body, replyTo, tag);
      return;
    }
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
    void sendPlain(body, tag);
  }

  async function react(message: ThreadMessage) {
    const detail = details[message.id];
    const loved = detail?.reactions.some((reaction) => reaction.mine && reaction.reaction === 'love');
    setBusyMessageId(message.id);
    setError(null);
    try {
      await platformClient.reactMessage(message.id, loved ? null : 'love');
      await loadDetails([message]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyMessageId(null);
    }
  }

  async function saveEdit() {
    if (!editing || !editText.trim()) return;
    setBusyMessageId(editing.id);
    setError(null);
    try {
      await platformClient.editMessage(editing.id, editText.trim());
      setEditing(null);
      setEditText('');
      await refetchLatest();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyMessageId(null);
    }
  }

  function remove(message: ThreadMessage) {
    Alert.alert('Remove message?', 'This removes the message for everyone in this conversation.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setBusyMessageId(message.id);
          setError(null);
          void platformClient
            .deleteMessage(message.id)
            .then(async () => {
              await loadDetails([message]);
              await refetchLatest();
            })
            .catch((err) => setError(errorMessage(err)))
            .finally(() => setBusyMessageId(null));
        },
      },
    ]);
  }

  const visibleMessages = useMemo(
    () => messages.map((message) => ({ message, detail: details[message.id] })),
    [details, messages],
  );

  return (
    <KeyboardAvoidingView
      style={styles.threadContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
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
            <View style={styles.nameRow}>
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
      {newMessages ? (
        <Button
          label="New messages ↓"
          onPress={() => {
            followLatest.current = true;
            setNewMessages(false);
            scroller.current?.scrollToEnd({ animated: true });
          }}
        />
      ) : null}

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
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={100}
        onScroll={({ nativeEvent: event }) => {
          followLatest.current =
            event.contentSize.height - event.contentOffset.y - event.layoutMeasurement.height < 100;
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

        {visibleMessages.map(({ message, detail }) => {
          const theirs = message.senderId === conversation.other.userId;
          const mine = !theirs;
          const mediaUri = message.mediaThumbUrl || message.mediaUrl;
          const deleted = detail?.deleted === true;
          const busy = busyMessageId === message.id;
          return (
            <View key={message.id} style={[styles.bubbleWrap, theirs ? styles.left : styles.right]}>
              <View
                style={[
                  styles.bubble,
                  {
                    borderRadius: radius.md,
                    paddingVertical: space[2],
                    paddingHorizontal: space[3],
                    backgroundColor: theirs ? colors.surface : colors.accent,
                    borderColor: theirs ? colors.line : colors.accent,
                  },
                  message.pending && styles.pendingBubble,
                  message.failed && { backgroundColor: colors.danger, borderColor: colors.danger },
                ]}
              >
                {detail?.replyBody ? (
                  <View style={[styles.replyPreview, { borderColor: theirs ? colors.lineStrong : colors.accentLine }]}>
                    <Text
                      numberOfLines={2}
                      style={{ color: theirs ? colors.textMuted : colors.onAccent, fontSize: 11 }}
                    >
                      {detail.replyBody}
                    </Text>
                  </View>
                ) : null}
                {mediaUri && !deleted ? (
                  <Image
                    source={{ uri: mediaUri }}
                    style={styles.messageImage}
                    resizeMode="cover"
                    accessibilityLabel="Message attachment"
                  />
                ) : null}
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color: theirs ? colors.text : colors.onAccent,
                      fontSize: type.body.size - 1,
                      fontStyle: deleted ? 'italic' : 'normal',
                    },
                  ]}
                >
                  {deleted ? 'Message removed' : message.body}
                </Text>
                <Text style={[styles.meta, { color: theirs ? colors.textMuted : colors.accentLine }]}>
                  {message.pending
                    ? 'Sending…'
                    : message.failed
                      ? 'Not sent'
                      : new Date(message.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  {detail?.editedAt && !deleted ? ' · Edited' : ''}
                  {mine && !message.pending && !message.failed && message.read ? ' · Read' : ''}
                </Text>
                {detail?.reactions.length && !deleted ? (
                  <View style={styles.reactionRow}>
                    {detail.reactions.map((reaction) => (
                      <Pressable
                        key={reaction.reaction}
                        accessibilityRole="button"
                        accessibilityState={{ selected: reaction.mine, disabled: busy }}
                        accessibilityLabel={`${reaction.reaction}, ${reaction.count} reactions`}
                        disabled={busy}
                        onPress={() => void react(message)}
                        style={styles.reactionChip}
                      >
                        <Text style={{ color: theirs ? colors.text : colors.onAccent }}>
                          ♥ {reaction.count}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {message.failed ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setMessages((current) => current.filter((item) => item.id !== message.id));
                      setMessages((current) => [
                        ...current,
                        { ...message, failed: false, pending: true },
                      ]);
                      void sendPlain(message.body, message.clientTag);
                    }}
                    style={{ marginTop: 4 }}
                  >
                    <Text style={{ color: colors.onAccent, fontWeight: '700', fontSize: 13 }}>
                      Retry
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              {!message.pending && !message.failed && !deleted ? (
                <View style={[styles.actionRow, mine ? styles.actionRight : styles.actionLeft]}>
                  <Action
                    label="Reply"
                    disabled={busy}
                    onPress={() => {
                      setReplyTo(message);
                      setEditing(null);
                    }}
                  />
                  <Action label="♥" disabled={busy} onPress={() => void react(message)} />
                  {mine ? (
                    <>
                      <Action
                        label="Edit"
                        disabled={busy}
                        onPress={() => {
                          setEditing(message);
                          setEditText(message.body);
                          setReplyTo(null);
                        }}
                      />
                      <Action label="Remove" disabled={busy} onPress={() => remove(message)} danger />
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {editing ? (
        <View style={[styles.contextBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.contextTitle, { color: colors.text }]}>Edit message</Text>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            maxLength={2000}
            multiline
            accessibilityLabel="Replacement message text"
            style={[
              styles.editInput,
              { color: colors.text, borderColor: colors.lineStrong, backgroundColor: colors.surfaceSunken },
            ]}
          />
          <View style={styles.contextActions}>
            <Button
              label="Save"
              compact
              onPress={() => void saveEdit()}
              disabled={!editText.trim() || busyMessageId === editing.id}
            />
            <Button
              label="Cancel"
              secondary
              compact
              onPress={() => {
                setEditing(null);
                setEditText('');
              }}
            />
          </View>
          <Text style={[styles.contextHint, { color: colors.textMuted }]}>
            Sent messages can be edited for 15 minutes.
          </Text>
        </View>
      ) : replyTo ? (
        <View style={[styles.contextBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.contextTitle, { color: colors.text }]}>Replying to</Text>
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
              {replyTo.body}
            </Text>
          </View>
          <Button label="Cancel" secondary compact onPress={() => setReplyTo(null)} />
        </View>
      ) : null}

      {!editing ? (
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
            placeholder={replyTo ? 'Write a reply…' : 'Write a message…'}
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
      ) : null}

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

function Action({
  label,
  onPress,
  disabled,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '♥' ? 'React with love' : label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      <Text style={{ color: danger ? colors.danger : colors.textMuted, fontSize: 11, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
  card: { borderWidth: 1 },
  muted: { fontSize: 13, lineHeight: 18 },
  loaderWrap: { paddingVertical: 48, alignItems: 'center' },
  conversationRow: { flexDirection: 'row', alignItems: 'center' },
  convoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  convoName: { fontWeight: '700' },
  convoPreview: { lineHeight: 18, marginTop: 2 },
  threadContainer: { flex: 1 },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    marginBottom: 8,
  },
  topbarCenter: { flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 },
  threadName: { fontWeight: '700' },
  statusText: { fontSize: 11, fontWeight: '500' },
  flagBtn: { padding: 6 },
  flagText: { fontSize: 16 },
  chat: { maxHeight: 460, minHeight: 280, borderWidth: 1 },
  bubbleWrap: { marginVertical: 4 },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  bubble: { maxWidth: '82%', borderWidth: 1 },
  bubbleText: { lineHeight: 20 },
  pendingBubble: { opacity: 0.6 },
  meta: { fontSize: 10, marginTop: 3, alignSelf: 'flex-end' },
  replyPreview: { borderLeftWidth: 2, paddingLeft: 7, marginBottom: 6 },
  messageImage: { width: 220, height: 160, borderRadius: 10, marginBottom: 6 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  reactionChip: { paddingVertical: 2, paddingHorizontal: 5 },
  actionRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 8, paddingTop: 3 },
  actionLeft: { justifyContent: 'flex-start' },
  actionRight: { justifyContent: 'flex-end' },
  action: { minHeight: 26, justifyContent: 'center' },
  contextBar: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  contextTitle: { fontWeight: '700', fontSize: 12 },
  contextHint: { width: '100%', fontSize: 11 },
  contextActions: { flexDirection: 'row', gap: 6 },
  editInput: { flex: 1, minWidth: 160, minHeight: 40, borderWidth: 1, borderRadius: 8, padding: 8 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, fontSize: 15 },
});
