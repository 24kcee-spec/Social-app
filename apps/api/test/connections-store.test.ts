import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { ConnectionError, createConnectionsStore, LIMITS } from "../src/connections/store";
import { createDiscoveryStore } from "../src/discovery/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const DAY = 86_400_000;
let NOW = new Date("2026-10-10T12:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

const ID = { A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000", C: "a3000000-0000-4000-8000-000000000000", D: "a4000000-0000-4000-8000-000000000000", E: "a5000000-0000-4000-8000-000000000000", F: "a6000000-0000-4000-8000-000000000000", Z: "ffffffff-0000-4000-8000-000000000000" };
let db: PGlite;
let ints: Record<string, string>;
const store = () => createConnectionsStore(db, () => NOW);
const discovery = () => createDiscoveryStore(db, () => NOW);

async function user(id: string, name: string, opts: { interests?: string[]; onboarded?: boolean; discoverable?: boolean; permission?: string; createdDaysAgo?: number; status?: string } = {}) {
  await db.query(`insert into users (id, email, status, created_at, last_active_at) values ($1, $2, $3, $4, $4)`, [id, `${name.toLowerCase()}@example.com`, opts.status ?? "active", ago(opts.createdDaysAgo ?? 30)]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed, message_permission) values ($1, $2, $3, '{low_pressure}', $4, $5, $6::profile_message_permission)
    on conflict (user_id) do update set display_name = excluded.display_name, discoverable = excluded.discoverable, onboarding_completed = excluded.onboarding_completed, message_permission = excluded.message_permission`,
    [id, name, `${name} bio`, opts.discoverable ?? true, opts.onboarded ?? true, opts.permission ?? "everyone"]);
  for (const slug of opts.interests ?? []) await db.query(`insert into user_interests (user_id, interest_id, strength) values ($1, $2, 2)`, [id, ints[slug]]);
}
const q = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const hello = { kind: "question" as const, ref: "q_energy" };
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof ConnectionError ? e.code : "other:" + String(e)));

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
  ints = Object.fromEntries((await q("select slug, id::text as id from interests")).map((r) => [r.slug as string, r.id as string]));
});
beforeEach(async () => {
  NOW = new Date("2026-10-10T12:00:00.000Z");
  await db.exec("truncate users cascade");
  await user(ID.A, "Ann", { interests: ["football", "gaming"] });
  await user(ID.B, "Ben", { interests: ["football", "anime"] });
  await user(ID.C, "Cy", { interests: ["gaming"], permission: "nobody" });
  await user(ID.D, "Di", { discoverable: false });
  await user(ID.E, "Ed", { onboarded: false });
  await user(ID.F, "Flo", { interests: ["football"] });
});

describe("starters (conversation assist)", () => {
  it("offers icebreakers from shared interests, question cards and games - all chosen, none invented", async () => {
    const s = await store().getStarters(ID.A, ID.B);
    expect(s.icebreakers).toHaveLength(1);
    expect(s.icebreakers[0]).toMatchObject({ interestName: "Football" });
    expect(s.icebreakers[0]!.text).toContain("Football");
    expect(s.questions).toHaveLength(2);
    expect(s.games).toHaveLength(2);
    expect(s.allowCustom).toBe(true);
    expect(await store().getStarters(ID.A, ID.B)).toEqual(s);
  });
  it("still works with nothing in common and hides free text for low-pressure people", async () => {
    await store().updateSettings(ID.F, { lowPressureMode: true });
    const s = await store().getStarters(ID.A, ID.F);
    expect(s.icebreakers.length).toBe(1);
    expect(s.allowCustom).toBe(false);
    await db.query("delete from user_interests where user_id = $1", [ID.A]);
    const none = await store().getStarters(ID.A, ID.F);
    expect(none.icebreakers).toEqual([]);
    expect(none.questions.length + none.games.length).toBe(4);
  });
  it("is limited to people the viewer could actually see", async () => {
    expect(await code(store().getStarters(ID.A, ID.D))).toBe("not_found");
    expect(await code(store().getStarters(ID.A, ID.Z))).toBe("not_found");
    expect(await code(store().getStarters(ID.E, ID.B))).toBe("onboarding_required");
  });
});

describe("sending a request", () => {
  it("creates a pending request with a server-rendered intro, an interact event and an activation milestone", async () => {
    const r = await store().sendRequest(ID.A, ID.B, hello);
    expect(r.status).toBe("pending");
    const req = (await q("select * from connection_requests"))[0]!;
    expect(req).toMatchObject({ sender_id: ID.A, recipient_id: ID.B, status: "pending", intro_kind: "question", intro_text: "What is something that always gives you energy?" });
    expect(new Date(req.expires_at as string).getTime() - new Date(req.created_at as string).getTime()).toBe(LIMITS.expiryDays * DAY);
    expect((await q("select event_type::text as t from discovery_events where viewer_id = $1", [ID.A]))[0]?.t).toBe("interact");
    expect((await q("select milestone from activation_milestones where user_id = $1", [ID.A]))[0]?.milestone).toBe("first_request_sent");
  });
  it("renders icebreaker and this-or-that intros on the server; the client cannot supply text for them", async () => {
    const football = ints.football!;
    await store().sendRequest(ID.A, ID.B, { kind: "icebreaker", ref: football });
    expect((await q("select intro_text from connection_requests"))[0]!.intro_text).toContain("Football");
    await db.exec("truncate connection_requests cascade");
    await store().sendRequest(ID.A, ID.B, { kind: "this_or_that", ref: "t_coffee_tea", choice: "b" });
    expect((await q("select intro_text, intro_choice from connection_requests"))[0]).toMatchObject({ intro_text: "This or that: Coffee or Tea? I'd pick Tea. You?", intro_choice: "b" });
  });
  it("rejects icebreakers for interests the two people do not both have, and unknown catalog ids", async () => {
    expect(await code(store().sendRequest(ID.A, ID.B, { kind: "icebreaker", ref: ints.gaming! }))).toBe("invalid_intro");
    expect(await code(store().sendRequest(ID.A, ID.B, { kind: "question", ref: "nope" }))).toBe("invalid_intro");
    expect(await code(store().sendRequest(ID.A, ID.B, { kind: "this_or_that", ref: "nope", choice: "a" }))).toBe("invalid_intro");
  });
  it("accepts a short custom note, but not for people in low-pressure mode", async () => {
    expect(await code(store().sendRequest(ID.A, ID.B, { kind: "custom", text: "  Hey, saw you like football!  " }))).toBe("ok");
    expect((await q("select intro_text from connection_requests"))[0]!.intro_text).toBe("Hey, saw you like football!");
    await db.exec("truncate connection_requests cascade");
    await store().updateSettings(ID.B, { lowPressureMode: true });
    expect(await code(store().sendRequest(ID.A, ID.B, { kind: "custom", text: "Hello there" }))).toBe("custom_not_allowed");
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("ok");
  });
  it("cannot reach people who are not visible, closed to requests, self, or unknown", async () => {
    expect(await code(store().sendRequest(ID.A, ID.D, hello))).toBe("not_found");
    expect(await code(store().sendRequest(ID.A, ID.E, hello))).toBe("not_found");
    expect(await code(store().sendRequest(ID.A, ID.Z, hello))).toBe("not_found");
    expect(await code(store().sendRequest(ID.A, ID.A, hello))).toBe("not_found");
    expect(await code(store().sendRequest(ID.A, ID.C, hello))).toBe("not_accepting");
    expect(await code(store().sendRequest(ID.E, ID.B, hello))).toBe("onboarding_required");
  });
  it("cannot reach a blocked person in either direction", async () => {
    await discovery().block(ID.B, ID.A);
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("not_found");
    expect(await code(store().sendRequest(ID.B, ID.A, hello))).toBe("not_found");
  });
  it("blocks duplicate pending requests and connects instantly when they already said hi to you", async () => {
    await store().sendRequest(ID.A, ID.B, hello);
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("already_pending");
    const back = await store().sendRequest(ID.B, ID.A, { kind: "question", ref: "q_weekend" });
    expect(back.status).toBe("connected");
    expect(await q("select user_a, user_b from connections")).toEqual([{ user_a: ID.A, user_b: ID.B }]);
    expect((await q("select status::text as s from connection_requests"))[0]!.s).toBe("accepted");
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("already_connected");
  });
  it("enforces the daily limit and the open-request limit", async () => {
    for (let i = 0; i < LIMITS.requestsPerDay; i++) {
      const id = `b${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`;
      await user(id, `P${i}`, { interests: ["football"] });
      await store().sendRequest(ID.A, id, hello);
    }
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("daily_limit");
    NOW = new Date(NOW.getTime() + 2 * DAY);
    await db.query("update connection_requests set expires_at = $1::timestamptz", [new Date(NOW.getTime() + 10 * DAY).toISOString()]);
    for (let i = 0; i < 10; i++) {
      const id = `c${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`;
      await user(id, `Q${i}`, { interests: ["football"] });
      await store().sendRequest(ID.A, id, hello);
    }
    NOW = new Date(NOW.getTime() + 2 * DAY);
    await db.query("update connection_requests set expires_at = $1::timestamptz", [new Date(NOW.getTime() + 10 * DAY).toISOString()]);
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("pending_limit");
  });
});

describe("answering", () => {
  it("accept creates exactly one connection and milestones for both people", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    await store().respond(ID.B, requestId, "accept");
    expect((await store().listConnections(ID.A)).map((c) => c.other.displayName)).toEqual(["Ben"]);
    expect((await store().listConnections(ID.B)).map((c) => c.other.displayName)).toEqual(["Ann"]);
    expect((await q("select user_id::text as u from activation_milestones where milestone = 'first_connection' order by 1")).map((r) => r.u)).toEqual([ID.A, ID.B]);
    expect(await code(store().respond(ID.B, requestId, "accept"))).toBe("not_pending");
  });
  it("decline is private: the sender sees only 'no reply', and cannot retry for 30 days", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    await store().respond(ID.B, requestId, "decline");
    const out = await store().listRequests(ID.A, "outgoing");
    expect(out.map((r) => r.status)).toEqual(["no_reply"]);
    expect(JSON.stringify(out)).not.toContain("declined");
    expect(await store().listRequests(ID.B, "incoming")).toEqual([]);
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("cooldown");
    NOW = new Date(NOW.getTime() + 31 * DAY);
    expect(await code(store().sendRequest(ID.A, ID.B, hello))).toBe("ok");
  });
  it("only the recipient can answer; strangers and the sender get 'not found'", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    expect(await code(store().respond(ID.A, requestId, "accept"))).toBe("not_found");
    expect(await code(store().respond(ID.F, requestId, "accept"))).toBe("not_found");
    expect(await code(store().respond(ID.B, "00000000-0000-4000-8000-000000000000", "accept"))).toBe("not_found");
  });
  it("unanswered requests expire quietly after 14 days and read as 'no reply' to the sender", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    NOW = new Date(NOW.getTime() + 15 * DAY);
    expect(await store().listRequests(ID.B, "incoming")).toEqual([]);
    expect((await store().listRequests(ID.A, "outgoing")).map((r) => r.status)).toEqual(["no_reply"]);
    expect(await code(store().respond(ID.B, requestId, "accept"))).toBe("not_pending");
  });
  it("sender can withdraw a pending request; it disappears for both", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    expect(await code(store().withdraw(ID.B, requestId))).toBe("not_found");
    await store().withdraw(ID.A, requestId);
    expect(await store().listRequests(ID.B, "incoming")).toEqual([]);
    expect(await store().listRequests(ID.A, "outgoing")).toEqual([]);
  });
});

describe("lists, relations and blocks", () => {
  it("shows the intro, the sender and a pending count in the recipient's inbox", async () => {
    await store().sendRequest(ID.A, ID.B, { kind: "question", ref: "q_song" });
    const inbox = await store().listRequests(ID.B, "incoming");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ status: "pending", intro: { kind: "question", text: "What song have you had on repeat lately?" }, other: { userId: ID.A, displayName: "Ann" } });
  });
  it("marks pending people in discovery and removes connected people from it", async () => {
    await store().sendRequest(ID.A, ID.B, hello);
    expect((await discovery().getFeed(ID.A, 20, 0)).people.find((p) => p.userId === ID.B)?.relation).toBe("pending_out");
    expect((await discovery().getFeed(ID.B, 20, 0)).people.find((p) => p.userId === ID.A)?.relation).toBe("pending_in");
    await store().respond(ID.B, (await store().listRequests(ID.B, "incoming"))[0]!.id, "accept");
    expect((await discovery().getFeed(ID.A, 20, 0)).people.map((p) => p.userId)).not.toContain(ID.B);
    expect((await discovery().explain(ID.A, ID.B)).excludedBecause).toContain("already_connected");
  });
  it("blocking ends the connection and withdraws open requests", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    await store().respond(ID.B, requestId, "accept");
    await store().sendRequest(ID.F, ID.B, hello);
    await discovery().block(ID.B, ID.A);
    await discovery().block(ID.B, ID.F);
    expect(await store().listConnections(ID.A)).toEqual([]);
    expect(await store().listRequests(ID.B, "incoming")).toEqual([]);
    expect(await q("select status::text as s from connection_requests where sender_id = $1", [ID.F])).toEqual([{ s: "withdrawn" }]);
  });
  it("removing a connection removes it for both sides", async () => {
    const { requestId } = await store().sendRequest(ID.A, ID.B, hello);
    await store().respond(ID.B, requestId, "accept");
    await store().removeConnection(ID.B, ID.A);
    expect(await store().listConnections(ID.A)).toEqual([]);
    expect(await store().listConnections(ID.B)).toEqual([]);
  });
});

describe("low-pressure setting and activation", () => {
  it("defaults off and can be switched on and off", async () => {
    expect(await store().getSettings(ID.A)).toEqual({ lowPressureMode: false });
    expect(await store().updateSettings(ID.A, { lowPressureMode: true })).toEqual({ lowPressureMode: true });
    expect(await store().getSettings(ID.A)).toEqual({ lowPressureMode: true });
    await store().updateSettings(ID.A, { lowPressureMode: false });
    expect(await store().getSettings(ID.A)).toEqual({ lowPressureMode: false });
  });
  it("summarises activation: onboarded members who sent a first request within 48 hours of signing up", async () => {
    await db.exec("truncate users cascade");
    await user(ID.A, "Ann", { createdDaysAgo: 5 });
    await user(ID.B, "Ben", { createdDaysAgo: 5 });
    await user(ID.F, "Flo", { createdDaysAgo: 5 });
    await user(ID.E, "Ed", { onboarded: false, createdDaysAgo: 5 });
    await user(ID.D, "Old", { createdDaysAgo: 90 });
    await db.query(`insert into activation_milestones (user_id, milestone, reached_at) values ($1, 'first_request_sent', $2::timestamptz), ($3, 'first_request_sent', $4::timestamptz), ($1, 'first_connection', $2::timestamptz)`, [ID.A, ago(4.5), ID.B, ago(1)]);
    expect(await store().activationSummary(30)).toEqual({ sinceDays: 30, signedUp: 4, onboarded: 3, sentFirstRequest: 2, connected: 1, activatedWithin48h: 1, activationRate: 0.333 });
    expect((await store().activationSummary(365)).signedUp).toBe(5);
  });
  it("reports a null rate when nobody has onboarded", async () => {
    await db.exec("truncate users cascade");
    expect(await store().activationSummary(30)).toMatchObject({ onboarded: 0, activationRate: null });
  });
});
