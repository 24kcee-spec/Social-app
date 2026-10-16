import type { Activity, CommunityEvent, EventAttendee, GroupMember, GroupSummary } from "@sp/types";
import { mergeEventMessages, newClientTag, type EventThreadMessage } from "@sp/profile-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { errorMessage } from "./auth";
import { getCommunityClient } from "./communityClient";
import { useTheme } from "./theme";
import { Badge, Banner, Button, Chip, EmptyState, Field, ReportSheet } from "./ui";

const POLL_MS = 8000;
const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Community({
  initialTarget,
  onClearTarget,
}: {
  initialTarget?: { targetType: "group" | "event" | "profile"; id: string } | null;
  onClearTarget?: () => void;
} = {}) {
  const { colors, radius, space, type, shadow } = useTheme();
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
  const [notice, setNotice] = useState<string | null>(null);
  const [reportingTarget, setReportingTarget] = useState<{ type: "group" | "event"; id: string; name: string } | null>(null);

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
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function act(work: () => Promise<unknown>, successMsg?: string) {
    setError(null);
    try {
      await work();
      if (successMsg) setNotice(successMsg);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    if (!initialTarget) return;
    if (initialTarget.targetType === "group") {
      setOpenGroupId(initialTarget.id);
      onClearTarget?.();
    } else if (initialTarget.targetType === "event") {
      setOpenEventId(initialTarget.id);
      onClearTarget?.();
    }
  }, [initialTarget, onClearTarget]);

  const shareItem = async (type: "group" | "event", id: string, title: string) => {
    try {
      await Share.share({
        title,
        message: `Check out "${title}" on Social App: https://social-app.local/share/${type}/${id}`,
        url: `https://social-app.local/share/${type}/${id}`,
      });
    } catch {}
  };

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
        onReport={(id, name) => setReportingTarget({ type: "event", id, name })}
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
        onReport={(id, name) => setReportingTarget({ type: "group", id, name })}
      />
    );
  }

  const myGroups = groups.filter((g) => g.role === "owner" || g.role === "moderator");

  return (
    <View style={styles.container}>
      {/* Top Filter and Navigation Card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <Field
          label="Filter by general area"
          value={area}
          onChangeText={setArea}
          placeholder="e.g. Bulawayo (leave empty for everywhere)"
        />

        {/* View Switcher: Events vs Groups */}
        <View style={[styles.tabSwitchRow, { marginTop: space[3] }]}>
          <Button
            label={view === "events" ? "● Events" : "Events"}
            secondary={view !== "events"}
            compact
            onPress={() => setView("events")}
            style={{ flex: 1 }}
          />
          <Button
            label={view === "groups" ? "● Groups" : "Groups"}
            secondary={view !== "groups"}
            compact
            onPress={() => setView("groups")}
            style={{ flex: 1 }}
          />
        </View>

        {/* Creation Buttons */}
        <View style={[styles.createRow, { marginTop: space[3] }]}>
          <Button
            label={creating === "group" ? "Cancel new group" : "+ New group"}
            secondary
            compact
            onPress={() => setCreating(creating === "group" ? null : "group")}
          />
          {myGroups.length > 0 ? (
            <Button
              label={creating === "event" ? "Cancel new event" : "+ New event"}
              secondary
              compact
              onPress={() => setCreating(creating === "event" ? null : "event")}
            />
          ) : null}
        </View>
      </View>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="success">{notice}</Banner> : null}

      {/* Creation forms */}
      {creating === "group" ? (
        <GroupForm
          activities={activities}
          onDone={() => {
            setCreating(null);
            setNotice("Group created successfully.");
            void load();
          }}
        />
      ) : null}

      {creating === "event" ? (
        <EventForm
          groups={myGroups}
          onDone={() => {
            setCreating(null);
            setNotice("Event created successfully.");
            void load();
          }}
        />
      ) : null}

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[3] }]}>
            Loading {view}…
          </Text>
        </View>
      ) : view === "events" ? (
        events.length === 0 ? (
          <EmptyState
            title="No upcoming events"
            description="There are no events planned in this area yet. Join a group or suggest an activity with others."
            mark="◈"
          />
        ) : (
          <View style={{ marginTop: space[3] }}>
            {events.map((e) => (
              <View
                key={e.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                    borderRadius: radius.md,
                    padding: space[4],
                    marginTop: space[3],
                  },
                  shadow[1],
                ]}
              >
                <View style={styles.eventTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
                      {e.title}
                    </Text>
                    <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size, marginTop: 2 }]}>
                      {e.groupName} · {e.generalArea} · {fmt(e.startsAt)}
                    </Text>
                  </View>
                  <Badge
                    label={
                      e.myStatus === "going"
                        ? "Going"
                        : e.myStatus === "waitlisted"
                        ? "Waitlisted"
                        : `${e.going}/${e.capacity}`
                    }
                    tone={e.myStatus === "going" ? "success" : e.myStatus === "waitlisted" ? "warning" : "neutral"}
                    compact
                  />
                </View>

                {e.description ? (
                  <Text style={[styles.eventDesc, { color: colors.text2, fontSize: type.small.size, marginTop: space[2] }]}>
                    {e.description}
                  </Text>
                ) : null}

                <View style={[styles.actionsRow, { marginTop: space[3] }]}>
                  <Button label="Open" compact onPress={() => setOpenEventId(e.id)} />
                  <Button
                    label="Share"
                    secondary
                    compact
                    onPress={() => void shareItem("event", e.id, e.title)}
                  />
                  {e.myStatus ? (
                    <Button
                      label="Cancel RSVP"
                      danger
                      secondary
                      compact
                      onPress={() => void act(() => client.cancelRsvp(e.id), "RSVP cancelled.")}
                    />
                  ) : (
                    <Button
                      label={e.going >= e.capacity ? "Join waitlist" : "I'm going"}
                      secondary
                      compact
                      onPress={() =>
                        void act(
                          () => client.rsvp(e.id),
                          e.going >= e.capacity ? "Added to waitlist." : "You're going!"
                        )
                      }
                    />
                  )}
                </View>
              </View>
            ))}
          </View>
        )
      ) : groups.length === 0 ? (
        <EmptyState
          title="No groups found"
          description="No groups match this area. Start one with '+ New group' to connect people around common activities."
          mark="◈"
        />
      ) : (
        <View style={{ marginTop: space[3] }}>
          {groups.map((g) => (
            <View
              key={g.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  borderRadius: radius.md,
                  padding: space[4],
                  marginTop: space[3],
                },
                shadow[1],
              ]}
            >
              <View style={styles.eventTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
                    {g.name}
                  </Text>
                  <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size, marginTop: 2 }]}>
                    {g.generalArea} · {g.memberCount}/{g.capacity} members
                  </Text>
                </View>
                {g.role ? (
                  <Badge
                    label={g.role === "owner" ? "Owner" : g.role === "moderator" ? "Mod" : "Member"}
                    tone="accent"
                    compact
                  />
                ) : null}
              </View>

              {g.description ? (
                <Text style={[styles.eventDesc, { color: colors.text2, fontSize: type.small.size, marginTop: space[2] }]}>
                  {g.description}
                </Text>
              ) : null}

              {g.activities.length > 0 ? (
                <View style={[styles.chipsRow, { marginTop: space[2] }]}>
                  {g.activities.map((actName) => (
                    <Chip key={actName} label={actName} />
                  ))}
                </View>
              ) : null}

              <View style={[styles.actionsRow, { marginTop: space[3] }]}>
                <Button label="Open" compact onPress={() => setOpenGroupId(g.id)} />
                <Button
                  label="Share"
                  secondary
                  compact
                  onPress={() => void shareItem("group", g.id, g.name)}
                />
                {g.role === null ? (
                  <Button
                    label={g.memberCount >= g.capacity ? "Group full" : "Join"}
                    secondary
                    compact
                    disabled={g.memberCount >= g.capacity}
                    onPress={() => void act(() => client.joinGroup(g.id), `Joined ${g.name}.`)}
                  />
                ) : null}
                {g.role === "member" || g.role === "moderator" ? (
                  <Button
                    label="Leave"
                    danger
                    secondary
                    compact
                    onPress={() => void act(() => client.leaveGroup(g.id), `Left ${g.name}.`)}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Report Modal */}
      {reportingTarget ? (
        <ReportSheet
          visible={Boolean(reportingTarget)}
          targetType={reportingTarget.type}
          targetId={reportingTarget.id}
          targetLabel={reportingTarget.name}
          onClose={() => setReportingTarget(null)}
          onSuccess={() => {
            setNotice(`Report for ${reportingTarget.name} received. Thank you.`);
            setReportingTarget(null);
            void load();
          }}
        />
      ) : null}
    </View>
  );
}

function GroupForm({ activities, onDone }: { activities: Activity[]; onDone: () => void }) {
  const { colors, radius, space, type } = useTheme();
  const client = getCommunityClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState("");
  const [capacity, setCapacity] = useState("30");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await client.createGroup({
        name: name.trim(),
        description: description.trim(),
        generalArea: generalArea.trim(),
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
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: space[4],
          marginTop: space[3],
        },
      ]}
    >
      <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
        New group
      </Text>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Field label="Group name" value={name} onChangeText={setName} placeholder="e.g. Hiking Enthusiasts" />
      <Field
        label="What is it about?"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Describe the group's purpose and activities"
      />
      <Field
        label="General area (suburb or town, never an exact address)"
        value={generalArea}
        onChangeText={setGeneralArea}
        placeholder="e.g. Bulawayo Central"
      />
      <Field
        label="Maximum members"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="numeric"
      />

      <Text style={[styles.sectionSubtitle, { color: colors.text2, marginTop: space[2] }]}>
        Activities
      </Text>
      <View style={[styles.chipsRow, { marginTop: space[1] }]}>
        {activities.map((a) => {
          const isSelected = picked.includes(a.id);
          return (
            <Chip
              key={a.id}
              label={isSelected ? `✓ ${a.name}` : a.name}
              selected={isSelected}
              onPress={() =>
                setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))
              }
            />
          );
        })}
      </View>

      <Button
        label={busy ? "Creating group…" : "Create group"}
        disabled={busy || !name.trim() || !generalArea.trim()}
        onPress={() => void submit()}
        style={{ marginTop: space[4] }}
      />
    </View>
  );
}

function parseLocal(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function EventForm({ groups, onDone }: { groups: GroupSummary[]; onDone: () => void }) {
  const { colors, radius, space, type } = useTheme();
  const client = getCommunityClient();

  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [generalArea, setGeneralArea] = useState(groups[0]?.generalArea ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(offsetDays: number, startHour: number, durationHours: number = 2) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setStartsAt(`${ymd} ${pad(startHour)}:00`);
    setEndsAt(`${ymd} ${pad(startHour + durationHours)}:00`);
  }

  async function submit() {
    const start = parseLocal(startsAt);
    const end = parseLocal(endsAt);
    if (!start || !end) {
      setError("Please use the format YYYY-MM-DD HH:MM or tap a quick preset.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await client.createEvent({
        groupId,
        title: title.trim(),
        description: description.trim(),
        generalArea: generalArea.trim(),
        startsAt: start,
        endsAt: end,
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
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.line,
          borderRadius: radius.md,
          padding: space[4],
          marginTop: space[3],
        },
      ]}
    >
      <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
        New event
      </Text>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Text style={[styles.sectionSubtitle, { color: colors.text2, marginTop: space[2] }]}>
        Organising Group
      </Text>
      <View style={[styles.chipsRow, { marginTop: space[1] }]}>
        {groups.map((g) => (
          <Chip
            key={g.id}
            label={g.name}
            selected={g.id === groupId}
            onPress={() => {
              setGroupId(g.id);
              setGeneralArea(g.generalArea);
            }}
          />
        ))}
      </View>

      <Field label="Event title" value={title} onChangeText={setTitle} placeholder="e.g. Study circle, Weekend 5-a-side" />
      <Field
        label="Event details"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="What will you be doing and what should people bring?"
      />
      <Field
        label="General area (never an exact address)"
        value={generalArea}
        onChangeText={setGeneralArea}
      />

      <Text style={[styles.sectionSubtitle, { color: colors.text2, marginTop: space[2] }]}>
        Quick Date Presets
      </Text>
      <View style={[styles.createRow, { marginTop: space[1] }]}>
        <Button label="Tonight 18:00" secondary compact onPress={() => applyPreset(0, 18)} />
        <Button label="Tomorrow 17:00" secondary compact onPress={() => applyPreset(1, 17)} />
        <Button
          label="Saturday 14:00"
          secondary
          compact
          onPress={() => {
            const now = new Date();
            const daysToSat = (6 - now.getDay() + 7) % 7 || 7;
            applyPreset(daysToSat, 14, 3);
          }}
        />
      </View>

      <Field
        label="Starts (YYYY-MM-DD HH:MM)"
        value={startsAt}
        onChangeText={setStartsAt}
        placeholder="2026-10-20 18:00"
      />
      <Field
        label="Ends (YYYY-MM-DD HH:MM)"
        value={endsAt}
        onChangeText={setEndsAt}
        placeholder="2026-10-20 20:00"
      />
      <Field
        label="Capacity (Spots)"
        value={capacity}
        onChangeText={setCapacity}
        keyboardType="numeric"
      />

      <Button
        label={busy ? "Creating event…" : "Create event"}
        disabled={busy || !title.trim()}
        onPress={() => void submit()}
        style={{ marginTop: space[4] }}
      />
    </View>
  );
}

function GroupPage({
  group,
  events,
  onOpenEvent,
  onBack,
  onChanged,
  onReport,
}: {
  group: GroupSummary;
  events: CommunityEvent[];
  onOpenEvent: (id: string) => void;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onReport: (id: string, name: string) => void;
}) {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getCommunityClient();
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group.joined) {
      client.listMembers(group.id).then(setMembers).catch((e) => setError(errorMessage(e)));
    }
  }, [client, group.id, group.joined]);

  function remove() {
    Alert.alert(`Delete "${group.name}"?`, "All its events go too. This cannot be undone.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          client
            .deleteGroup(group.id)
            .then(async () => {
              await onChanged();
              onBack();
            })
            .catch((e) => setError(errorMessage(e)));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <View style={styles.topbarRow}>
          <Button label="← All" secondary compact onPress={onBack} />
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
              {group.name}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size }]}>
              {group.generalArea} · {group.memberCount}/{group.capacity} members
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report group ${group.name}`}
            onPress={() => onReport(group.id, group.name)}
            hitSlop={8}
            style={styles.flagBtn}
          >
            <Text style={[styles.flagText, { color: colors.textMuted }]}>⚑</Text>
          </Pressable>
        </View>

        {error ? <Banner tone="error">{error}</Banner> : null}

        {group.description ? (
          <Text style={[styles.eventDesc, { color: colors.text, fontSize: type.body.size, marginTop: space[3] }]}>
            {group.description}
          </Text>
        ) : null}

        <View style={[styles.actionsRow, { marginTop: space[3] }]}>
          {group.role === "owner" ? (
            <Button label="Delete group" danger compact onPress={remove} />
          ) : null}
        </View>
      </View>

      {/* Group Upcoming Events */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
            marginTop: space[3],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size }]}>
          Upcoming events
        </Text>
        {events.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[2] }]}>
            Nothing planned yet.
          </Text>
        ) : (
          events.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => onOpenEvent(e.id)}
              style={({ pressed }) => [
                styles.eventLinkRow,
                {
                  borderColor: colors.line,
                  borderBottomWidth: 1,
                  paddingVertical: space[3],
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={[styles.eventLinkTitle, { color: colors.accent, fontSize: type.body.size }]}>
                {e.title}
              </Text>
              <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.caption.size }]}>
                {fmt(e.startsAt)} · {e.going} going
              </Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Group Members List */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
            marginTop: space[3],
          },
          shadow[1],
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size }]}>
          Members
        </Text>
        {!group.joined ? (
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: space[2] }]}>
            Join the group to view members.
          </Text>
        ) : members === null ? (
          <ActivityIndicator style={{ padding: 16 }} color={colors.accent} />
        ) : (
          members.map((m) => (
            <View
              key={m.userId}
              style={[
                styles.memberRow,
                {
                  borderBottomColor: colors.line,
                  borderBottomWidth: 1,
                  paddingVertical: space[2],
                },
              ]}
            >
              <Text style={[styles.memberName, { color: colors.text, fontSize: type.body.size }]}>
                {m.displayName}
              </Text>
              {m.role !== "member" ? (
                <Badge label={m.role} tone="accent" compact />
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function EventPage({
  event,
  group,
  onBack,
  onChanged,
  onReport,
}: {
  event: CommunityEvent;
  group: GroupSummary | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onReport: (id: string, name: string) => void;
}) {
  const { colors, radius, space, type, shadow } = useTheme();
  const client = getCommunityClient();

  const [attendees, setAttendees] = useState<EventAttendee[] | null>(null);
  const [messages, setMessages] = useState<EventThreadMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
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
    } catch {
      // transient; the next poll retries
    }
  }, [client, event.id]);

  useEffect(() => {
    if (event.myStatus) {
      client.listAttendees(event.id).then(setAttendees).catch(() => undefined);
    }
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

  function submit() {
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

  function cancelEvent() {
    Alert.alert(`Cancel "${event.title}"?`, "Everyone who RSVP'd will lose their place.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel event",
        style: "destructive",
        onPress: () => {
          client
            .deleteEvent(event.id)
            .then(async () => {
              await onChanged();
              onBack();
            })
            .catch((e) => setError(errorMessage(e)));
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: radius.md,
            padding: space[4],
          },
          shadow[1],
        ]}
      >
        <View style={styles.topbarRow}>
          <Button label="← All" secondary compact onPress={onBack} />
          <View style={{ flex: 1, marginHorizontal: 8 }}>
            <Text style={[styles.eventTitle, { color: colors.text, fontSize: type.title.size }]}>
              {event.title}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.small.size }]}>
              {event.groupName} · {event.generalArea}
            </Text>
            <Text style={[styles.muted, { color: colors.textMuted, fontSize: type.caption.size }]}>
              {fmt(event.startsAt)} to {fmt(event.endsAt)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Report event ${event.title}`}
            onPress={() => onReport(event.id, event.title)}
            hitSlop={8}
            style={styles.flagBtn}
          >
            <Text style={[styles.flagText, { color: colors.textMuted }]}>⚑</Text>
          </Pressable>
        </View>

        {error ? <Banner tone="error">{error}</Banner> : null}

        {event.description ? (
          <Text style={[styles.eventDesc, { color: colors.text, fontSize: type.body.size, marginTop: space[3] }]}>
            {event.description}
          </Text>
        ) : null}

        <View style={[styles.statusSummaryRow, { marginTop: space[3] }]}>
          <Text style={[styles.statusTextBold, { color: colors.text }]}>
            {event.going} of {event.capacity} spots taken
          </Text>
          {event.myStatus ? (
            <Badge
              label={event.myStatus === "going" ? "You are going" : "You are on the waitlist"}
              tone={event.myStatus === "going" ? "success" : "warning"}
              compact
            />
          ) : null}
        </View>

        <View style={[styles.actionsRow, { marginTop: space[3] }]}>
          {event.myStatus ? (
            <Button label="Cancel RSVP" danger secondary compact onPress={() => void rsvp(false)} />
          ) : group?.joined === false ? (
            <Text style={[styles.muted, { color: colors.textMuted }]}>
              Join "{event.groupName}" to RSVP.
            </Text>
          ) : (
            <Button
              label={event.going >= event.capacity ? "Join waitlist" : "I'm going"}
              compact
              onPress={() => void rsvp(true)}
            />
          )}

          {canManage ? (
            <Button label="Cancel event" danger secondary compact onPress={cancelEvent} />
          ) : null}
        </View>

        {attendees && attendees.length > 0 ? (
          <Text style={[styles.attendeesList, { color: colors.textMuted, marginTop: space[2] }]}>
            Going: {attendees.map((a) => a.displayName).join(", ")}
          </Text>
        ) : null}
      </View>

      {/* Event Chat */}
      {going ? (
        <View style={{ marginTop: space[3] }}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: type.title.size, marginBottom: 6 }]}>
            Attendee Chat
          </Text>

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
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          >
            {hasMore ? (
              <Button
                label="Load older messages"
                secondary
                compact
                onPress={() => void loadOlder()}
                style={{ alignSelf: "center", marginBottom: space[2] }}
              />
            ) : null}

            {messages.length === 0 ? (
              <Text style={[styles.muted, { color: colors.textMuted, textAlign: "center", paddingVertical: 12 }]}>
                No messages yet. Say hello to everyone who is going!
              </Text>
            ) : null}

            {messages.map((m) => {
              const mine = m.senderId === "me" || !!m.pending || !!m.failed;
              return (
                <View key={m.id} style={[styles.bubbleRow, mine ? styles.right : styles.left]}>
                  <View
                    style={[
                      styles.bubble,
                      {
                        borderRadius: radius.md,
                        paddingVertical: space[2],
                        paddingHorizontal: space[3],
                        backgroundColor: mine ? colors.accent : colors.surface,
                        borderColor: mine ? colors.accent : colors.line,
                        borderWidth: 1,
                      },
                      m.pending && { opacity: 0.6 },
                      m.failed && { backgroundColor: colors.danger, borderColor: colors.danger },
                    ]}
                  >
                    {!mine ? (
                      <Text style={[styles.senderName, { color: colors.accent }]}>{m.senderName}</Text>
                    ) : null}
                    <Text
                      style={[
                        styles.bubbleBody,
                        {
                          color: mine ? colors.onAccent : colors.text,
                        },
                      ]}
                    >
                      {m.body}
                    </Text>
                    <Text
                      style={[
                        styles.meta,
                        {
                          color: mine ? colors.accentLine : colors.textMuted,
                        },
                      ]}
                    >
                      {m.pending
                        ? "Sending…"
                        : m.failed
                        ? "Not sent"
                        : new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>

                    {m.failed ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setMessages((c) => c.filter((x) => x.id !== m.id));
                          void send(m.body, m.clientTag);
                        }}
                        style={{ marginTop: 4 }}
                      >
                        <Text style={{ color: colors.onAccent, fontWeight: "700", fontSize: 13 }}>Retry</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Chat Composer */}
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
              placeholder="Write to everyone going…"
              placeholderTextColor={colors.textMuted}
              maxLength={2000}
              multiline
              accessibilityLabel="Event message"
            />
            <Button
              label={sending ? "…" : "Send"}
              compact
              onPress={submit}
              disabled={sending || !draft.trim()}
              style={{ minWidth: 64 }}
            />
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceSunken,
              borderColor: colors.line,
              borderRadius: radius.md,
              padding: space[4],
              marginTop: space[3],
            },
          ]}
        >
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            {event.myStatus === "waitlisted"
              ? "You can join the event chat once a spot opens up for you."
              : "RSVP to join the attendee chat."}
          </Text>
        </View>
      )}
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
  tabSwitchRow: {
    flexDirection: "row",
    gap: 10,
  },
  createRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  loaderWrap: {
    paddingVertical: 48,
    alignItems: "center",
  },
  muted: {
    fontSize: 13,
    lineHeight: 18,
  },
  eventTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  eventTitle: {
    fontWeight: "700",
  },
  eventDesc: {
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  sectionTitle: {
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  topbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flagBtn: {
    padding: 6,
  },
  flagText: {
    fontSize: 16,
  },
  eventLinkRow: {
    gap: 2,
  },
  eventLinkTitle: {
    fontWeight: "700",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  memberName: {
    fontWeight: "500",
  },
  statusSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusTextBold: {
    fontSize: 14,
    fontWeight: "600",
  },
  attendeesList: {
    fontSize: 12,
    lineHeight: 16,
  },
  chat: {
    maxHeight: 380,
    minHeight: 200,
    borderWidth: 1,
  },
  bubbleRow: {
    flexDirection: "row",
    marginVertical: 4,
  },
  left: {
    justifyContent: "flex-start",
  },
  right: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "80%",
  },
  senderName: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    fontSize: 10,
    marginTop: 2,
    alignSelf: "flex-end",
  },
  composer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    fontSize: 15,
  },
});
