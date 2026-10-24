import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createSafetyStore, SafetyError } from "../src/safety/store";
import { createAuthStore } from "../src/auth/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let NOW = new Date("2026-10-12T12:00:00.000Z");
const U = (n: number) => `a${n}000000-0000-4000-8000-000000000000`;
const [ALICE, BOB, CHARLIE, DAVE, ADMIN] = [U(1), U(2), U(3), U(4), U(5)];

let db: PGlite;
const store = (maxPerHour = 5) => createSafetyStore(db, { now: () => NOW, maxReportsPerHour: maxPerHour, withTransaction: (work) => db.transaction(work) });

async function person(id: string, name: string) {
  await db.query(`insert into users (id, email, status) values ($1, $2, 'active')`, [id, `${name.toLowerCase()}@example.com`]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, onboarding_completed) values ($1, $2, '', '{low_pressure}', true)`, [id, name]);
}

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
});

beforeEach(async () => {
  NOW = new Date("2026-10-12T12:00:00.000Z");
  await db.exec("truncate users cascade");
  await person(ALICE, "Alice");
  await person(BOB, "Bob");
  await person(CHARLIE, "Charlie");
  await person(DAVE, "Dave");
  await person(ADMIN, "Admin");
});

describe("safety store - reporting", () => {
  it("creates a report on a profile and retrieves it", async () => {
    const res = await store().createReport(ALICE, {
      targetType: "profile",
      targetId: BOB,
      reason: "harassment",
      details: "Inappropriate remarks",
    });
    expect(res.status).toBe("pending");

    const report = await store().getReport(res.id);
    expect(report.reporterId).toBe(ALICE);
    expect(report.targetId).toBe(BOB);
    expect(report.targetType).toBe("profile");
    expect(report.reason).toBe("harassment");
    expect(report.details).toBe("Inappropriate remarks");
  });

  it("rejects reporting one's own profile", async () => {
    await expect(
      store().createReport(ALICE, { targetType: "profile", targetId: ALICE, reason: "harassment" })
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("rejects reporting non-existent target", async () => {
    await expect(
      store().createReport(ALICE, { targetType: "profile", targetId: U(9), reason: "harassment" })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("automatically blocks the reported user when blockUser is true", async () => {
    await store().createReport(ALICE, {
      targetType: "profile",
      targetId: BOB,
      reason: "harassment",
      blockUser: true,
    });

    const { rows } = await db.query(
      `select 1 from user_blocks where blocker_id = $1 and blocked_id = $2`,
      [ALICE, BOB]
    );
    expect(rows).toHaveLength(1);
  });

  it("enforces rate limits on report submission", async () => {
    const s = store(2); // limit of 2 reports per hour
    await s.createReport(ALICE, { targetType: "profile", targetId: BOB, reason: "spam" });
    await s.createReport(ALICE, { targetType: "profile", targetId: CHARLIE, reason: "spam" });

    await expect(
      s.createReport(ALICE, { targetType: "profile", targetId: DAVE, reason: "spam" })
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("deduplicates multiple reports on same target within 24 hours", async () => {
    const rep1 = await store().createReport(ALICE, { targetType: "profile", targetId: BOB, reason: "spam" });
    const rep2 = await store().createReport(ALICE, { targetType: "profile", targetId: BOB, reason: "harassment" });
    expect(rep2.id).toBe(rep1.id);
  });
});

describe("safety store - moderation queue and resolution", () => {
  it("lists reports with filtering by status", async () => {
    const r1 = await store().createReport(ALICE, { targetType: "profile", targetId: BOB, reason: "harassment" });
    const r2 = await store().createReport(CHARLIE, { targetType: "profile", targetId: DAVE, reason: "spam" });

    const all = await store().listReports({});
    expect(all.length).toBeGreaterThanOrEqual(2);

    await store().resolveReport(ADMIN, r1.id, { actionTaken: "warning_issued" });

    const pending = await store().listReports({ status: "pending" });
    expect(pending.map((r) => r.id)).toContain(r2.id);
    expect(pending.map((r) => r.id)).not.toContain(r1.id);

    const resolved = await store().listReports({ status: "resolved" });
    expect(resolved.map((r) => r.id)).toContain(r1.id);
  });

  it("bans a user when report is resolved with user_banned action", async () => {
    const rep = await store().createReport(ALICE, { targetType: "profile", targetId: BOB, reason: "harassment" });
    await db.query(`insert into user_sessions (user_id, auth_session_id) values ($1, 'sess-1')`, [BOB]);

    await store().resolveReport(ADMIN, rep.id, {
      actionTaken: "user_banned",
      resolutionNotes: "Violated zero-tolerance harassment policy",
    });

    const userRow = (await db.query<{ status: string }>(`select status from users where id = $1`, [BOB])).rows[0];
    expect(userRow?.status).toBe("banned");

    const sessionRows = (await db.query(`select * from user_sessions where user_id = $1`, [BOB])).rows;
    expect(sessionRows).toHaveLength(0);
  });
});

describe("safety store - data deletion (GDPR)", () => {
  it("anonymizes profile and clears sessions and memberships on deleteAccount", async () => {
    await db.query(`insert into user_sessions (user_id, auth_session_id) values ($1, 'sess-1')`, [ALICE]);
    await db.query(`insert into user_interests (user_id, interest_id) values ($1, (select id from interests limit 1))`, [ALICE]);

    await store().deleteAccount(ALICE);

    const user = (await db.query<{ status: string }>(`select status from users where id = $1`, [ALICE])).rows[0];
    expect(user?.status).toBe("deleted");

    const profile = (await db.query<{ display_name: string; onboarding_completed: boolean }>(`select display_name, onboarding_completed from profiles where user_id = $1`, [ALICE])).rows[0];
    expect(profile?.display_name).toBe("Deleted User");
    expect(profile?.onboarding_completed).toBe(false);

    const sessions = (await db.query(`select * from user_sessions where user_id = $1`, [ALICE])).rows;
    expect(sessions).toHaveLength(0);

    const interests = (await db.query(`select * from user_interests where user_id = $1`, [ALICE])).rows;
    expect(interests).toHaveLength(0);
    expect((await db.query("select email, phone from users where id = $1", [ALICE])).rows[0]).toEqual({ email: `deleted+${ALICE}@account.invalid`, phone: null });
    expect((await db.query("select completed_at from account_cleanup_jobs where user_id = $1", [ALICE])).rows).toEqual([{ completed_at: null }]);
    await createAuthStore(db).upsertUser({ userId: ALICE, email: "alice@example.com", phone: null, isAnonymous: false, sessionId: "old-session" });
    expect((await db.query("select email from users where id = $1", [ALICE])).rows[0]).toEqual({ email: `deleted+${ALICE}@account.invalid` });
  });

  it("rolls back all deletion work if a cleanup statement fails", async () => {
    const s = createSafetyStore(db, { withTransaction: (work) => db.transaction(async (tx) => {
      await work(tx);
      throw new Error("injected transaction failure");
    }) });
    await expect(s.deleteAccount(ALICE)).rejects.toThrow("injected transaction failure");
    expect((await db.query("select status from users where id = $1", [ALICE])).rows[0]).toEqual({ status: "active" });
    expect((await db.query("select * from account_cleanup_jobs")).rows).toHaveLength(0);
  });

  it("requires group owners to resolve ownership before removal", async () => {
    await db.query("insert into groups (name, general_area, owner_id) values ('Study', 'Campus', $1)", [ALICE]);
    await expect(store().deleteAccount(ALICE)).rejects.toMatchObject({ code: "conflict" });
    expect((await db.query("select status from users where id = $1", [ALICE])).rows[0]).toEqual({ status: "active" });
  });
});
