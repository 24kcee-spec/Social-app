import type { CommunityEvent, EventAttendee, EventMessage, EventMessagePage, GroupMember, GroupSummary, RsvpStatus } from "@sp/types";
import type { SqlRunner } from "../migrate";

export class CommunityError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "full" | "invalid" | "onboarding_required" | "limit_reached" | "rate_limited" | "daily_limit",
    message: string,
  ) { super(message); }
}

export const COMMUNITY_LIMITS = { maxOwnedGroups: 5, chatPerMinute: 20, chatPerDay: 400, pageSize: 50, pageMax: 100 } as const;

const text = (v: unknown): string => String(v);
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
type Row = Record<string, unknown>;
const CURSOR_TIME = /^\d{4}-\d\d-\d\d[ T][\d:.]+([+-]\d\d(:?\d\d)?|Z)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs work one at a time per key inside this API process, so "count then insert" capacity checks cannot
 * interleave (two people grabbing the last seat). One API instance is covered fully; several instances could
 * overshoot by a seat (same trade-off as D-031).
 */
const locks = new Map<string, Promise<unknown>>();
function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}

/** Hides anything owned/hosted by someone who is inactive or in a block with the viewer (both directions), like discovery. */
const BLOCKED_WITH = (viewer: string, other: string) =>
  `not exists (select 1 from user_blocks b where (b.blocker_id = ${viewer} and b.blocked_id = ${other}) or (b.blocker_id = ${other} and b.blocked_id = ${viewer}))`;

const GROUP_SELECT = `
  select g.id::text as id, g.name, g.description, g.general_area, g.capacity, g.owner_id::text as owner_id,
         (select count(*) from group_members gm where gm.group_id = g.id)::int as member_count,
         (select gm.role from group_members gm where gm.group_id = g.id and gm.user_id = $1) as my_role,
         coalesce((select array_agg(a.name order by a.name) from group_activities ga join activities a on a.id = ga.activity_id where ga.group_id = g.id), '{}') as activities
    from groups g
    join users owner on owner.id = g.owner_id and owner.status = 'active'
   where ${BLOCKED_WITH("$1::uuid", "g.owner_id")}`;

const EVENT_SELECT = `
  select e.id::text as id, e.group_id::text as group_id, g.name as group_name, e.title, e.description, e.general_area,
         e.starts_at, e.ends_at, e.capacity,
         (select count(*) from event_rsvps x where x.event_id = e.id and x.status = 'going')::int as going,
         (select x.status from event_rsvps x where x.event_id = e.id and x.user_id = $1 and x.status in ('going', 'waitlisted')) as my_status
    from events e
    join groups g on g.id = e.group_id
    join users host on host.id = e.host_id and host.status = 'active'
   where ${BLOCKED_WITH("$1::uuid", "e.host_id")}`;

function toGroup(x: Row): GroupSummary {
  const role = (x.my_role as GroupSummary["role"]) ?? null;
  return {
    id: text(x.id), name: text(x.name), description: text(x.description), generalArea: text(x.general_area), capacity: Number(x.capacity),
    memberCount: Number(x.member_count), joined: role !== null, role, ownerId: text(x.owner_id), activities: (x.activities as string[] | null) ?? [],
  };
}
function toEvent(x: Row): CommunityEvent {
  const myStatus = (x.my_status as "going" | "waitlisted" | null) ?? null;
  return {
    id: text(x.id), groupId: text(x.group_id), groupName: text(x.group_name), title: text(x.title), description: text(x.description), generalArea: text(x.general_area),
    startsAt: iso(x.starts_at), endsAt: iso(x.ends_at), capacity: Number(x.capacity), going: Number(x.going), attending: myStatus !== null, myStatus,
  };
}

export function createCommunityStore(db: SqlRunner, clock: () => Date = () => new Date()) {
  const q = <T extends Row = Row>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);

  async function roleIn(userId: string, groupId: string): Promise<string | null> {
    return (await q<{ role: string }>(`select role from group_members where group_id = $1 and user_id = $2`, [groupId, userId])).rows[0]?.role ?? null;
  }
  async function milestone(userId: string, name: "first_group_join" | "first_rsvp") {
    await q(`insert into activation_milestones (user_id, milestone, reached_at) values ($1, $2, $3::timestamptz) on conflict do nothing`, [userId, name, clock().toISOString()]);
  }

  const store = {
    // ---------- activities ----------
    async listActivities() {
      return (await q(`select id::text as id, name, description from activities where active order by name`)).rows.map((x) => ({ id: text(x.id), name: text(x.name), description: text(x.description) }));
    },

    // ---------- groups ----------
    async listGroups(me: string, opts: { generalArea?: string; activityId?: string } = {}): Promise<GroupSummary[]> {
      const { rows } = await q(
        `${GROUP_SELECT}
           and ($2::text is null or lower(g.general_area) = lower($2))
           and ($3::uuid is null or exists (select 1 from group_activities ga where ga.group_id = g.id and ga.activity_id = $3))
         order by g.created_at desc, g.id limit 100`,
        [me, opts.generalArea?.trim() || null, opts.activityId ?? null]);
      return rows.map(toGroup);
    },
    async getGroup(me: string, id: string): Promise<GroupSummary> {
      const { rows } = await q(`${GROUP_SELECT} and g.id = $2`, [me, id]);
      if (!rows[0]) throw new CommunityError("not_found", "Group not found");
      return toGroup(rows[0]);
    },
    createGroup(me: string, input: { name: string; description: string; generalArea: string; capacity: number; activityIds: string[] }): Promise<GroupSummary> {
      return serialised(`owner:${me}`, async () => {
        const ok = await q(`select 1 from profiles where user_id = $1 and onboarding_completed`, [me]);
        if (!ok.rows[0]) throw new CommunityError("onboarding_required", "Finish your profile before creating a group");
        const owned = await q<{ n: number }>(`select count(*)::int as n from groups where owner_id = $1`, [me]);
        if (Number(owned.rows[0]?.n) >= COMMUNITY_LIMITS.maxOwnedGroups) throw new CommunityError("limit_reached", `You can run up to ${COMMUNITY_LIMITS.maxOwnedGroups} groups`);
        const r = await q<{ id: string }>(
          `insert into groups (name, description, general_area, owner_id, capacity) values ($1, $2, $3, $4, $5) returning id::text as id`,
          [input.name.trim(), input.description.trim(), input.generalArea.trim(), me, input.capacity]);
        const id = r.rows[0]!.id;
        await q(`insert into group_members (group_id, user_id, role) values ($1, $2, 'owner')`, [id, me]);
        for (const activityId of new Set(input.activityIds)) {
          await q(`insert into group_activities (group_id, activity_id) select $1, id from activities where id = $2 and active on conflict do nothing`, [id, activityId]);
        }
        await milestone(me, "first_group_join");
        return store.getGroup(me, id);
      });
    },
    joinGroup(me: string, id: string): Promise<void> {
      return serialised(`group:${id}`, async () => {
        const group = await store.getGroup(me, id);
        if (group.joined) return;
        const ok = await q(`select 1 from profiles where user_id = $1 and onboarding_completed`, [me]);
        if (!ok.rows[0]) throw new CommunityError("onboarding_required", "Finish your profile before joining a group");
        if (group.memberCount >= group.capacity) throw new CommunityError("full", "This group is full");
        await q(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [id, me]);
        await milestone(me, "first_group_join");
      });
    },
    async leaveGroup(me: string, id: string): Promise<void> {
      const role = await roleIn(me, id);
      if (!role) throw new CommunityError("not_found", "Group not found");
      if (role === "owner") throw new CommunityError("forbidden", "The group owner cannot leave; delete the group instead");
      await q(`delete from group_members where group_id = $1 and user_id = $2`, [id, me]);
      // Seats for this group's upcoming events are released too (and the waitlist moves up).
      const { rows } = await q(`select r.event_id::text as id from event_rsvps r join events e on e.id = r.event_id where e.group_id = $1 and r.user_id = $2 and r.status in ('going','waitlisted') and e.ends_at >= $3::timestamptz`, [id, me, clock().toISOString()]);
      for (const r of rows) await store.cancelRsvp(me, text(r.id));
    },
    async deleteGroup(me: string, id: string): Promise<void> {
      const role = await roleIn(me, id);
      if (!role) throw new CommunityError("not_found", "Group not found");
      if (role !== "owner") throw new CommunityError("forbidden", "Only the owner can delete a group");
      await q(`delete from groups where id = $1`, [id]);
    },
    async listMembers(me: string, groupId: string): Promise<GroupMember[]> {
      if (!(await roleIn(me, groupId))) throw new CommunityError("forbidden", "Join the group to see its members");
      const { rows } = await q(
        `select m.user_id::text as user_id, coalesce(p.display_name, 'Member') as display_name, m.role
           from group_members m join users u on u.id = m.user_id and u.status = 'active' left join profiles p on p.user_id = m.user_id
          where m.group_id = $1 and ${BLOCKED_WITH("$2::uuid", "m.user_id")}
          order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, m.joined_at, m.user_id`, [groupId, me]);
      return rows.map((x) => ({ userId: text(x.user_id), displayName: text(x.display_name), role: x.role as GroupMember["role"] }));
    },

    // ---------- events ----------
    async createEvent(me: string, input: { groupId: string; title: string; description: string; generalArea: string; startsAt: string; endsAt: string; capacity: number }): Promise<CommunityEvent> {
      const role = await roleIn(me, input.groupId);
      if (!role) throw new CommunityError("forbidden", "Join the group before creating an event");
      if (role !== "owner" && role !== "moderator") throw new CommunityError("forbidden", "Only group owners and moderators can create events");
      const start = new Date(input.startsAt), end = new Date(input.endsAt);
      if (!(end > start)) throw new CommunityError("invalid", "The event must end after it starts");
      if (start <= clock()) throw new CommunityError("invalid", "The event must start in the future");
      const r = await q<{ id: string }>(
        `insert into events (group_id, host_id, title, description, general_area, starts_at, ends_at, capacity) values ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8) returning id::text as id`,
        [input.groupId, me, input.title.trim(), input.description.trim(), input.generalArea.trim(), start.toISOString(), end.toISOString(), input.capacity]);
      return store.getEvent(me, r.rows[0]!.id);
    },
    async listEvents(me: string, opts: { generalArea?: string; groupId?: string } = {}): Promise<CommunityEvent[]> {
      const { rows } = await q(
        `${EVENT_SELECT}
           and e.ends_at >= $2::timestamptz
           and ($3::text is null or lower(e.general_area) = lower($3))
           and ($4::uuid is null or e.group_id = $4)
         order by e.starts_at, e.id limit 100`,
        [me, clock().toISOString(), opts.generalArea?.trim() || null, opts.groupId ?? null]);
      return rows.map(toEvent);
    },
    async getEvent(me: string, id: string): Promise<CommunityEvent> {
      const { rows } = await q(`${EVENT_SELECT} and e.id = $2`, [me, id]);
      if (!rows[0]) throw new CommunityError("not_found", "Event not found");
      return toEvent(rows[0]);
    },
    async deleteEvent(me: string, id: string): Promise<void> {
      const { rows } = await q<{ group_id: string; host_id: string }>(`select group_id::text as group_id, host_id::text as host_id from events where id = $1`, [id]);
      if (!rows[0]) throw new CommunityError("not_found", "Event not found");
      const role = await roleIn(me, text(rows[0].group_id));
      if (text(rows[0].host_id) !== me && role !== "owner" && role !== "moderator") throw new CommunityError("forbidden", "Only the host or a group moderator can cancel an event");
      await q(`delete from events where id = $1`, [id]);
    },

    // ---------- RSVP + waitlist ----------
    rsvp(me: string, id: string): Promise<{ status: RsvpStatus }> {
      return serialised(`event:${id}`, async () => {
        const event = await store.getEvent(me, id);
        if (new Date(event.endsAt) < clock()) throw new CommunityError("invalid", "This event has already finished");
        if (!(await roleIn(me, event.groupId))) throw new CommunityError("forbidden", "Join the group to RSVP to its events");
        if (event.myStatus) return { status: event.myStatus }; // already in: never demote a seat holder to the waitlist
        const status: RsvpStatus = event.going < event.capacity ? "going" : "waitlisted";
        await q(
          `insert into event_rsvps (event_id, user_id, status, updated_at) values ($1, $2, $3, $4::timestamptz)
           on conflict (event_id, user_id) do update set status = excluded.status, updated_at = excluded.updated_at`, [id, me, status, clock().toISOString()]);
        await milestone(me, "first_rsvp");
        return { status };
      });
    },
    cancelRsvp(me: string, id: string): Promise<void> {
      return serialised(`event:${id}`, async () => {
        const cur = await q<{ status: string }>(`select status from event_rsvps where event_id = $1 and user_id = $2`, [id, me]);
        const was = cur.rows[0]?.status;
        if (!was || was === "cancelled") return; // idempotent
        await q(`update event_rsvps set status = 'cancelled', updated_at = $3::timestamptz where event_id = $1 and user_id = $2`, [id, me, clock().toISOString()]);
        if (was !== "going") return;
        // A seat opened: the longest-waiting person moves up.
        await q(
          `update event_rsvps set status = 'going', updated_at = $2::timestamptz
            where (event_id, user_id) = (select event_id, user_id from event_rsvps where event_id = $1 and status = 'waitlisted' order by updated_at, user_id limit 1)`,
          [id, clock().toISOString()]);
      });
    },
    async listAttendees(me: string, eventId: string): Promise<EventAttendee[]> {
      await store.getEvent(me, eventId);
      const mine = await q(`select 1 from event_rsvps where event_id = $1 and user_id = $2 and status in ('going','waitlisted')`, [eventId, me]);
      if (!mine.rows[0]) throw new CommunityError("forbidden", "RSVP to see who is going");
      const { rows } = await q(
        `select r.user_id::text as user_id, coalesce(p.display_name, 'Member') as display_name
           from event_rsvps r join users u on u.id = r.user_id and u.status = 'active' left join profiles p on p.user_id = r.user_id
          where r.event_id = $1 and r.status = 'going' and ${BLOCKED_WITH("$2::uuid", "r.user_id")}
          order by r.updated_at, r.user_id`, [eventId, me]);
      return rows.map((x) => ({ userId: text(x.user_id), displayName: text(x.display_name) }));
    },

    // ---------- attendee-only event chat ----------
    async listEventMessages(me: string, eventId: string, opts: { limit?: number; before?: string } = {}): Promise<EventMessagePage> {
      await requireGoing(me, eventId);
      const limit = Math.min(Math.max(1, opts.limit ?? COMMUNITY_LIMITS.pageSize), COMMUNITY_LIMITS.pageMax);
      let cursorClause = "";
      const params: unknown[] = [eventId, me, limit + 1];
      if (opts.before) {
        const [at, id] = opts.before.split("~");
        if (!at || !id || !CURSOR_TIME.test(at) || !UUID_RE.test(id)) throw new CommunityError("invalid", "Bad page cursor");
        params.push(at, id);
        cursorClause = `and (m.created_at, m.id) < ($4::timestamptz, $5::uuid)`;
      }
      const { rows } = await q(
        `select m.id::text as id, m.sender_id::text as sender_id, coalesce(p.display_name, 'Member') as sender_name, m.body, m.client_tag::text as client_tag, m.created_at, m.created_at::text as created_at_raw
           from event_messages m left join profiles p on p.user_id = m.sender_id
          where m.event_id = $1 and ${BLOCKED_WITH("$2::uuid", "m.sender_id")} ${cursorClause}
          order by m.created_at desc, m.id desc limit $3`, params);
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const oldest = page[page.length - 1];
      return {
        messages: page.reverse().map((x) => toMessage(eventId, x)),
        hasMore,
        nextCursor: hasMore && oldest ? `${text(oldest.created_at_raw)}~${text(oldest.id)}` : null,
      };
    },
    sendEventMessage(me: string, eventId: string, body: string, clientTag: string): Promise<EventMessage> {
      return serialised(`chat:${me}`, async () => {
        await requireGoing(me, eventId);
        const replay = await q(`select m.id::text as id, m.sender_id::text as sender_id, coalesce(p.display_name, 'Member') as sender_name, m.body, m.client_tag::text as client_tag, m.created_at from event_messages m left join profiles p on p.user_id = m.sender_id where m.event_id = $1 and m.sender_id = $2 and m.client_tag = $3`, [eventId, me, clientTag]);
        if (replay.rows[0]) return toMessage(eventId, replay.rows[0]); // safe retry, never a duplicate and never rate-limited
        const now = clock();
        const minute = await q<{ n: number }>(`select count(*)::int as n from event_messages where sender_id = $1 and created_at > $2::timestamptz`, [me, new Date(now.getTime() - 60_000).toISOString()]);
        if (Number(minute.rows[0]?.n) >= COMMUNITY_LIMITS.chatPerMinute) throw new CommunityError("rate_limited", "Slow down a little");
        const day = await q<{ n: number }>(`select count(*)::int as n from event_messages where sender_id = $1 and created_at > $2::timestamptz`, [me, new Date(now.getTime() - 86_400_000).toISOString()]);
        if (Number(day.rows[0]?.n) >= COMMUNITY_LIMITS.chatPerDay) throw new CommunityError("daily_limit", "Daily message limit reached");
        const r = await q(
          `insert into event_messages (event_id, sender_id, body, client_tag, created_at) values ($1, $2, $3, $4, $5::timestamptz)
           returning id::text as id, sender_id::text as sender_id, (select coalesce(display_name, 'Member') from profiles where user_id = $2) as sender_name, body, client_tag::text as client_tag, created_at`,
          [eventId, me, body.trim(), clientTag, now.toISOString()]);
        return toMessage(eventId, r.rows[0]!);
      });
    },
  };

  async function requireGoing(me: string, eventId: string) {
    const ev = await q(`select 1 from events e where e.id = $1`, [eventId]);
    if (!ev.rows[0]) throw new CommunityError("not_found", "Event not found");
    const ok = await q(`select 1 from event_rsvps where event_id = $1 and user_id = $2 and status = 'going'`, [eventId, me]);
    if (!ok.rows[0]) throw new CommunityError("forbidden", "Only people who are going can use the event chat");
  }
  function toMessage(eventId: string, x: Row): EventMessage {
    return { id: text(x.id), eventId, senderId: text(x.sender_id), senderName: text(x.sender_name ?? "Member"), body: text(x.body), clientTag: text(x.client_tag), createdAt: iso(x.created_at) };
  }
  return store;
}
export type CommunityStore = ReturnType<typeof createCommunityStore>;
