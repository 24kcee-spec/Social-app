"use client";

import type { Activity, CommunityEvent, EventAttendee, GroupMember, GroupSummary } from "@sp/types";
import { mergeEventMessages, newClientTag, type EventThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getCommunityClient } from "../lib/community";
import { ReportModal } from "./report-modal";
import { ShareModal } from "./share-modal";

const POLL_MS = 8000;
const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const localToIso = (v: string) => new Date(v).toISOString();

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
  const [sharing, setSharing] = useState<{
    targetType: "group" | "event";
    id: string;
    title: string;
    description?: string;
    area?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const filter = area.trim().length >= 2 ? { generalArea: area.trim() } : {};
      const [g, e, a] = await Promise.all([
        client.listGroups(filter),
        client.listEvents(filter),
        client.listActivities(),
      ]);
      setGroups(g);
      setEvents(e);
      setActivities(a);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, area]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function act(work: () => Promise<unknown>) {
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const openEvent = events.find((e) => e.id === openEventId) ?? null;
  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;

  if (openEvent) {
    return (
      <EventPage
        event={openEvent}
        group={groups.find((g) => g.id === openEvent.groupId) ?? null}
        onBack={() => {
          setOpenEventId(null);
          void load();
        }}
        onChanged={load}
      />
    );
  }

  if (openGroup) {
    return (
      <GroupPage
        group={openGroup}
        events={events.filter((e) => e.groupId === openGroup.id)}
        onOpenEvent={setOpenEventId}
        onBack={() => {
          setOpenGroupId(null);
          void load();
        }}
        onChanged={load}
      />
    );
  }

  const myGroups = groups.filter((g) => g.role === "owner" || g.role === "moderator");

  return (
    <div className="community-page">
      {/* Header */}
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ CAMPUS & LOCAL SPACES</span>
          <h1 style={{ margin: "2px 0 0" }}>Community & Events</h1>
          <div className="discover-philosophy" style={{ marginTop: 8 }}>
            <span>Small groups, authentic campus meetups, and low-key events. No exact addresses published publicly.</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="secondary compact" onClick={() => setCreating(creating === "group" ? null : "group")}>
            + New group
          </button>
          {myGroups.length > 0 && (
            <button className="compact" onClick={() => setCreating(creating === "event" ? null : "event")}>
              + Plan event
            </button>
          )}
        </div>
      </div>

      {/* Control Card: Area filter + View switch */}
      <div className="card" style={{ padding: "20px 24px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          {/* View Tabs */}
          <div className="nav-pill-bar" role="tablist">
            <button
              role="tab"
              aria-selected={view === "events"}
              className={`nav-pill-btn ${view === "events" ? "active" : ""}`}
              onClick={() => setView("events")}
            >
              <span>📅</span>
              <span>Events ({events.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={view === "groups"}
              className={`nav-pill-btn ${view === "groups" ? "active" : ""}`}
              onClick={() => setView("groups")}
            >
              <span>👥</span>
              <span>Groups ({groups.length})</span>
            </button>
          </div>

          {/* Location Quick Chips */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>Area:</span>
            {["Bulawayo", "NUST Campus", "Harare"].map((loc) => (
              <button
                key={loc}
                className={`compact ${area === loc ? "" : "secondary"}`}
                style={{ fontSize: "0.8rem", padding: "4px 10px", minHeight: 32 }}
                onClick={() => setArea(area === loc ? "" : loc)}
              >
                {loc}
              </button>
            ))}
            {area && (
              <button className="link" onClick={() => setArea("")} style={{ fontSize: "0.8rem" }}>
                Reset filter
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <input
            id="area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Search by neighborhood or city (e.g. Bulawayo, NUST Campus, Ascot)…"
            maxLength={120}
            style={{ fontSize: "0.9rem" }}
          />
        </div>
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}

      {/* Creation Drawers */}
      {creating === "group" && (
        <GroupForm
          activities={activities}
          onDone={() => {
            setCreating(null);
            void load();
          }}
        />
      )}

      {creating === "event" && (
        <EventForm
          groups={myGroups}
          onDone={() => {
            setCreating(null);
            void load();
          }}
        />
      )}

      {/* Main List Grid */}
      {loading ? (
        <div className="empty-state-card">
          <p className="muted">Loading campus spaces…</p>
        </div>
      ) : view === "events" ? (
        events.length === 0 ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">📅</div>
            <h2>No upcoming events in this area yet</h2>
            <p className="muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>
              Join a group to suggest an activity, or create a new student group to host study sessions, gaming nights, or sports.
            </p>
            <button className="secondary compact" onClick={() => setCreating("group")}>
              Create a group
            </button>
          </div>
        ) : (
          <div className="community-grid">
            {events.map((e) => {
              const d = new Date(e.startsAt);
              const month = d.toLocaleString([], { month: "short" });
              const day = d.getDate();
              const percent = Math.min(100, Math.round((e.going / Math.max(1, e.capacity)) * 100));

              return (
                <div className="event-card" key={e.id}>
                  <div className="event-card-cover">
                    <img src="/images/event_study.jpg" alt={e.title} />
                    <div className="event-date-sticker">
                      <span className="event-date-month">{month}</span>
                      <span className="event-date-day">{day}</span>
                    </div>
                  </div>

                  <div className="event-card-body">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <h3 style={{ margin: "0 0 4px" }}>{e.title}</h3>
                      {e.myStatus === "going" && (
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 999, background: "var(--success-soft)", color: "var(--success)", fontWeight: 700, flexShrink: 0 }}>
                          Going ✓
                        </span>
                      )}
                    </div>

                    <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 10px" }}>
                      {e.groupName} · {e.generalArea} · {fmt(e.startsAt)}
                    </p>

                    {e.description && (
                      <p style={{ fontSize: "0.88rem", color: "var(--text-2)", marginBottom: 12, lineHeight: 1.45 }}>
                        {e.description}
                      </p>
                    )}

                    {/* Capacity Progress Bar */}
                    <div style={{ marginTop: "auto" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: 4 }}>
                        <span>Attendance</span>
                        <span>{e.going} of {e.capacity} going</span>
                      </div>
                      <div className="event-capacity-bar">
                        <div className="event-capacity-fill" style={{ width: `${percent}%` }} />
                      </div>

                      <div className="card-actions" style={{ marginTop: 14 }}>
                        <button className="compact" onClick={() => setOpenEventId(e.id)}>
                          Open Details
                        </button>
                        <button
                          type="button"
                          className="secondary compact"
                          onClick={() =>
                            setSharing({
                              targetType: "event",
                              id: e.id,
                              title: e.title,
                              description: e.description,
                              area: e.generalArea,
                            })
                          }
                        >
                          Share
                        </button>
                        {e.myStatus ? (
                          <button className="link" onClick={() => void act(() => client.cancelRsvp(e.id))}>
                            Cancel RSVP
                          </button>
                        ) : (
                          <button className="secondary compact" onClick={() => void act(() => client.rsvp(e.id))}>
                            {e.going >= e.capacity ? "Join waitlist" : "RSVP"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-state-icon">👥</div>
          <h2>No groups formed yet in this area</h2>
          <p className="muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>
            Start the very first club or interest group on campus and invite classmates!
          </p>
          <button onClick={() => setCreating("group")}>Create the first group</button>
        </div>
      ) : (
        <div className="community-grid">
          {groups.map((g) => (
            <div className="card" key={g.id} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: "0 0 2px" }}>{g.name}</h3>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    📍 {g.generalArea} · {g.memberCount}/{g.capacity} members
                  </span>
                </div>
                {g.role && (
                  <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}>
                    {g.role === "owner" ? "Founder" : g.role === "moderator" ? "Moderator" : "Member"}
                  </span>
                )}
              </div>

              {g.description && (
                <p style={{ fontSize: "0.9rem", color: "var(--text-2)", marginBottom: 14, lineHeight: 1.45 }}>
                  {g.description}
                </p>
              )}

              {g.activities.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                  {g.activities.map((a) => (
                    <span key={a} className="shared-chip">
                      {a}
                    </span>
                  ))}
                </div>
              )}

              <div className="card-actions" style={{ marginTop: "auto" }}>
                <button className="compact" onClick={() => setOpenGroupId(g.id)}>
                  View Group
                </button>
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() =>
                    setSharing({
                      targetType: "group",
                      id: g.id,
                      title: g.name,
                      description: g.description,
                      area: g.generalArea,
                    })
                  }
                >
                  Share
                </button>
                {g.role === null && (
                  <button
                    className="secondary compact"
                    onClick={() => void act(() => client.joinGroup(g.id))}
                    disabled={g.memberCount >= g.capacity}
                  >
                    {g.memberCount >= g.capacity ? "Full" : "Join"}
                  </button>
                )}
                {(g.role === "member" || g.role === "moderator") && (
                  <button className="link" onClick={() => void act(() => client.leaveGroup(g.id))}>
                    Leave
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sharing && (
        <ShareModal
          targetType={sharing.targetType}
          targetId={sharing.id}
          title={sharing.title}
          description={sharing.description}
          areaOrLocation={sharing.area}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}

function GroupForm({ activities, onDone }: { activities: Activity[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.createGroup({
        name,
        description,
        generalArea,
        capacity: Number(capacity),
        activityIds: picked,
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 28, border: "1.5px solid var(--accent-line)" }}>
      <span className="eyebrow">NEW COMMUNITY SPACE</span>
      <h2 style={{ margin: "2px 0 16px" }}>Create a new group</h2>
      {error && <div className="notice err" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="gname">Group Name</label>
        <input id="gname" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="e.g. NUST FIFA & Gaming Lounge" />
      </div>
      <div className="field">
        <label htmlFor="gdesc">What brings this group together?</label>
        <textarea id="gdesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="Share the group's purpose and activities..." />
      </div>
      <div className="field">
        <label htmlFor="garea">General Area</label>
        <input id="garea" value={generalArea} onChange={(e) => setGeneralArea(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Bulawayo or NUST Campus (never a private address)" />
      </div>
      <div className="field">
        <label htmlFor="gcap">Capacity Limit</label>
        <input id="gcap" type="number" min={2} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
      </div>
      <div className="field">
        <label>Activities & Passions</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {activities.map((a) => {
            const chosen = picked.includes(a.id);
            return (
              <button
                type="button"
                key={a.id}
                className={`interest-chip-btn ${chosen ? "selected" : ""}`}
                onClick={() => setPicked((p) => (chosen ? p.filter((x) => x !== a.id) : [...p, a.id]))}
              >
                <span>{chosen ? "✓" : "+"}</span>
                <span>{a.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create Group"}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function EventForm({ groups, onDone }: { groups: GroupSummary[]; onDone: () => void }) {
  const client = getCommunityClient();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState(groups[0]?.generalArea ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.createEvent({
        groupId,
        title,
        description,
        generalArea,
        startsAt: localToIso(startsAt),
        endsAt: localToIso(endsAt),
        capacity: Number(capacity),
      });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 28, border: "1.5px solid var(--accent-line)" }}>
      <span className="eyebrow">CAMPUS MEETUP</span>
      <h2 style={{ margin: "2px 0 16px" }}>Plan a new event</h2>
      {error && <div className="notice err" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="egroup">Organizing Group</label>
        <select
          id="egroup"
          value={groupId}
          onChange={(e) => {
            setGroupId(e.target.value);
            setGeneralArea(groups.find((g) => g.id === e.target.value)?.generalArea ?? "");
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="etitle">Event Title</label>
        <input id="etitle" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Finance Accounting Gate Test Study Group" />
      </div>
      <div className="field">
        <label htmlFor="edesc">Details & Agenda</label>
        <textarea id="edesc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={2} placeholder="What should people bring or expect?" />
      </div>
      <div className="field">
        <label htmlFor="earea">General Area</label>
        <input id="earea" value={generalArea} onChange={(e) => setGeneralArea(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. NUST Library or Bulawayo CBD" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field">
          <label htmlFor="estart">Starts At</label>
          <input id="estart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="eend">Ends At</label>
          <input id="eend" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ecap">Available Places</label>
        <input id="ecap" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button type="submit" disabled={busy}>{busy ? "Creating…" : "Publish Event"}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

function GroupPage({
  group,
  events,
  onOpenEvent,
  onBack,
  onChanged,
}: {
  group: GroupSummary;
  events: CommunityEvent[];
  onOpenEvent: (id: string) => void;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const client = getCommunityClient();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const reloadMembers = useCallback(() => {
    if (group.joined) {
      client.listMembers(group.id).then(setMembers).catch((e) => setError(errorMessage(e)));
    }
  }, [client, group.id, group.joined]);

  useEffect(() => {
    reloadMembers();
  }, [reloadMembers]);

  async function remove() {
    if (!window.confirm(`Delete “${group.name}” and all its events? This cannot be undone.`)) return;
    try {
      await client.deleteGroup(group.id);
      await onChanged();
      onBack();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <span className="eyebrow">COMMUNITY GROUP</span>
          <h1 style={{ margin: "2px 0 0" }}>{group.name}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            📍 {group.generalArea} · {group.memberCount}/{group.capacity} members
          </p>
        </div>
        <button className="secondary compact" onClick={onBack}>
          ← Back to Community
        </button>
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}

      {group.description && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>{group.description}</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px" }}>Upcoming Group Events</h3>
        {events.length === 0 ? (
          <p className="muted">No events currently scheduled for this group.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.map((e) => (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <button className="link" onClick={() => onOpenEvent(e.id)} style={{ fontWeight: 650 }}>
                    {e.title}
                  </button>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>{fmt(e.startsAt)}</div>
                </div>
                <span className="muted" style={{ fontSize: "0.82rem" }}>{e.going} going</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px" }}>Group Members</h3>
        {!group.joined ? (
          <p className="muted">Join this group to see the member list and participate in discussions.</p>
        ) : members === null ? (
          <p className="muted">Loading members…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {members.map((m) => (
              <div
                key={m.userId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>{m.displayName}</span>
                  {m.role !== "member" && (
                    <span style={{ marginLeft: 8, fontSize: "0.72rem", padding: "2px 8px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)" }}>
                      {m.role}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {group.role === "owner" && m.role !== "owner" && (
                    <button
                      className="link compact"
                      style={{ fontSize: "0.8rem" }}
                      onClick={async () => {
                        const nextRole = m.role === "moderator" ? "member" : "moderator";
                        try {
                          await client.updateMemberRole(group.id, m.userId, nextRole);
                          reloadMembers();
                        } catch (e) {
                          setError(errorMessage(e));
                        }
                      }}
                    >
                      {m.role === "moderator" ? "Demote" : "Make moderator"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button className="link" onClick={() => setReporting(true)}>
          Report group
        </button>
        {group.role === "owner" && (
          <button className="link" style={{ color: "var(--danger)" }} onClick={() => void remove()}>
            Delete group
          </button>
        )}
      </div>

      {reporting && (
        <ReportModal
          targetType="group"
          targetId={group.id}
          targetLabel={group.name}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}

function EventPage({
  event,
  group,
  onBack,
  onChanged,
}: {
  event: CommunityEvent;
  group: GroupSummary | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const client = getCommunityClient();
  const [attendees, setAttendees] = useState<EventAttendee[] | null>(null);
  const [messages, setMessages] = useState<EventThreadMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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
    } catch {
      /* transient */
    }
  }, [client, event.id]);

  useEffect(() => {
    if (event.myStatus) {
      client.listAttendees(event.id).then(setAttendees).catch(() => undefined);
    }
    if (!going) return;
    void refresh();
    const t = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [client, event.id, event.myStatus, going, refresh]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function loadOlder() {
    if (!nextCursor) return;
    try {
      const page = await client.listEventMessages(event.id, { limit: 50, before: nextCursor });
      setMessages((c) => mergeEventMessages(c, page.messages));
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
      const m = await client.sendEventMessage(event.id, body, tag);
      setMessages((c) => mergeEventMessages(c, [m]));
      setDraft("");
    } catch (err) {
      setMessages((c) =>
        c.map((x) => (x.clientTag === tag && x.pending ? { ...x, pending: false, failed: true } : x))
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
    setMessages((c) =>
      mergeEventMessages(c, [
        {
          id: `local-${tag}`,
          eventId: event.id,
          senderId: "me",
          senderName: "You",
          body,
          clientTag: tag,
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ])
    );
    void send(body, tag);
  }

  async function rsvp(join: boolean) {
    setError(null);
    try {
      if (join) await client.rsvp(event.id);
      else await client.cancelRsvp(event.id);
      await onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function cancelEvent() {
    if (!window.confirm(`Cancel “${event.title}”? Everyone who RSVP'd will lose their place.`)) return;
    try {
      await client.deleteEvent(event.id);
      await onChanged();
      onBack();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <span className="eyebrow">CAMPUS EVENT</span>
          <h1 style={{ margin: "2px 0 0" }}>{event.title}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {event.groupName} · 📍 {event.generalArea} · {fmt(event.startsAt)} to {fmt(event.endsAt)}
          </p>
        </div>
        <button className="secondary compact" onClick={onBack}>
          ← Back to Events
        </button>
      </div>

      {error && <div className="notice err" role="alert">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        {event.description && (
          <p style={{ fontSize: "1rem", lineHeight: 1.5, marginBottom: 16 }}>{event.description}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span className="nav-badge" style={{ background: "var(--accent)" }}>{event.going} / {event.capacity} Going</span>
          {event.myStatus === "waitlisted" && <span className="muted">You are on the waitlist</span>}
          {event.myStatus === "going" && <span style={{ color: "var(--success)", fontWeight: 700 }}>You are confirmed going!</span>}
        </div>

        <div className="card-actions">
          {event.myStatus ? (
            <button className="link" onClick={() => void rsvp(false)}>Cancel RSVP</button>
          ) : group?.joined === false ? (
            <p className="muted">Join “{event.groupName}” to RSVP for this event.</p>
          ) : (
            <button onClick={() => void rsvp(true)}>
              {event.going >= event.capacity ? "Join waitlist" : "I'm going"}
            </button>
          )}
          {canManage && (
            <button className="link" style={{ color: "var(--danger)" }} onClick={() => void cancelEvent()}>
              Cancel event
            </button>
          )}
        </div>

        {attendees && attendees.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <span className="muted" style={{ fontSize: "0.82rem" }}>Confirmed Attendees: </span>
            <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
              {attendees.map((a) => a.displayName).join(", ")}
            </span>
          </div>
        )}
      </div>

      {going ? (
        <div className="card" style={{ padding: 20 }}>
          <div className="card-header">
            <div>
              <span className="eyebrow">EVENT LIVE CHAT</span>
              <h3 style={{ margin: 0 }}>Attendee Chat</h3>
              <p className="muted" style={{ fontSize: "0.82rem" }}>Coordinate meetups and ask questions.</p>
            </div>
          </div>

          <div
            className="chat-messages-scroll"
            ref={scroller}
            style={{ maxHeight: 320, minHeight: 180, marginBottom: 16, border: "1px solid var(--line)", borderRadius: "var(--radius-md)", padding: 14 }}
          >
            {hasMore && (
              <button className="link" onClick={() => void loadOlder()} style={{ fontSize: "0.82rem", margin: "0 auto" }}>
                Load older messages
              </button>
            )}
            {messages.length === 0 && (
              <p className="muted" style={{ textAlign: "center", margin: "24px 0" }}>
                No messages yet. Say hello to everyone who is attending!
              </p>
            )}
            {messages.map((m) => {
              const mine = m.senderId === "me" || m.pending || m.failed;
              return (
                <div key={m.id} className={`chat-bubble-row ${mine ? "mine" : "theirs"}`}>
                  <div className="chat-bubble">
                    {!mine && <div style={{ fontWeight: 700, fontSize: "0.78rem", marginBottom: 2 }}>{m.senderName}</div>}
                    <p style={{ margin: 0 }}>{m.body}</p>
                    <span className="bubble-time">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <form className="chat-composer" onSubmit={submit} style={{ padding: 0, border: 0 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message to attendees…"
              maxLength={2000}
            />
            <button type="submit" disabled={sending || !draft.trim()} className="compact">
              Send
            </button>
          </form>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 28, background: "var(--surface-sunken)" }}>
          <p className="muted" style={{ margin: 0 }}>
            {event.myStatus === "waitlisted"
              ? "You will be able to access the attendee live chat once a spot opens up for you."
              : "RSVP to join the private attendee chat and coordinate meetups."}
          </p>
        </div>
      )}
    </div>
  );
}
