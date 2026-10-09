"use client";

import type { Activity, CommunityEvent, EventAttendee, GroupMember, GroupSummary } from "@sp/types";
import { mergeEventMessages, newClientTag, type EventThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getCommunityClient } from "../lib/community";

const POLL_MS = 8000;
const fmt = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** <input type="datetime-local"> gives local time without an offset; the API wants an absolute instant. */
const localToIso = (v: string) => new Date(v).toISOString();

/** Groups and events for the pilot area. Event chat is for people who are going and refreshes every few seconds. */
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
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  async function act(work: () => Promise<unknown>) {
    setError(null);
    try { await work(); await load(); } catch (err) { setError(errorMessage(err)); }
  }

  const openEvent = events.find((e) => e.id === openEventId) ?? null;
  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;
  if (openEvent) return <EventPage event={openEvent} group={groups.find((g) => g.id === openEvent.groupId) ?? null} onBack={() => { setOpenEventId(null); void load(); }} onChanged={load} />;
  if (openGroup) return <GroupPage group={openGroup} events={events.filter((e) => e.groupId === openGroup.id)} onOpenEvent={setOpenEventId} onBack={() => { setOpenGroupId(null); void load(); }} onChanged={load} />;

  const myGroups = groups.filter((g) => g.role === "owner" || g.role === "moderator");
  return <div>
    <div className="card">
      <div className="field"><label htmlFor="area">Area</label><input id="area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Bulawayo (leave empty for everywhere)" maxLength={120} /></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === "events"} className={view === "events" ? "tab active" : "tab"} onClick={() => setView("events")}>Events</button>
        <button role="tab" aria-selected={view === "groups"} className={view === "groups" ? "tab active" : "tab"} onClick={() => setView("groups")}>Groups</button>
      </div>
      <div className="card-actions">
        <button className="secondary compact" onClick={() => setCreating(creating === "group" ? null : "group")}>New group</button>
        {myGroups.length > 0 && <button className="secondary compact" onClick={() => setCreating(creating === "event" ? null : "event")}>New event</button>}
      </div>
    </div>
    {error && <div className="notice err" role="alert">{error}</div>}
    {creating === "group" && <GroupForm activities={activities} onDone={() => { setCreating(null); void load(); }} />}
    {creating === "event" && <EventForm groups={myGroups} onDone={() => { setCreating(null); void load(); }} />}
    {loading ? <div className="card"><p className="muted">Loading…</p></div> : view === "events"
      ? (events.length === 0 ? <div className="card"><p className="muted">No upcoming events here yet. Join a group, or ask an organiser to plan one.</p></div>
        : events.map((e) => <div className="card" key={e.id}>
          <h3>{e.title}</h3>
          <p className="muted">{e.groupName} · {e.generalArea} · {fmt(e.startsAt)}</p>
          <p>{e.going} of {e.capacity} going{e.myStatus === "waitlisted" ? " · you are on the waitlist" : e.myStatus === "going" ? " · you are going" : ""}</p>
          <div className="card-actions">
            <button className="secondary compact" onClick={() => setOpenEventId(e.id)}>Open</button>
            {e.myStatus ? <button className="link" onClick={() => void act(() => client.cancelRsvp(e.id))}>Cancel RSVP</button>
              : <button onClick={() => void act(() => client.rsvp(e.id))}>{e.going >= e.capacity ? "Join waitlist" : "I'm going"}</button>}
          </div>
        </div>))
      : (groups.length === 0 ? <div className="card"><p className="muted">No groups here yet. Start one with “New group”.</p></div>
        : groups.map((g) => <div className="card" key={g.id}>
          <h3>{g.name}</h3>
          <p className="muted">{g.generalArea} · {g.memberCount}/{g.capacity} members{g.activities.length ? ` · ${g.activities.join(", ")}` : ""}</p>
          {g.description && <p>{g.description}</p>}
          <div className="card-actions">
            <button className="secondary compact" onClick={() => setOpenGroupId(g.id)}>Open</button>
            {g.role === null && <button onClick={() => void act(() => client.joinGroup(g.id))} disabled={g.memberCount >= g.capacity}>{g.memberCount >= g.capacity ? "Full" : "Join"}</button>}
            {g.role === "member" || g.role === "moderator" ? <button className="link" onClick={() => void act(() => client.leaveGroup(g.id))}>Leave</button> : null}
          </div>
        </div>))}
  </div>;
}

function GroupForm({ activities, onDone }: { activities: Activity[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [generalArea, setGeneralArea] = useState("");
  const [capacity, setCapacity] = useState("30"); const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await client.createGroup({ name, description, generalArea, capacity: Number(capacity), activityIds: picked }); onDone(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <form className="card" onSubmit={submit}>
    <h3>New group</h3>
    {error && <div className="notice err" role="alert">{error}</div>}
    <div className="field"><label htmlFor="gname">Name</label><input id="gname" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></div>
    <div className="field"><label htmlFor="gdesc">What is it about?</label><textarea id="gdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} /></div>
    <div className="field"><label htmlFor="garea">General area (a suburb or town, never an address)</label><input id="garea" value={generalArea} onChange={(e) => setGeneralArea(e.target.value)} required minLength={2} maxLength={120} /></div>
    <div className="field"><label htmlFor="gcap">Maximum members</label><input id="gcap" type="number" min={2} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></div>
    <fieldset className="field"><legend>Activities</legend>
      {activities.map((a) => <label className="check" key={a.id}><input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} /> {a.name}</label>)}
    </fieldset>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create group"}</button>
  </form>;
}

function EventForm({ groups, onDone }: { groups: GroupSummary[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? ""); const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState(groups[0]?.generalArea ?? ""); const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("10"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try { await client.createEvent({ groupId, title, description, generalArea, startsAt: localToIso(startsAt), endsAt: localToIso(endsAt), capacity: Number(capacity) }); onDone(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  return <form className="card" onSubmit={submit}>
    <h3>New event</h3>
    {error && <div className="notice err" role="alert">{error}</div>}
    <div className="field"><label htmlFor="egroup">Group</label><select id="egroup" value={groupId} onChange={(e) => { setGroupId(e.target.value); setGeneralArea(groups.find((g) => g.id === e.target.value)?.generalArea ?? ""); }}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
    <div className="field"><label htmlFor="etitle">Title</label><input id="etitle" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} /></div>
    <div className="field"><label htmlFor="edesc">Details</label><textarea id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} /></div>
    <div className="field"><label htmlFor="earea">General area (never an exact address)</label><input id="earea" value={generalArea} onChange={(e) => setGeneralArea(e.target.value)} required minLength={2} maxLength={120} /></div>
    <div className="field"><label htmlFor="estart">Starts</label><input id="estart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required /></div>
    <div className="field"><label htmlFor="eend">Ends</label><input id="eend" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required /></div>
    <div className="field"><label htmlFor="ecap">Places</label><input id="ecap" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required /></div>
    <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create event"}</button>
  </form>;
}

function GroupPage({ group, events, onOpenEvent, onBack, onChanged }: { group: GroupSummary; events: CommunityEvent[]; onOpenEvent: (id: string) => void; onBack: () => void; onChanged: () => Promise<void> }) {
  const client = getCommunityClient();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (group.joined) client.listMembers(group.id).then(setMembers).catch((e) => setError(errorMessage(e))); }, [client, group.id, group.joined]);
  async function remove() {
    if (!window.confirm(`Delete “${group.name}” and all its events? This cannot be undone.`)) return;
    try { await client.deleteGroup(group.id); await onChanged(); onBack(); } catch (err) { setError(errorMessage(err)); }
  }
  return <div>
    <div className="topbar"><div><h2>{group.name}</h2><p className="muted">{group.generalArea} · {group.memberCount}/{group.capacity} members</p></div><button className="secondary compact" onClick={onBack}>Back</button></div>
    {error && <div className="notice err" role="alert">{error}</div>}
    {group.description && <div className="card"><p>{group.description}</p></div>}
    <div className="card"><h3>Upcoming events</h3>{events.length === 0 ? <p className="muted">Nothing planned yet.</p> : events.map((e) => <p key={e.id}><button className="link" onClick={() => onOpenEvent(e.id)}>{e.title}</button> · {fmt(e.startsAt)}</p>)}</div>
    <div className="card"><h3>Members</h3>{!group.joined ? <p className="muted">Join the group to see who is in it.</p> : members === null ? <p className="muted">Loading…</p> : members.map((m) => <p key={m.userId}>{m.displayName}{m.role !== "member" ? <span className="tag">{m.role}</span> : null}</p>)}</div>
    {group.role === "owner" && <div className="card-actions"><button className="link danger" onClick={() => void remove()}>Delete group</button></div>}
  </div>;
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
  const scroller = useRef<HTMLDivElement>(null);
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
    const t = setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [client, event.id, event.myStatus, going, refresh]);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages.length]);

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
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    const tag = newClientTag();
    setMessages((c) => mergeEventMessages(c, [{ id: `local-${tag}`, eventId: event.id, senderId: "me", senderName: "You", body, clientTag: tag, createdAt: new Date().toISOString(), pending: true }]));
    void send(body, tag);
  }
  async function rsvp(join: boolean) { setError(null); try { if (join) await client.rsvp(event.id); else await client.cancelRsvp(event.id); await onChanged(); } catch (err) { setError(errorMessage(err)); } }
  async function cancelEvent() {
    if (!window.confirm(`Cancel “${event.title}”? Everyone who RSVP'd loses their place.`)) return;
    try { await client.deleteEvent(event.id); await onChanged(); onBack(); } catch (err) { setError(errorMessage(err)); }
  }

  return <div>
    <div className="topbar"><div><h2>{event.title}</h2><p className="muted">{event.groupName} · {event.generalArea} · {fmt(event.startsAt)} to {fmt(event.endsAt)}</p></div><button className="secondary compact" onClick={onBack}>Back</button></div>
    {error && <div className="notice err" role="alert">{error}</div>}
    <div className="card">
      {event.description && <p>{event.description}</p>}
      <p>{event.going} of {event.capacity} going{event.myStatus === "waitlisted" ? " · you are on the waitlist" : ""}</p>
      <div className="card-actions">
        {event.myStatus ? <button className="link" onClick={() => void rsvp(false)}>Cancel RSVP</button>
          : group?.joined === false ? <p className="muted">Join “{event.groupName}” to RSVP.</p>
          : <button onClick={() => void rsvp(true)}>{event.going >= event.capacity ? "Join waitlist" : "I'm going"}</button>}
        {canManage && <button className="link danger" onClick={() => void cancelEvent()}>Cancel event</button>}
      </div>
      {attendees && attendees.length > 0 && <p className="muted">Going: {attendees.map((a) => a.displayName).join(", ")}</p>}
    </div>
    {going ? <>
      <div className="card chat" ref={scroller}>
        {hasMore && <button className="link" onClick={() => void loadOlder()}>Load older messages</button>}
        {messages.length === 0 && <p className="muted">No messages yet. Say hello to everyone who is going.</p>}
        {messages.map((m) => { const mine = m.senderId === "me" || m.pending || m.failed; return <div key={m.id} className={`bubble-row ${mine ? "mine" : "theirs"}`}>
          <div className={`bubble ${m.pending ? "pending" : ""} ${m.failed ? "failed" : ""}`}>
            {!mine && <strong>{m.senderName}</strong>}
            <p>{m.body}</p>
            <span className="bubble-meta">{m.pending ? "Sending…" : m.failed ? "Not sent" : new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {m.failed && <button className="link" onClick={() => { setMessages((c) => c.filter((x) => x.id !== m.id)); void send(m.body, m.clientTag); }}> Retry</button>}</span>
          </div>
        </div>; })}
      </div>
      <form className="composer" onSubmit={submit}>
        <input aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write to everyone going…" maxLength={2000} autoComplete="off" />
        <button type="submit" disabled={sending || !draft.trim()}>Send</button>
      </form>
    </> : <div className="card"><p className="muted">{event.myStatus === "waitlisted" ? "You can chat once a place opens up for you." : "RSVP to join the event chat."}</p></div>}
  </div>;
}
