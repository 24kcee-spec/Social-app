import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createDiscoveryStore, OnboardingRequiredError, RateLimitedError, SelfActionError, UnknownUserError } from "../src/discovery/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOW = new Date();
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

const ID = {
  V: "a0000000-0000-4000-8000-000000000000", A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000",
  C: "a3000000-0000-4000-8000-000000000000", D: "a4000000-0000-4000-8000-000000000000", E: "a5000000-0000-4000-8000-000000000000",
  F: "a6000000-0000-4000-8000-000000000000", G: "a7000000-0000-4000-8000-000000000000", H: "a8000000-0000-4000-8000-000000000000",
  I: "a9000000-0000-4000-8000-000000000000", Z: "ffffffff-0000-4000-8000-000000000000",
};

let db: PGlite;
let interestId: Record<string, string>;
const store = () => createDiscoveryStore(db, () => NOW);

interface Seed { id: string; name: string; interests?: [string, 1 | 2 | 3][]; styles?: string[]; prompts?: string[]; activeDaysAgo?: number | null; discoverable?: boolean; onboarded?: boolean; status?: string }
async function seed(s: Seed) {
  await db.query(`insert into users (id, email, status, created_at, last_active_at) values ($1, $2, $3, $4, $5)`, [s.id, `${s.name.toLowerCase()}@example.com`, s.status ?? "active", ago(100), s.activeDaysAgo === undefined || s.activeDaysAgo === null ? null : ago(s.activeDaysAgo)]);
  await db.query(
    `insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed) values ($1, $2, $3, $4::text[], $5, $6)
     on conflict (user_id) do update set display_name = excluded.display_name, bio = excluded.bio, social_styles = excluded.social_styles, discoverable = excluded.discoverable, onboarding_completed = excluded.onboarding_completed`,
    [s.id, s.name, `${s.name} bio`, s.styles ?? ["low_pressure"], s.discoverable ?? true, s.onboarded ?? true]);
  for (const [slug, strength] of s.interests ?? []) await db.query(`insert into user_interests (user_id, interest_id, strength) values ($1, $2, $3)`, [s.id, interestId[slug], strength]);
  for (const promptId of s.prompts ?? []) await db.query(`insert into prompt_answers (user_id, prompt_id, answer) values ($1, $2, 'An answer here')`, [s.id, promptId]);
}

async function seedFixture() {
  await seed({ id: ID.V, name: "Viewer", interests: [["football", 3], ["gaming", 2], ["anime", 2]], styles: ["small_group", "low_pressure"], prompts: ["weekend", "food"], activeDaysAgo: 0 });
  await seed({ id: ID.A, name: "Alex", interests: [["football", 3], ["gaming", 2], ["anime", 2]], styles: ["small_group"], activeDaysAgo: 0 });
  await seed({ id: ID.B, name: "Bea", interests: [["football", 2], ["gaming", 1]], styles: ["low_pressure"], prompts: ["weekend"], activeDaysAgo: 2 });
  await seed({ id: ID.C, name: "Cal", interests: [["afrobeats", 2]], styles: ["one_to_one"], activeDaysAgo: 20 });
  await seed({ id: ID.D, name: "Dee", interests: [["basketball", 2]], styles: ["text_first"], activeDaysAgo: 10 });
  await seed({ id: ID.E, name: "Eli (blocked by viewer)", interests: [["football", 3]], activeDaysAgo: 0 });
  await seed({ id: ID.F, name: "Fay (blocked viewer)", interests: [["football", 3]], activeDaysAgo: 0 });
  await seed({ id: ID.G, name: "Gus (private)", interests: [["football", 3]], discoverable: false, activeDaysAgo: 0 });
  await seed({ id: ID.H, name: "Hal (no onboarding)", interests: [["football", 3]], onboarded: false, activeDaysAgo: 0 });
  await seed({ id: ID.I, name: "Ivy (suspended)", interests: [["football", 3]], status: "suspended", activeDaysAgo: 0 });
  await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2), ($3, $1)`, [ID.V, ID.E, ID.F]);
}

const event = (viewer: string, candidate: string, type: string, daysAgo = 0) =>
  db.query(`insert into discovery_events (viewer_id, candidate_id, event_type, created_at) values ($1, $2, $3::discovery_event_type, $4)`, [viewer, candidate, type, ago(daysAgo)]);

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
  const { rows } = await db.query<{ slug: string; id: string }>("select slug, id::text as id from interests");
  interestId = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
});
beforeEach(async () => {
  await db.exec("truncate users cascade");
  await seedFixture();
});

describe("discovery feed (real SQL)", () => {
  it("shows only discoverable, onboarded, active, unblocked people - never self", async () => {
    const feed = await store().getFeed(ID.V, 20, 0);
    expect(feed.people.map((p) => p.userId).sort()).toEqual([ID.A, ID.B, ID.C, ID.D].sort());
  });

  it("ranks by the weighted overlap with exact, explainable scores", async () => {
    const feed = await store().getFeed(ID.V, 20, 0);
    expect(feed.people.map((p) => [p.userId, p.score])).toEqual([[ID.A, 43], [ID.B, 30], [ID.D, 3], [ID.C, 1]]);
  });

  it("gives every card plain-language reasons, strongest first", async () => {
    const [alex, bea, , cal] = (await store().getFeed(ID.V, 20, 0)).people;
    expect(alex?.reasons.map((r) => r.text)).toEqual(["You both like Football, Anime and Gaming", "Active today", "You both enjoy small groups"]);
    expect(bea?.reasons[0]?.text).toBe("You both like Football and Gaming");
    expect(bea?.reasons.map((r) => r.code)).toContain("shared_prompts");
    expect(cal?.reasons.length).toBeGreaterThan(0);
    for (const card of (await store().getFeed(ID.V, 20, 0)).people) expect(card.reasons.every((r) => r.points >= 0)).toBe(true);
  });

  it("marks which interests are shared and never leaks contact details or original image paths", async () => {
    await db.query(`insert into profile_media (user_id, storage_path, thumbnail_path, content_type, size_bytes, width, height, sort_order) values ($1, $2, $3, 'image/jpeg', 1000, 1400, 1400, 1), ($1, $4, $5, 'image/jpeg', 1000, 1400, 1400, 0)`, [ID.A, `${ID.A}/second.jpg`, `${ID.A}/second-thumb.jpg`, `${ID.A}/first.jpg`, `${ID.A}/first-thumb.jpg`]);
    const alex = (await store().getFeed(ID.V, 20, 0)).people[0]!;
    expect(alex.sharedInterests.map((i) => i.name).sort()).toEqual(["Anime", "Football", "Gaming"]);
    expect(alex.thumbnailPath).toBe(`${ID.A}/first-thumb.jpg`);
    const raw = JSON.stringify(alex);
    expect(raw).not.toContain("@example.com");
    expect(raw).not.toContain("first.jpg");
    expect(alex.messagePermission).toBe("everyone");
  });

  it("pages deterministically", async () => {
    const first = await store().getFeed(ID.V, 2, 0);
    const second = await store().getFeed(ID.V, 2, 2);
    expect(first.people.map((p) => p.userId)).toEqual([ID.A, ID.B]);
    expect(first.hasMore).toBe(true);
    expect(second.people.map((p) => p.userId)).toEqual([ID.D, ID.C]);
    expect(second.hasMore).toBe(false);
    expect((await store().getFeed(ID.V, 20, 0)).people.map((p) => p.userId)).toEqual((await store().getFeed(ID.V, 20, 0)).people.map((p) => p.userId));
  });

  it("requires a finished profile before showing anyone", async () => {
    await db.query(`update profiles set onboarding_completed = false where user_id = $1`, [ID.V]);
    await expect(store().getFeed(ID.V, 20, 0)).rejects.toBeInstanceOf(OnboardingRequiredError);
  });

  it("lowers the score after repeat impressions", async () => {
    for (let i = 0; i < 4; i++) await event(ID.V, ID.A, "impression", 1);
    const alex = (await store().getFeed(ID.V, 20, 0)).people.find((p) => p.userId === ID.A)!;
    expect(alex.score).toBe(43 - 6);
  });

  it("demotes an ignored person, ignores older than 30 days do not count, and 3 recent ignores hide them", async () => {
    await event(ID.V, ID.A, "ignore", 40);
    expect((await store().getFeed(ID.V, 20, 0)).people[0]?.userId).toBe(ID.A);
    await event(ID.V, ID.A, "ignore", 2);
    let people = (await store().getFeed(ID.V, 20, 0)).people;
    expect(people.map((p) => [p.userId, p.score])).toEqual([[ID.B, 33], [ID.A, 20], [ID.D, 3], [ID.C, 1]]);
    await event(ID.V, ID.A, "ignore", 3);
    await event(ID.V, ID.A, "ignore", 4);
    people = (await store().getFeed(ID.V, 20, 0)).people;
    expect(people.map((p) => p.userId)).not.toContain(ID.A);
  });

  it("falls back to recently active people when nothing is shared, so the feed is never empty for a new viewer", async () => {
    await db.query(`delete from user_interests where user_id = $1`, [ID.V]);
    const feed = await store().getFeed(ID.V, 20, 0);
    expect(feed.people.length).toBe(4);
    expect(feed.people.every((p) => p.reasons.length > 0)).toBe(true);
  });
});

describe("events", () => {
  it("records impressions, opens, ignores and interacts for real people", async () => {
    const n = await store().recordEvents(ID.V, [{ candidateId: ID.A, type: "impression" }, { candidateId: ID.A, type: "open" }, { candidateId: ID.B, type: "ignore" }, { candidateId: ID.B, type: "interact" }]);
    expect(n).toBe(4);
    const { rows } = await db.query<{ event_type: string }>(`select event_type::text from discovery_events order by id`);
    expect(rows.map((r) => r.event_type)).toEqual(["impression", "open", "ignore", "interact"]);
  });

  it("silently drops self and unknown users so ids cannot be probed", async () => {
    const n = await store().recordEvents(ID.V, [{ candidateId: ID.V, type: "impression" }, { candidateId: ID.Z, type: "impression" }, { candidateId: ID.A, type: "impression" }]);
    expect(n).toBe(1);
  });

  it("rate limits bursts", async () => {
    await db.query(`insert into discovery_events (viewer_id, candidate_id, event_type) select $1, $2, 'impression' from generate_series(1, 299)`, [ID.V, ID.A]);
    await expect(store().recordEvents(ID.V, [{ candidateId: ID.A, type: "impression" }, { candidateId: ID.B, type: "impression" }])).rejects.toBeInstanceOf(RateLimitedError);
    await expect(store().recordEvents(ID.V, [{ candidateId: ID.A, type: "impression" }])).resolves.toBe(1);
  });
});

describe("blocks", () => {
  it("hides a person in both directions the moment they are blocked and restores them on unblock", async () => {
    await store().block(ID.V, ID.A);
    expect((await store().getFeed(ID.V, 20, 0)).people.map((p) => p.userId)).not.toContain(ID.A);
    expect((await store().getFeed(ID.A, 20, 0)).people.map((p) => p.userId)).not.toContain(ID.V);
    await store().unblock(ID.V, ID.A);
    expect((await store().getFeed(ID.V, 20, 0)).people.map((p) => p.userId)).toContain(ID.A);
  });

  it("lists blocks, is idempotent, and rejects self and unknown users", async () => {
    await store().block(ID.V, ID.A);
    await store().block(ID.V, ID.A);
    const blocks = await store().listBlocks(ID.V);
    expect(blocks.map((b) => b.displayName)).toEqual(expect.arrayContaining(["Alex", "Eli (blocked by viewer)"]));
    expect(blocks).toHaveLength(2);
    await expect(store().block(ID.V, ID.V)).rejects.toBeInstanceOf(SelfActionError);
    await expect(store().block(ID.V, ID.Z)).rejects.toBeInstanceOf(UnknownUserError);
  });

  it("does not tell a person who blocked them", async () => {
    expect((await store().listBlocks(ID.E)).length).toBe(0);
    expect((await store().listBlocks(ID.F)).map((b) => b.userId)).toEqual([ID.V]);
  });
});

describe("explain (admin inspection of why A saw B)", () => {
  it("shows the score components and feed position for someone who is visible", async () => {
    await event(ID.V, ID.B, "impression", 1);
    await event(ID.V, ID.B, "impression", 1);
    const e = await store().explain(ID.V, ID.B);
    expect(e).toMatchObject({ eligible: true, excludedBecause: [], feedPosition: 2, hiddenByIgnores: false, history: { impressions7d: 2, ignores30d: 0 } });
    expect(e.components.map((c) => c.code)).toEqual(expect.arrayContaining(["shared_interests", "shared_styles", "shared_prompts", "recently_active", "repeat_fatigue"]));
    expect(e.score).toBe(e.components.reduce((sum, c) => sum + c.points, 0));
  });

  it("names every exclusion reason", async () => {
    expect((await store().explain(ID.V, ID.E)).excludedBecause).toEqual(["viewer_blocked_candidate"]);
    expect((await store().explain(ID.V, ID.F)).excludedBecause).toEqual(["candidate_blocked_viewer"]);
    expect((await store().explain(ID.V, ID.G)).excludedBecause).toEqual(["candidate_not_discoverable"]);
    expect((await store().explain(ID.V, ID.H)).excludedBecause).toEqual(["candidate_onboarding_incomplete"]);
    expect((await store().explain(ID.V, ID.I)).excludedBecause).toEqual(["candidate_status_suspended"]);
    expect((await store().explain(ID.V, ID.V)).excludedBecause).toContain("same_person");
    expect((await store().explain(ID.V, ID.Z)).excludedBecause).toContain("candidate_has_no_profile");
  });
});
