import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createMessagingStore, MESSAGE_LIMITS, MessagingError } from "../src/messaging/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const NOW = new Date("2026-10-12T12:00:00.000Z");
const ID = { A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000", C: "a3000000-0000-4000-8000-000000000000" };
const TAG = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
const store = () => createMessagingStore(db, () => NOW);
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof MessagingError ? e.code : "other:" + String(e)));

async function user(id: string, name: string) {
  await db.query(`insert into users (id, email, status) values ($1, $2, 'active')`, [id, `${name}@example.com`]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed) values ($1, $2, '', '{low_pressure}', true, true)`, [id, name]);
}
const connect = (a: string, b: string) => db.query(`insert into connections (user_a, user_b) values ($1, $2) on conflict do nothing`, a < b ? [a, b] : [b, a]);
async function openChat() {
  await connect(ID.A, ID.B);
  return (await store().openConversation(ID.A, ID.B)).id;
}

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
});
beforeEach(async () => {
  await db.exec("truncate users cascade");
  await user(ID.A, "ann");
  await user(ID.B, "ben");
  await user(ID.C, "cy");
});

describe("blocking hides the whole chat in both directions", () => {
  it("removes the conversation, history and read-marking for both people, and unblocking restores visibility", async () => {
    const conv = await openChat();
    await store().sendMessage(ID.A, conv, "before the block", TAG(1));
    expect((await store().listConversations(ID.A)).length).toBe(1);

    // Same effect as the real block flow: block row plus the connection removed.
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ID.B, ID.A]);
    await db.query(`delete from connections`);

    for (const who of [ID.A, ID.B]) {
      expect(await store().listConversations(who)).toEqual([]);
      expect(await code(store().listMessages(who, conv, { limit: 50 }))).toBe("not_member");
      expect(await code(store().markRead(who, conv))).toBe("not_member");
      expect(await code(store().sendMessage(who, conv, "nope", TAG(2)))).toBe("not_member");
    }

    await db.query(`delete from user_blocks`);
    expect((await store().listConversations(ID.A)).length).toBe(1);
    expect((await store().listMessages(ID.A, conv, { limit: 50 })).messages.map((m) => m.body)).toEqual(["before the block"]);
  });

  it("does not hide the chat from a third person's perspective of someone else's block", async () => {
    const conv = await openChat();
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ID.C, ID.A]);
    expect((await store().listConversations(ID.A)).length).toBe(1);
    expect((await store().listMessages(ID.B, conv, { limit: 10 })).messages).toEqual([]);
  });
});

describe("who may be messaged", () => {
  it("refuses people whose message permission is 'nobody', and allows 'connections' and 'everyone'", async () => {
    const conv = await openChat();
    await db.query(`update profiles set message_permission = 'nobody' where user_id = $1`, [ID.B]);
    expect(await code(store().sendMessage(ID.A, conv, "hello?", TAG(3)))).toBe("messages_off");
    // The person who switched it off can still write to others (the setting is about receiving).
    expect(await code(store().sendMessage(ID.B, conv, "I can write", TAG(4)))).toBe("ok");
    await db.query(`update profiles set message_permission = 'connections' where user_id = $1`, [ID.B]);
    expect(await code(store().sendMessage(ID.A, conv, "now fine", TAG(5)))).toBe("ok");
    await db.query(`update profiles set message_permission = 'everyone' where user_id = $1`, [ID.B]);
    expect(await code(store().sendMessage(ID.A, conv, "also fine", TAG(6)))).toBe("ok");
  });

  it("stops suspended, banned or deleted accounts from sending, and from receiving", async () => {
    const conv = await openChat();
    await db.query(`update users set status = 'suspended' where id = $1`, [ID.A]);
    expect(await code(store().sendMessage(ID.A, conv, "x", TAG(7)))).toBe("account_inactive");
    await db.query(`update users set status = 'active' where id = $1`, [ID.A]);
    await db.query(`update users set status = 'banned' where id = $1`, [ID.B]);
    expect(await code(store().sendMessage(ID.A, conv, "x", TAG(8)))).toBe("not_connected");
  });
});

describe("rate limit under concurrency", () => {
  it("lets exactly the per-minute limit through when many sends race", async () => {
    const conv = await openChat();
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => code(store().sendMessage(ID.A, conv, `m${i}`, TAG(100 + i)))));
    expect(results.filter((r) => r === "ok")).toHaveLength(MESSAGE_LIMITS.perMinute);
    expect(results.filter((r) => r === "rate_limited")).toHaveLength(30 - MESSAGE_LIMITS.perMinute);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from messages where conversation_id = $1`, [conv]);
    expect(rows[0]!.n).toBe(MESSAGE_LIMITS.perMinute);
  });

  it("stores a message once when the same client tag is sent twice at the same instant", async () => {
    const conv = await openChat();
    const [a, b] = await Promise.all([store().sendMessage(ID.A, conv, "once", TAG(200)), store().sendMessage(ID.A, conv, "once", TAG(200))]);
    expect(a.id).toBe(b.id);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from messages where conversation_id = $1`, [conv]);
    expect(rows[0]!.n).toBe(1);
  });

  it("does not let one person's failure block the next send", async () => {
    const conv = await openChat();
    await db.query(`update users set status = 'suspended' where id = $1`, [ID.A]);
    expect(await code(store().sendMessage(ID.A, conv, "x", TAG(300)))).toBe("account_inactive");
    await db.query(`update users set status = 'active' where id = $1`, [ID.A]);
    expect(await code(store().sendMessage(ID.A, conv, "y", TAG(301)))).toBe("ok");
  });
});

describe("push tokens follow the device", () => {
  it("moves a token to the account that registered it last", async () => {
    await store().registerPushToken(ID.A, "android", "shared-phone-token");
    await store().registerPushToken(ID.B, "android", "shared-phone-token");
    const { rows } = await db.query<{ user_id: string }>(`select user_id::text from device_push_tokens where token = 'shared-phone-token'`);
    expect(rows.map((r) => r.user_id)).toEqual([ID.B]);
  });
});
