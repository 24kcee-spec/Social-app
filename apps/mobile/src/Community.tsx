import type { Activity, CommunityEvent, EventAttendee, GroupMember, GroupSummary } from "@sp/types";
import { mergeEventMessages, newClientTag, type EventThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { errorMessage } from "./auth";
import { getCommunityClient } from "./communityClient";

const POLL_MS = 8000;
const fmt = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Btn({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.btn, disabled && s.off]}><Text style={[s.btnText, danger && s.danger]}>{label}</Text></Pressable>;
}
function Field({ label, value, onChange, multiline, keyboard, placeholder }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; keyboard?: "numeric"; placeholder?: string }) {
  return <View style={{ marginTop: 8 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={[s.input, multiline && { minHeight: 64 }]} value={value} onChangeText={onChange} multiline={multiline} keyboardType={keyboard} placeholder={placeholder} placeholderTextColor="#8a94a6" /></View>;
}

/** Groups and events. Event chat is for people who are going and refreshes every few seconds. */
export function Community() {
  const client = getCommunityClient();
  const [view, setView] = useState<"events" | "groups">("events");
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [area, setArea] = useState("");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [creating, setCreating] = useState<"group" | "event" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const filter = area.trim().length >= 2 ? { generalArea: area.trim() } : {};
      const [g, e, a] = await Promise.all([client.listGroups(filter), client.listEvents(filter), client.listActivities()]);
      setGroups(g); setEvents(e); setActivities(a);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, area]);
  useEffect(() => { const t = setTimeout(() => void load(), 300); return () => clearTimeout(t); }, [load]);

  async function act(work: () => Promise<unknown>) { setError(null); try { await work(); await load(); } catch (err) { setError(errorMessage(err)); } }

  const openEvent = events.find((e) => e.id === openEventId) ?? null;
  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;
  if (openEvent) return <EventPage event={openEvent} group={groups.find((g) => g.id === openEvent.groupId) ?? null} onBack={() => { setOpenEventId(null); void load(); }} onChanged={load} />;
  if (openGroup) return <GroupPage group={openGroup} events={events.filter((e) => e.groupId === openGroup.id)} onOpenEvent={setOpenEventId} onBack={() => { setOpenGroupId(null); void load(); }} onChanged={load} />;

  const myGroups = groups.filter((g) => g.role === "owner" || g.role === "moderator");
  return <View>
    <View style={s.card}>
      <Field label="Area" value={area} onChange={setArea} placeholder="e.g. Bulawayo (empty = everywhere)" />
      <View style={s.row}><Btn label={view === "events" ? "● Events" : "Events"} onPress={() => setView("events")} /><Btn label={view === "groups" ? "● Groups" : "Groups"} onPress={() => setView("groups")} /></View>
      <View style={s.row}><Btn label="New group" onPress={() => setCreating(creating === "group" ? null : "group")} />{myGroups.length > 0 && <Btn label="New event" onPress={() => setCreating(creating === "event" ? null : "event")} />}</View>
    </View>
    {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
    {creating === "group" && <GroupForm activities={activities} onDone={() => { setCreating(null); void load(); }} />}
    {creating === "event" && <EventForm groups={myGroups} onDone={() => { setCreating(null); void load(); }} />}
    {loading ? <ActivityIndicator style={{ padding: 24 }} /> : view === "events"
      ? (events.length === 0 ? <View style={s.card}><Text style={s.muted}>No upcoming events here yet. Join a group, or ask an organiser to plan one.</Text></View>
        : events.map((e) => <View style={s.card} key={e.id}>
          <Text style={s.h3}>{e.title}</Text>
          <Text style={s.muted}>{e.groupName} · {e.generalArea} · {fmt(e.startsAt)}</Text>
          <Text style={s.text}>{e.going} of {e.capacity} going{e.myStatus === "waitlisted" ? " · you are on the waitlist" : e.myStatus === "going" ? " · you are going" : ""}</Text>
          <View style={s.row}>
            <Btn label="Open" onPress={() => setOpenEventId(e.id)} />
            {e.myStatus ? <Btn label="Cancel RSVP" danger onPress={() => void act(() => client.cancelRsvp(e.id))} /> : <Btn label={e.going >= e.capacity ? "Join waitlist" : "I'm going"} onPress={() => void act(() => client.rsvp(e.id))} />}
          </View>
        </View>))
      : (groups.length === 0 ? <View style={s.card}><Text style={s.muted}>No groups here yet. Start one with “New group”.</Text></View>
        : groups.map((g) => <View style={s.card} key={g.id}>
          <Text style={s.h3}>{g.name}</Text>
          <Text style={s.muted}>{g.generalArea} · {g.memberCount}/{g.capacity} members{g.activities.length ? ` · ${g.activities.join(", ")}` : ""}</Text>
          {g.description ? <Text style={s.text}>{g.description}</Text> : null}
          <View style={s.row}>
            <Btn label="Open" onPress={() => setOpenGroupId(g.id)} />
            {g.role === null && <Btn label={g.memberCount >= g.capacity ? "Full" : "Join"} disabled={g.memberCount >= g.capacity} onPress={() => void act(() => client.joinGroup(g.id))} />}
            {(g.role === "member" || g.role === "moderator") && <Btn label="Leave" danger onPress={() => void act(() => client.leaveGroup(g.id))} />}
          </View>
        </View>))}
  </View>;
}

function GroupForm({ activities, onDone }: { activities: Activity[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [generalArea, setGeneralArea] = useState("");
  const [capacity, setCapacity] = useState("30"); const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setError(null);
    try { await client.createGroup({ name, description, generalArea, capacity: Number(capacity), activityIds: picked }); onDone(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <View style={s.card}>
    <Text style={s.h3}>New group</Text>
    {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
    <Field label="Name" value={name} onChange={setName} />
    <Field label="What is it about?" value={description} onChange={setDescription} multiline />
    <Field label="General area (suburb or town, never an address)" value={generalArea} onChange={setGeneralArea} />
    <Field label="Maximum members" value={capacity} onChange={setCapacity} keyboard="numeric" />
    <Text style={s.label}>Activities</Text>
    <View style={s.row}>{activities.map((a) => <Btn key={a.id} label={(picked.includes(a.id) ? "✓ " : "") + a.name} onPress={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))} />)}</View>
    <Btn label={busy ? "Creating…" : "Create group"} disabled={busy} onPress={() => void submit()} />
  </View>;
}

/** Date entry as plain text (YYYY-MM-DD HH:MM, local time) keeps this dependency-free until a native picker is chosen. */
function parseLocal(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function EventForm({ groups, onDone }: { groups: GroupSummary[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? ""); const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState(groups[0]?.generalArea ?? ""); const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("10"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit() {
    const start = parseLocal(startsAt), end = parseLocal(endsAt);
    if (!start || !end) { setError("Use the format 2026-10-20 18:30 for the start and end."); return; }
    setBusy(true); setError(null);
    try { await client.createEvent({ groupId, title, description, generalArea, startsAt: start, endsAt: end, capacity: Number(capacity) }); onDone(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <View style={s.card}>
    <Text style={s.h3}>New event</Text>
    {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
    <Text style={s.label}>Group</Text>
    <View style={s.row}>{groups.map((g) => <Btn key={g.id} label={(g.id === groupId ? "● " : "") + g.name} onPress={() => { setGroupId(g.id); setGeneralArea(g.generalArea); }} />)}</View>
    <Field label="Title" value={title} onChange={setTitle} />
    <Field label="Details" value={description} onChange={setDescription} multiline />
    <Field label="General area (never an exact address)" value={generalArea} onChange={setGeneralArea} />
    <Field label="Starts (YYYY-MM-DD HH:MM)" value={startsAt} onChange={setStartsAt} placeholder="2026-10-20 18:30" />
    <Field label="Ends (YYYY-MM-DD HH:MM)" value={endsAt} onChange={setEndsAt} placeholder="2026-10-20 20:30" />
    <Field label="Places" value={capacity} onChange={setCapacity} keyboard="numeric" />
    <Btn label={busy ? "Creating…" : "Create event"} disabled={busy} onPress={() => void submit()} />
  </View>;
}

function GroupPage({ group, events, onOpenEvent, onBack, onChanged }: { group: GroupSummary; events: CommunityEvent[]; onOpenEvent: (id: string) => void; onBack: () => void; onChanged: () => Promise<void> }) {
  const client = getCommunityClient();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (group.joined) client.listMembers(group.id).then(setMembers).catch((e) => setError(errorMessage(e))); }, [client, group.id, group.joined]);
  function remove() {
    Alert.alert(`Delete “${group.name}”?`, "All its events go too. This cannot be undone.", [
      { text: "Keep it", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => { client.deleteGroup(group.id).then(async () => { await onChanged(); onBack(); }).catch((e) => setError(errorMessage(e))); } },
    ]);
  }
  return <View>
    <View style={s.top}><View style={{ flex: 1 }}><Text style={s.h2}>{group.name}</Text><Text style={s.muted}>{group.generalArea} · {group.memberCount}/{group.capacity} members</Text></View><Btn label="Back" onPress={onBack} /></View>
    {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
    {group.description ? <View style={s.card}><Text style={s.text}>{group.description}</Text></View> : null}
    <View style={s.card}><Text style={s.h3}>Upcoming events</Text>{events.length === 0 ? <Text style={s.muted}>Nothing planned yet.</Text> : events.map((e) => <Pressable key={e.id} accessibilityRole="button" onPress={() => onOpenEvent(e.id)}><Text style={s.link}>{e.title} · {fmt(e.startsAt)}</Text></Pressable>)}</View>
    <View style={s.card}><Text style={s.h3}>Members</Text>{!group.joined ? <Text style={s.muted}>Join the group to see who is in it.</Text> : members === null ? <ActivityIndicator /> : members.map((m) => <Text style={s.text} key={m.userId}>{m.displayName}{m.role !== "member" ? `  (${m.role})` : ""}</Text>)}</View>
    {group.role === "owner" && <Btn label="Delete group" danger onPress={remove} />}
  </View>;
}

function EventPage({ event, group, onBack, onChanged }: { event: CommunityEvent; group: GroupSummary | null; onBack: () => void; onChanged: () => Promise<void> }) {
  const client = getCommunityClient();
  const [attendees, setAttendees] = useState<EventAttendee[] | null>(null);
  const [messages, setMessages] = useState<EventThreadMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState(""); const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const going = event.myStatus === "going";
  const scroller = useRef<ScrollView>(null);
  const canManage = group?.role === "owner" || group?.role === "moderator";

  const refresh = useCallback(async () => {
    try {
      const page = await client.listEventMessages(event.id, { limit: 50 });
      setMessages((c) => mergeEventMessages(c, page.messages));
      setHasMore((h) => h || page.hasMore);
      setNextCursor((n) => n ?? page.nextCursor);
    } catch { /* transient; the next poll retries */ }
  }, [client, event.id]);

  useEffect(() => {
    if (event.myStatus) client.listAttendees(event.id).then(setAttendees).catch(() => undefined);
    if (!going) return;
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [client, event.id, event.myStatus, going, refresh]);

  async function loadOlder() {
    if (!nextCursor) return;
    try {
      const page = await client.listEventMessages(event.id, { limit: 50, before: nextCursor });
      setMessages((c) => mergeEventMessages(c, page.messages));
      setHasMore(page.hasMore); setNextCursor(page.nextCursor);
    } catch (err) { setError(errorMessage(err)); }
  }
  async function send(body: string, tag: string) {
    setSending(true); setError(null);
    try { const m = await client.sendEventMessage(event.id, body, tag); setMessages((c) => mergeEventMessages(c, [m])); setDraft(""); }
    catch (err) { setMessages((c) => c.map((x) => (x.clientTag === tag && x.pending ? { ...x, pending: false, failed: true } : x))); setError(errorMessage(err)); }
    finally { setSending(false); }
  }
  function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((c) => mergeEventMessages(c, [{ id: `local-${tag}`, eventId: event.id, senderId: "me", senderName: "You", body, clientTag: tag, createdAt: new Date().toISOString(), pending: true }]));
    void send(body, tag);
  }
  async function rsvp(join: boolean) { setError(null); try { if (join) await client.rsvp(event.id); else await client.cancelRsvp(event.id); await onChanged(); } catch (err) { setError(errorMessage(err)); } }
  function cancelEvent() {
    Alert.alert(`Cancel “${event.title}”?`, "Everyone who RSVP'd loses their place.", [
      { text: "Keep it", style: "cancel" },
      { text: "Cancel event", style: "destructive", onPress: () => { client.deleteEvent(event.id).then(async () => { await onChanged(); onBack(); }).catch((e) => setError(errorMessage(e))); } },
    ]);
  }

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <View style={s.top}><View style={{ flex: 1 }}><Text style={s.h2}>{event.title}</Text><Text style={s.muted}>{event.groupName} · {event.generalArea}</Text><Text style={s.muted}>{fmt(event.startsAt)} to {fmt(event.endsAt)}</Text></View><Btn label="Back" onPress={onBack} /></View>
    {error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
    <View style={s.card}>
      {event.description ? <Text style={s.text}>{event.description}</Text> : null}
      <Text style={s.text}>{event.going} of {event.capacity} going{event.myStatus === "waitlisted" ? " · you are on the waitlist" : ""}</Text>
      <View style={s.row}>
        {event.myStatus ? <Btn label="Cancel RSVP" danger onPress={() => void rsvp(false)} />
          : group?.joined === false ? <Text style={s.muted}>Join “{event.groupName}” to RSVP.</Text>
          : <Btn label={event.going >= event.capacity ? "Join waitlist" : "I'm going"} onPress={() => void rsvp(true)} />}
        {canManage && <Btn label="Cancel event" danger onPress={cancelEvent} />}
      </View>
      {attendees && attendees.length > 0 ? <Text style={s.muted}>Going: {attendees.map((a) => a.displayName).join(", ")}</Text> : null}
    </View>
    {going ? <>
      <ScrollView ref={scroller} style={s.chat} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
        {hasMore && <Pressable accessibilityRole="button" onPress={() => void loadOlder()} style={{ alignSelf: "center", padding: 8 }}><Text style={s.link}>Load older messages</Text></Pressable>}
        {messages.length === 0 && <Text style={s.muted}>No messages yet. Say hello to everyone who is going.</Text>}
        {messages.map((m) => { const mine = m.senderId === "me" || !!m.pending || !!m.failed; return <View key={m.id} style={[s.bubbleRow, mine ? s.right : s.left]}>
          <View style={[s.bubble, mine ? s.mine : s.theirs, m.pending && { opacity: 0.6 }, m.failed && { backgroundColor: "#b42318" }]}>
            {!mine && <Text style={s.sender}>{m.senderName}</Text>}
            <Text style={mine ? s.mineText : s.theirsText}>{m.body}</Text>
            <Text style={[s.meta, mine && { color: "#dfe3ff" }]}>{m.pending ? "Sending…" : m.failed ? "Not sent" : new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
            {m.failed && <Pressable accessibilityRole="button" onPress={() => { setMessages((c) => c.filter((x) => x.id !== m.id)); void send(m.body, m.clientTag); }}><Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text></Pressable>}
          </View>
        </View>; })}
      </ScrollView>
      <View style={s.composer}>
        <TextInput accessibilityLabel="Message" style={[s.input, { flex: 1, maxHeight: 120 }]} value={draft} onChangeText={setDraft} placeholder="Write to everyone going…" placeholderTextColor="#8a94a6" maxLength={2000} multiline />
        <Btn label="Send" disabled={sending || !draft.trim()} onPress={submit} />
      </View>
    </> : <View style={s.card}><Text style={s.muted}>{event.myStatus === "waitlisted" ? "You can chat once a place opens up for you." : "RSVP to join the event chat."}</Text></View>}
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 14, marginTop: 12, backgroundColor: "#fff", gap: 6 },
  h2: { fontSize: 20, fontWeight: "800", color: "#152033" }, h3: { fontSize: 17, fontWeight: "700", color: "#152033" },
  text: { fontSize: 15, color: "#152033" }, muted: { fontSize: 14, color: "#667085" }, label: { fontSize: 14, fontWeight: "600", color: "#152033", marginBottom: 4 },
  err: { color: "#b42318", fontSize: 14, marginTop: 8 }, link: { color: "#4f46e5", fontWeight: "700", fontSize: 15, paddingVertical: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }, top: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 4 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#bfc7dd", backgroundColor: "#fff" }, btnText: { color: "#4f46e5", fontWeight: "700", fontSize: 14 }, danger: { color: "#b42318" }, off: { opacity: 0.5 },
  input: { borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 12, padding: 10, fontSize: 16, color: "#152033", backgroundColor: "#fff" },
  chat: { maxHeight: 380, borderWidth: 1, borderColor: "#dfe5ee", borderRadius: 16, padding: 10, backgroundColor: "#f8fafc", marginTop: 12 },
  bubbleRow: { flexDirection: "row", marginVertical: 3 }, left: { justifyContent: "flex-start" }, right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 }, theirs: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#dfe5ee" }, mine: { backgroundColor: "#4f46e5" },
  theirsText: { color: "#152033", fontSize: 15 }, mineText: { color: "#fff", fontSize: 15 }, sender: { fontSize: 12, fontWeight: "700", color: "#4f46e5" }, meta: { fontSize: 11, color: "#667085", marginTop: 2 },
  composer: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-end" },
});
