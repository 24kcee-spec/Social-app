import type { ConversationView, NotificationSettings } from "@sp/types";
import { applyReadWatermark, mergeMessages, newClientTag, type ThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { errorMessage } from "./auth";
import { getMessagingClient, subscribeToConversation } from "./messagingClient";
import { getSignedMediaUrl } from "./profile";

function Avatar({ name, url }: { name: string; url?: string }) {
  return url ? <Image source={{ uri: url }} style={m.avatar} accessibilityLabel={`${name}'s profile`} /> : <View style={[m.avatar, m.ph]}><Text style={m.letter}>{name.slice(0, 1).toUpperCase()}</Text></View>;
}

/** Conversation list + thread. Same behaviour as web: Realtime keeps the open thread live, every reconnect refetches the latest page. */
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

  const toggle = async (key: keyof NotificationSettings, value: boolean) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try { await client.setNotificationSettings(next); } catch (err) { setSettings(settings); setError(errorMessage(err)); }
  };

  const open = conversations.find((c) => c.id === openId) ?? null;
  if (open) return <Thread conversation={open} photo={photos[open.other.userId]} onBack={() => { setOpenId(null); void load(); }} />;

  return <View>
    {error && <Text style={m.err} accessibilityRole="alert">{error}</Text>}
    {settings && <View style={m.card}>
      <Text style={m.h2}>Notifications</Text>
      <View style={m.row}><View style={{ flex: 1 }}><Text style={m.name}>New messages</Text><Text style={m.muted}>A gentle nudge when someone writes to you.</Text></View><Switch value={settings.messages} onValueChange={(v) => void toggle("messages", v)} accessibilityLabel="New message notifications" /></View>
      <View style={m.row}><View style={{ flex: 1 }}><Text style={m.name}>Someone says hi</Text><Text style={m.muted}>When someone new would like to connect.</Text></View><Switch value={settings.connectionRequests} onValueChange={(v) => void toggle("connectionRequests", v)} accessibilityLabel="Connection request notifications" /></View>
      <Text style={m.muted}>Push delivery to this phone is switched on in a later release; these choices are saved now.</Text>
    </View>}
    {loading ? <ActivityIndicator style={{ padding: 24 }} /> : conversations.length === 0
      ? <View style={m.card}><Text style={m.muted}>No conversations yet. Open Connections and tap Message next to someone you are connected with.</Text></View>
      : conversations.map((c) => <Pressable key={c.id} accessibilityRole="button" onPress={() => setOpenId(c.id)} style={m.card}>
        <View style={m.head}><Avatar name={c.other.displayName} url={photos[c.other.userId]} />
          <View style={{ flex: 1 }}>
            <Text style={m.name}>{c.other.displayName}{c.unreadCount > 0 ? `  (${c.unreadCount})` : ""}</Text>
            <Text style={m.muted} numberOfLines={1}>{c.lastMessage ? c.lastMessage.body : "Say hello."}</Text>
          </View>
        </View>
      </Pressable>)}
  </View>;
}

function Thread({ conversation, photo, onBack }: { conversation: ConversationView; photo?: string; onBack: () => void }) {
  const client = getMessagingClient();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("connecting");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollView>(null);

  const merge = useCallback((incoming: ThreadMessage[]) => { setMessages((current) => mergeMessages(current, incoming)); }, []);

  const refetchLatest = useCallback(async () => {
    try {
      const page = await client.listMessages(conversation.id, { limit: 50 });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      await client.markRead(conversation.id);
    } catch { /* transient; the next realtime resync retries */ }
  }, [client, conversation.id, merge]);

  useEffect(() => {
    setMessages([]);
    void refetchLatest();
    const sub = subscribeToConversation(conversation.id, {
      onMessage: (msg) => {
        merge([{ ...msg, read: false }]);
        if (msg.senderId === conversation.other.userId) void client.markRead(conversation.id).catch(() => undefined);
      },
      onStatus: setStatus,
      onRead: (r) => { if (r.userId === conversation.other.userId) setMessages((current) => applyReadWatermark(current, conversation.other.userId, r.lastReadAt)); },
      onResync: () => void refetchLatest(),
    });
    return () => sub.close();
  }, [conversation.id, conversation.other.userId, client, merge, refetchLatest]);

  async function loadOlder() {
    if (!nextCursor) return;
    try {
      const page = await client.listMessages(conversation.id, { limit: 50, before: nextCursor });
      merge(page.messages);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch (err) { setError(errorMessage(err)); }
  }

  async function send(body: string, tag: string) {
    setSending(true); setError(null);
    try {
      merge([await client.sendMessage(conversation.id, body, tag)]);
      setDraft("");
    } catch (err) {
      setMessages((current) => current.map((x) => (x.clientTag === tag && x.pending ? { ...x, pending: false, failed: true } : x)));
      setError(errorMessage(err));
    } finally { setSending(false); }
  }

  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((current) => [...current, { id: `local-${tag}`, conversationId: conversation.id, senderId: "me", kind: "text", body, clientTag: tag, createdAt: new Date().toISOString(), read: false, pending: true }]);
    void send(body, tag);
  }

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={m.topbar}>
      <View style={m.head}><Avatar name={conversation.other.displayName} url={photo} />
        <View><Text style={m.name}>{conversation.other.displayName}</Text><Text style={m.muted}>{status === "live" ? "Connected" : status === "closed" ? "Offline" : "Reconnecting…"}</Text></View>
      </View>
      <Pressable accessibilityRole="button" onPress={onBack} style={m.btn}><Text style={m.btnText}>All messages</Text></Pressable>
    </View>
    {error && <Text style={m.err} accessibilityRole="alert">{error}</Text>}
    <ScrollView ref={scroller} style={m.chat} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
      {hasMore && <Pressable accessibilityRole="button" onPress={() => void loadOlder()} style={m.more}><Text style={m.btnText}>Load older messages</Text></Pressable>}
      {messages.map((x) => {
        const theirs = x.senderId === conversation.other.userId;
        return <View key={x.id} style={[m.bubbleRow, theirs ? m.left : m.right]}>
          <View style={[m.bubble, theirs ? m.theirs : m.mine, x.pending && m.pendingBubble, x.failed && m.failedBubble]}>
            <Text style={theirs ? m.theirsText : m.mineText}>{x.body}</Text>
            <Text style={[m.meta, !theirs && m.metaMine]}>
              {x.pending ? "Sending…" : x.failed ? "Not sent" : new Date(x.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {!theirs && !x.pending && !x.failed && x.read ? " · Read" : ""}
            </Text>
            {x.failed && <Pressable accessibilityRole="button" onPress={() => { setMessages((c) => c.filter((y) => y.id !== x.id)); setMessages((c) => [...c, { ...x, failed: false, pending: true }]); void send(x.body, x.clientTag); }}><Text style={m.retry}>Retry</Text></Pressable>}
          </View>
        </View>;
      })}
    </ScrollView>
    <View style={m.composer}>
      <TextInput style={m.input} value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor="#8a94a6" maxLength={2000} multiline accessibilityLabel="Message" />
      <Pressable accessibilityRole="button" onPress={submit} disabled={sending || !draft.trim()} style={[m.send, (sending || !draft.trim()) && m.disabled]}><Text style={m.sendText}>Send</Text></Pressable>
    </View>
  </KeyboardAvoidingView>;
}

const m = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 14, marginTop: 12, backgroundColor: "#fff", gap: 8 },
  h2: { fontSize: 18, fontWeight: "700", color: "#152033" }, name: { fontSize: 16, fontWeight: "700", color: "#152033" }, muted: { fontSize: 14, color: "#667085" },
  err: { color: "#b42318", fontSize: 14, marginTop: 6 },
  head: { flexDirection: "row", gap: 12, alignItems: "center" }, row: { flexDirection: "row", gap: 10, alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eef2ff" }, ph: { alignItems: "center", justifyContent: "center" }, letter: { fontSize: 18, fontWeight: "800", color: "#4f46e5" },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#bfc7dd", backgroundColor: "#fff" }, btnText: { color: "#4f46e5", fontWeight: "700", fontSize: 14 },
  chat: { maxHeight: 420, borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 10, backgroundColor: "#f8fafc" },
  more: { alignSelf: "center", paddingVertical: 8 },
  bubbleRow: { flexDirection: "row", marginVertical: 3 }, left: { justifyContent: "flex-start" }, right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  theirs: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe5ee" }, mine: { backgroundColor: "#4f46e5" },
  theirsText: { color: "#152033", fontSize: 15 }, mineText: { color: "#fff", fontSize: 15 },
  pendingBubble: { opacity: 0.6 }, failedBubble: { backgroundColor: "#b42318" },
  meta: { fontSize: 11, color: "#667085", marginTop: 2 }, metaMine: { color: "#dfe3ff" }, retry: { color: "#fff", fontWeight: "700", marginTop: 4 },
  composer: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 12, padding: 10, fontSize: 16, color: "#152033", backgroundColor: "#fff", maxHeight: 120 },
  send: { backgroundColor: "#4f46e5", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12 }, sendText: { color: "#fff", fontWeight: "700", fontSize: 15 }, disabled: { opacity: 0.55 },
});
