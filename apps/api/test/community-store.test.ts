import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { COMMUNITY_LIMITS, CommunityError, createCommunityStore } from "../src/community/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let NOW = new Date("2026-10-12T12:00:00.000Z");
const U = (n: number) => `a${n}000000-0000-4000-8000-000000000000`;
const [OWNER, ANN, BEN, CY, DEE] = [U(1), U(2), U(3), U(4), U(5)];
const TAG = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
const store = () => createCommunityStore(db, () => NOW);
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof CommunityError ? e.code : "other:" + String(e)));
const NAMES: Record<string, string> = { [OWNER]: "Owen", [ANN]: "Ann", [BEN]: "Ben", [CY]: "Cy", [DEE]: "Dee", [U(6)]: "Fay" };

async function person(id: string, onboarded = true) {
  await db.query(`insert into users (id, email) values ($1, $2)`, [id, `${NAMES[id]!.toLowerCase()}@example.com`]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed) values ($1, $2, '', '{low_pressure}', true, $3)`, [id, NAMES[id], onboarded]);
}
const mkGroup = (capacity = 30, area = "Bulawayo") => store().createGroup(OWNER, { name: "Study club", description: "", generalArea: area, capacity, activityIds: [] });
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const mkEvent = (groupId: string, capacity = 3, startH = 24) => store().createEvent(OWNER, { groupId, title: "Library night", description: "", generalArea: "Bulawayo", startsAt: inHours(startH), endsAt: inHours(startH + 2), capacity });
async function setup(capacity = 3) {
  const g = await mkGroup();
  for (const p of [ANN, BEN, CY, DEE]) await store().joinGroup(p, g.id);
  return { g, e: await mkEvent(g.id, capacity) };
}
const statuses = async (eventId: string) => Object.fromEntries((await db.query<{ user_id: string; status: string }>(`select user_id::text, status from event_rsvps where event_id = $1`, [eventId])).rows.map((r) => [r.user_id, r.status]));

beforeAll(async () => { db = new PGlite(); await runMigrations(db, dir); });
beforeEach(async () => {
  NOW = new Date("2026-10-12T12:00:00.000Z");
  await db.exec("truncate users cascade");
  for (const id of [OWNER, ANN, BEN, CY, DEE]) await person(id);
});

describe("database safety", () => {
  it("has row level security on every community table, including event_messages", async () => {
    const { rows } = await db.query<{ relname: string }>(`select relname from pg_class where relnamespace = 'public'::regnamespace and relname in ('groups','group_members','activities','group_activities','events','event_rsvps','event_messages') and relrowsecurity`);
    expect(rows.map((r) => r.relname).sort()).toEqual(["activities", "event_messages", "event_rsvps", "events", "group_activities", "group_members", "groups"]);
  });
  it("allows only one owner per group", async () => {
    const g = await mkGroup();
    await expect(db.query(`insert into group_members (group_id, user_id, role) values ($1, $2, 'owner')`, [g.id, ANN])).rejects.toThrow();
  });
});

describe("groups", () => {
  it("creates a group with its owner, activities and a milestone; seeded activities are listed", async () => {
    const acts = await store().listActivities();
    expect(acts.map((a) => a.name)).toEqual(["Fitness", "Football", "Gaming", "Study", "Tech"]);
    const g = await store().createGroup(OWNER, { name: "Five-a-side", description: "Weekends", generalArea: "Bulawayo", capacity: 10, activityIds: [acts[1]!.id, acts[1]!.id, "c0000000-0000-4000-8000-000000000000"] });
    expect(g).toMatchObject({ role: "owner", joined: true, memberCount: 1, activities: ["Football"] });
    const { rows } = await db.query(`select 1 from activation_milestones where user_id = $1 and milestone = 'first_group_join'`, [OWNER]);
    expect(rows).toHaveLength(1);
  });
  it("requires a finished profile and caps how many groups one person runs", async () => {
    await person(U(6), false);
    expect(await code(store().createGroup(U(6), { name: "Nope", description: "", generalArea: "Bulawayo", capacity: 5, activityIds: [] }))).toBe("onboarding_required");
    for (let i = 0; i < COMMUNITY_LIMITS.maxOwnedGroups; i++) await mkGroup();
    expect(await code(mkGroup())).toBe("limit_reached");
  });
  it("joins once, refuses when full, never lets the owner leave, and filters areas case-insensitively", async () => {
    const g = await mkGroup(2);
    await store().joinGroup(ANN, g.id);
    await store().joinGroup(ANN, g.id); // idempotent
    expect((await store().getGroup(ANN, g.id)).memberCount).toBe(2);
    expect(await code(store().joinGroup(BEN, g.id))).toBe("full");
    expect(await code(store().leaveGroup(OWNER, g.id))).toBe("forbidden");
    await store().leaveGroup(ANN, g.id);
    expect(await code(store().leaveGroup(ANN, g.id))).toBe("not_found");
    expect((await store().listGroups(BEN, { generalArea: "bulawayo" })).map((x) => x.id)).toEqual([g.id]);
    expect(await store().listGroups(BEN, { generalArea: "Harare" })).toEqual([]);
  });
  it("lets only the last seat go to one of many racing joiners", async () => {
    const g = await mkGroup(3);
    const res = await Promise.all([ANN, BEN, CY, DEE].map((p) => code(store().joinGroup(p, g.id))));
    expect(res.filter((r) => r === "ok")).toHaveLength(2);
    expect(res.filter((r) => r === "full")).toHaveLength(2);
  });
  it("hides groups run by a person in a block with the viewer, in both directions", async () => {
    const g = await mkGroup();
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ANN, OWNER]);
    expect(await store().listGroups(ANN)).toEqual([]);
    expect(await code(store().getGroup(ANN, g.id))).toBe("not_found");
    expect((await store().listGroups(BEN)).length).toBe(1);
  });
  it("shows the member list only to members, without blocked people, and deletes only for the owner", async () => {
    const g = await mkGroup();
    await store().joinGroup(ANN, g.id); await store().joinGroup(BEN, g.id);
    expect(await code(store().listMembers(CY, g.id))).toBe("forbidden");
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ANN, BEN]);
    expect((await store().listMembers(ANN, g.id)).map((m) => m.displayName)).toEqual(["Owen", "Ann"]);
    expect(await code(store().deleteGroup(ANN, g.id))).toBe("forbidden");
    expect(await code(store().deleteGroup(OWNER, g.id))).toBe("ok");
    expect(await code(store().getGroup(OWNER, g.id))).toBe("not_found");
  });
});

describe("events", () => {
  it("lets only owners and moderators create future, correctly ordered events", async () => {
    const g = await mkGroup();
    await store().joinGroup(ANN, g.id);
    expect(await code(mkEvent(g.id))).toBe("ok");
    const input = { groupId: g.id, title: "Late", description: "", generalArea: "Bulawayo", startsAt: inHours(5), endsAt: inHours(6), capacity: 4 };
    expect(await code(store().createEvent(ANN, input))).toBe("forbidden");
    expect(await code(store().createEvent(CY, input))).toBe("forbidden");
    expect(await code(store().createEvent(OWNER, { ...input, startsAt: inHours(-1), endsAt: inHours(1) }))).toBe("invalid");
    expect(await code(store().createEvent(OWNER, { ...input, endsAt: inHours(4) }))).toBe("invalid");
    await db.query(`update group_members set role = 'moderator' where group_id = $1 and user_id = $2`, [g.id, ANN]);
    expect(await code(store().createEvent(ANN, input))).toBe("ok");
  });
  it("lists upcoming events only, filters by area and group, and drops finished ones", async () => {
    const { g, e } = await setup();
    expect((await store().listEvents(ANN)).map((x) => x.id)).toEqual([e.id]);
    expect((await store().listEvents(ANN, { generalArea: "BULAWAYO", groupId: g.id })).length).toBe(1);
    expect(await store().listEvents(ANN, { generalArea: "Gweru" })).toEqual([]);
    NOW = new Date(NOW.getTime() + 48 * 3_600_000);
    expect(await store().listEvents(ANN)).toEqual([]);
  });
  it("lets the host or a moderator cancel an event and nobody else", async () => {
    const { e } = await setup();
    expect(await code(store().deleteEvent(ANN, e.id))).toBe("forbidden");
    expect(await code(store().deleteEvent(OWNER, e.id))).toBe("ok");
    expect(await code(store().getEvent(OWNER, e.id))).toBe("not_found");
  });
});

describe("RSVP and waitlist", () => {
  it("needs group membership and refuses finished events", async () => {
    const { e } = await setup();
    await person(U(6));
    expect(await code(store().rsvp(U(6), e.id))).toBe("forbidden"); // not in the group
    NOW = new Date(NOW.getTime() + 72 * 3_600_000);
    expect(await code(store().rsvp(ANN, e.id))).toBe("invalid");
  });
  it("fills seats, then waitlists, and never demotes someone who already has a seat", async () => {
    const { e } = await setup(2);
    expect(await store().rsvp(ANN, e.id)).toEqual({ status: "going" });
    expect(await store().rsvp(BEN, e.id)).toEqual({ status: "going" });
    expect(await store().rsvp(CY, e.id)).toEqual({ status: "waitlisted" });
    expect(await store().rsvp(ANN, e.id)).toEqual({ status: "going" }); // event is full, Ann keeps her seat
    expect(await store().rsvp(CY, e.id)).toEqual({ status: "waitlisted" });
    expect((await store().getEvent(DEE, e.id)).going).toBe(2);
  });
  it("gives exactly the capacity to racing RSVPs", async () => {
    const { e } = await setup(2);
    const res = await Promise.all([ANN, BEN, CY, DEE].map((p) => store().rsvp(p, e.id)));
    expect(res.filter((r) => r.status === "going")).toHaveLength(2);
    expect(res.filter((r) => r.status === "waitlisted")).toHaveLength(2);
  });
  it("promotes the longest-waiting person when a seat opens, and cancelling twice is harmless", async () => {
    const { e } = await setup(1);
    await store().rsvp(ANN, e.id);
    NOW = new Date(NOW.getTime() + 1000); await store().rsvp(BEN, e.id);
    NOW = new Date(NOW.getTime() + 1000); await store().rsvp(CY, e.id);
    await store().cancelRsvp(ANN, e.id);
    await store().cancelRsvp(ANN, e.id);
    expect(await statuses(e.id)).toEqual({ [ANN]: "cancelled", [BEN]: "going", [CY]: "waitlisted" });
    await store().cancelRsvp(CY, e.id); // leaving the waitlist promotes nobody
    expect((await store().getEvent(BEN, e.id)).going).toBe(1);
  });
  it("releases seats when someone leaves the group, and records the first_rsvp milestone", async () => {
    const { g, e } = await setup(1);
    await store().rsvp(ANN, e.id); await store().rsvp(BEN, e.id);
    await store().leaveGroup(ANN, g.id);
    expect((await statuses(e.id))[BEN]).toBe("going");
    expect((await db.query(`select 1 from activation_milestones where user_id = $1 and milestone = 'first_rsvp'`, [ANN])).rows).toHaveLength(1);
  });
  it("shows attendee names only to attendees, minus blocked people", async () => {
    const { e } = await setup(5);
    await store().rsvp(ANN, e.id); await store().rsvp(BEN, e.id);
    expect(await code(store().listAttendees(CY, e.id))).toBe("forbidden");
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ANN, BEN]);
    expect((await store().listAttendees(ANN, e.id)).map((a) => a.displayName)).toEqual(["Ann"]);
  });
});

describe("event chat", () => {
  async function chat() { const s = await setup(5); await store().rsvp(ANN, s.e.id); await store().rsvp(BEN, s.e.id); return s.e.id; }
  it("is for people who are going: waitlisted, cancelled and outsiders are refused", async () => {
    const { e } = await setup(1);
    await store().rsvp(ANN, e.id); await store().rsvp(BEN, e.id); // Ben waitlisted
    expect(await code(store().sendEventMessage(BEN, e.id, "hi", TAG(1)))).toBe("forbidden");
    expect(await code(store().listEventMessages(BEN, e.id))).toBe("forbidden");
    expect(await code(store().listEventMessages(CY, e.id))).toBe("forbidden");
    await store().cancelRsvp(ANN, e.id); // Ben promoted
    expect(await code(store().sendEventMessage(BEN, e.id, "hi", TAG(2)))).toBe("ok");
    expect(await code(store().sendEventMessage(ANN, e.id, "hi", TAG(3)))).toBe("forbidden");
  });
  it("is idempotent per client tag and carries the sender's name", async () => {
    const id = await chat();
    const a = await store().sendEventMessage(ANN, id, "hello", TAG(10));
    const b = await store().sendEventMessage(ANN, id, "hello", TAG(10));
    expect(b.id).toBe(a.id);
    expect(a.senderName).toBe("Ann");
    expect((await store().listEventMessages(BEN, id)).messages.map((m) => m.body)).toEqual(["hello"]);
  });
  it("pages from the newest message back, with no gaps or repeats even for identical timestamps", async () => {
    const id = await chat();
    for (let i = 0; i < 7; i++) await db.query(`insert into event_messages (event_id, sender_id, body, client_tag, created_at) values ($1, $2, $3, $4::uuid, '2026-10-12T11:00:00.123456+00')`, [id, ANN, `m${i}`, TAG(100 + i)]);
    const seen: string[] = []; let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await store().listEventMessages(BEN, id, { limit: 3, ...(before ? { before } : {}) });
      seen.unshift(...r.messages.map((m) => m.body));
      if (!r.hasMore) break;
      before = r.nextCursor!;
    }
    expect([...seen].sort()).toEqual(["m0", "m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(new Set(seen).size).toBe(7);
    expect(await code(store().listEventMessages(BEN, id, { before: "garbage~x" }))).toBe("invalid");
  });
  it("keeps the newest 50 visible when there are more than a page of messages", async () => {
    const id = await chat();
    for (let i = 0; i < 60; i++) await db.query(`insert into event_messages (event_id, sender_id, body, client_tag, created_at) values ($1, $2, $3, $4::uuid, $5::timestamptz)`, [id, ANN, `n${i}`, TAG(200 + i), new Date(NOW.getTime() - (60 - i) * 1000).toISOString()]);
    const r = await store().listEventMessages(BEN, id);
    expect(r.messages).toHaveLength(50);
    expect(r.messages[49]!.body).toBe("n59");
    expect(r.hasMore).toBe(true);
  });
  it("hides messages from people in a block with the reader", async () => {
    const id = await chat();
    await store().sendEventMessage(ANN, id, "from ann", TAG(300));
    await store().sendEventMessage(BEN, id, "from ben", TAG(301));
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [BEN, ANN]);
    expect((await store().listEventMessages(BEN, id)).messages.map((m) => m.body)).toEqual(["from ben"]);
    expect((await store().listEventMessages(ANN, id)).messages.map((m) => m.body)).toEqual(["from ann"]);
  });
  it("rate-limits a flood exactly, even when sends race, but still answers safe retries", async () => {
    const id = await chat();
    const res = await Promise.all(Array.from({ length: 30 }, (_, i) => code(store().sendEventMessage(ANN, id, `f${i}`, TAG(400 + i)))));
    expect(res.filter((r) => r === "ok")).toHaveLength(COMMUNITY_LIMITS.chatPerMinute);
    expect(res.filter((r) => r === "rate_limited")).toHaveLength(30 - COMMUNITY_LIMITS.chatPerMinute);
    expect(await code(store().sendEventMessage(ANN, id, "f0", TAG(400)))).toBe("ok"); // replay of an accepted message
  });
});
