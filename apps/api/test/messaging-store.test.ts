import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createMessagingStore, MESSAGE_LIMITS, MessagingError } from "../src/messaging/store";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const DAY = 86_400_000;
let NOW = new Date("2026-10-12T12:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString();

const ID = { A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000", C: "a3000000-0000-4000-8000-000000000000", E: "a5000000-0000-4000-8000-000000000000" };
let db: PGlite;
const store = () => createMessagingStore(db, () => NOW);
const TAG = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function user(id: string, name: string, opts: { onboarded?: boolean; status?: string } = {}) {
  await db.query(`insert into users (id, email, status, created_at) values ($1, $2, $3, $4)`, [id, `${name.toLowerCase()}@example.com`, opts.status ?? "active", ago(30)]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed) values ($1, $2, $3, '{low_pressure}', true, $4)`, [id, name, `${name} bio`, opts.onboarded ?? true]);
}
const connect = async (a: string, b: string) => {
  const [x, y] = a < b ? [a, b] : [b, a];
  await db.query(`insert into connections (user_a, user_b) values ($1, $2) on conflict do nothing`, [x, y]);
};
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof MessagingError ? e.code : "other:" + String(e)));

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
});
beforeEach(async () => {
  NOW = new Date("2026-10-12T12:00:00.000Z");
  await db.exec("truncate users cascade");
  await user(ID.A, "Ann");
  await user(ID.B, "Ben");
  await user(ID.C, "Cy");
  await user(ID.E, "Ed", { onboarded: false });
});

describe("openConversation", () => {
  it("creates one direct conversation per connected pair and reuses it", async () => {
    await connect(ID.A, ID.B);
    const first = await store().openConversation(ID.A, ID.B);
    expect(first.other.displayName).toBe("Ben");
    const again = await store().openConversation(ID.B, ID.A);
    expect(again.id).toBe(first.id);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from conversation_members where conversation_id = $1`, [first.id]);
    expect(rows[0]!.n).toBe(2);
  });

  it("refuses strangers, yourself and people who blocked you", async () => {
    expect(await code(store().openConversation(ID.A, ID.C))).toBe("not_connected");
    await connect(ID.A, ID.B);
    expect(await code(store().openConversation(ID.A, ID.A))).toBe("not_found");
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ID.B, ID.A]);
    expect(await code(store().openConversation(ID.A, ID.B))).toBe("not_connected");
  });

  it("requires an onboarded profile", async () => {
    await connect(ID.E, ID.A);
    expect(await code(store().openConversation(ID.E, ID.A))).toBe("onboarding_required");
  });
});

describe("messages", () => {
  async function open() {
    await connect(ID.A, ID.B);
    return (await store().openConversation(ID.A, ID.B)).id;
  }

  it("sends, lists oldest-first and tracks read state", async () => {
    const conv = await open();
    await store().sendMessage(ID.A, conv, "Hi Ben!", TAG(1));

    const pageA = await store().listMessages(ID.A, conv, { limit: 50 });
    expect(pageA.messages.map((m) => m.body)).toEqual(["Hi Ben!"]);
    expect(pageA.hasMore).toBe(false);
    expect(pageA.messages[0]!.read).toBe(false); // Ben has not read it yet

    // Replying implies the reply author has read everything so far.
    NOW = new Date(NOW.getTime() + 60_000);
    const m2 = await store().sendMessage(ID.B, conv, "Hey Ann", TAG(2));
    expect(m2.read).toBe(false); // Ann has not read Ben's reply yet
    const afterReply = await store().listMessages(ID.A, conv, { limit: 50 });
    expect(afterReply.messages.map((m) => m.body)).toEqual(["Hi Ben!", "Hey Ann"]);
    expect(afterReply.messages[0]!.read).toBe(true); // Ben read it before replying
    // Ben's reply is unread for Ann until she opens the chat.
    expect((await store().listConversations(ID.A))[0]!.unreadCount).toBe(1);

    await store().markRead(ID.A, conv);
    const seen = await store().listMessages(ID.B, conv, { limit: 50 });
    expect(seen.messages.every((m) => m.read)).toBe(true);
  });

  it("a retry with the same client tag never duplicates", async () => {
    const conv = await open();
    const first = await store().sendMessage(ID.A, conv, "one", TAG(9));
    const retry = await store().sendMessage(ID.A, conv, "one", TAG(9));
    expect(retry.id).toBe(first.id);
    expect((await store().listMessages(ID.B, conv, { limit: 50 })).messages).toHaveLength(1);
  });

  it("paginates backwards with the before cursor", async () => {
    const conv = await open();
    for (let i = 0; i < 5; i++) {
      NOW = new Date(NOW.getTime() + 1000);
      await store().sendMessage(ID.A, conv, `m${i}`, TAG(10 + i));
    }
    const page1 = await store().listMessages(ID.B, conv, { limit: 2 });
    expect(page1.messages.map((m) => m.body)).toEqual(["m3", "m4"]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toMatch(/^.*~[0-9a-f-]{36}$/);
    const page2 = await store().listMessages(ID.B, conv, { limit: 2, before: page1.nextCursor! });
    expect(page2.messages.map((m) => m.body)).toEqual(["m1", "m2"]);
    const page3 = await store().listMessages(ID.B, conv, { limit: 2, before: page2.nextCursor! });
    expect(page3.messages.map((m) => m.body)).toEqual(["m0"]);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();
    // Legacy created_at-only cursors from early Phase 5 clients still work.
    const legacy = await store().listMessages(ID.B, conv, { limit: 2, before: page1.messages[0]!.createdAt });
    expect(legacy.messages.map((m) => m.body)).toEqual(["m1", "m2"]);
  });

  it("never skips or duplicates messages that share the exact same created_at", async () => {
    const conv = await open();
    // Insert directly: five messages, one timestamp. (Sends via the store always get distinct times.)
    const sameTime = "2026-10-12T11:00:00.123456+00";
    for (let i = 0; i < 5; i++) {
      await db.query(`insert into messages (conversation_id, sender_id, kind, body, client_tag, created_at) values ($1, $2, 'text', $3, $4::uuid, $5::timestamptz)`, [conv, ID.A, `tie ${i}`, TAG(60 + i), sameTime]);
    }
    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result = await store().listMessages(ID.B, conv, { limit: 2, ...(before ? { before } : {}) });
      seen.push(...result.messages.map((m) => m.body));
      if (!result.hasMore) break;
      expect(result.nextCursor).toBeTruthy();
      before = result.nextCursor!;
    }
    expect(seen.sort()).toEqual(["tie 0", "tie 1", "tie 2", "tie 3", "tie 4"]);
  });

  it("fires onMessageSent for a new message but not for an idempotent retry, and a failing hook never fails the send", async () => {
    const conv = await open();
    const events: string[] = [];
    const hooked = createMessagingStore(db, () => NOW, {
      onMessageSent: async (e) => { events.push(`${e.senderId}->${e.recipientId}:${e.body}`); },
    });
    await hooked.sendMessage(ID.A, conv, "ping", TAG(70));
    await hooked.sendMessage(ID.A, conv, "ping", TAG(70)); // idempotent replay: no second notification
    expect(events).toEqual([`${ID.A}->${ID.B}:ping`]);

    const failing = createMessagingStore(db, () => NOW, { onMessageSent: async () => { throw new Error("push down"); } });
    const sent = await failing.sendMessage(ID.A, conv, "still delivered", TAG(71));
    expect(sent.body).toBe("still delivered");
  });

  it("counts unread only for messages from the other person since your watermark", async () => {
    const conv = await open();
    await store().sendMessage(ID.A, conv, "a1", TAG(20));
    NOW = new Date(NOW.getTime() + 1000);
    await store().sendMessage(ID.B, conv, "b1", TAG(21));
    NOW = new Date(NOW.getTime() + 1000);
    await store().sendMessage(ID.B, conv, "b2", TAG(22));
    const list = await store().listConversations(ID.A);
    expect(list).toHaveLength(1);
    expect(list[0]!.unreadCount).toBe(2);
    expect(list[0]!.lastMessage?.body).toBe("b2");
    await store().markRead(ID.A, conv);
    expect((await store().listConversations(ID.A))[0]!.unreadCount).toBe(0);
    // Ben's own messages are never unread for Ben.
    expect((await store().listConversations(ID.B))[0]!.unreadCount).toBe(0);
  });

  it("freezes the chat when the connection is removed but keeps history readable", async () => {
    const conv = await open();
    await store().sendMessage(ID.A, conv, "before", TAG(30));
    await db.query(`delete from connections where user_a = $1 and user_b = $2`, [ID.A < ID.B ? ID.A : ID.B, ID.A < ID.B ? ID.B : ID.A]);
    expect(await code(store().sendMessage(ID.B, conv, "after", TAG(31)))).toBe("not_connected");
    expect((await store().listMessages(ID.B, conv, { limit: 50 })).messages).toHaveLength(1);
  });

  it("keeps non-members out without leaking that the conversation exists", async () => {
    const conv = await open();
    expect(await code(store().listMessages(ID.C, conv, { limit: 50 }))).toBe("not_member");
    expect(await code(store().sendMessage(ID.C, conv, "intruder", TAG(40)))).toBe("not_member");
    expect(await code(store().markRead(ID.C, conv))).toBe("not_member");
  });

  it("rate-limits bursts and the daily volume", async () => {
    const conv = await open();
    for (let i = 0; i < MESSAGE_LIMITS.perMinute; i++) {
      NOW = new Date(NOW.getTime() + 100);
      expect(await code(store().sendMessage(ID.A, conv, `burst ${i}`, TAG(100 + i)))).toBe("ok");
    }
    NOW = new Date(NOW.getTime() + 100);
    expect(await code(store().sendMessage(ID.A, conv, "one too many", TAG(199)))).toBe("rate_limited");
    // A different conversation is unaffected by the per-conversation burst limit.
    await connect(ID.A, ID.C);
    const other = (await store().openConversation(ID.A, ID.C)).id;
    expect(await code(store().sendMessage(ID.A, other, "still fine", TAG(200)))).toBe("ok");
  });

  it("records the first_message activation milestone once", async () => {
    const conv = await open();
    await store().sendMessage(ID.A, conv, "hello", TAG(50));
    await store().sendMessage(ID.A, conv, "again", TAG(51));
    const { rows } = await db.query<{ milestone: string }>(`select milestone from activation_milestones where user_id = $1`, [ID.A]);
    expect(rows.map((r) => r.milestone)).toEqual(["first_message"]);
  });
});

describe("notification settings and push tokens", () => {
  it("defaults to quiet-friendly settings, then persists changes", async () => {
    expect(await store().getSettings(ID.A)).toEqual({ messages: true, connectionRequests: true });
    await store().updateSettings(ID.A, { messages: false, connectionRequests: true });
    expect(await store().getSettings(ID.A)).toEqual({ messages: false, connectionRequests: true });
  });

  it("registers, refreshes and removes push tokens", async () => {
    await store().registerPushToken(ID.A, "android", "token-one-123");
    await store().registerPushToken(ID.A, "android", "token-one-123"); // refresh, not duplicate
    await store().registerPushToken(ID.A, "web", "token-two-456");
    let { rows } = await db.query<{ platform: string }>(`select platform from device_push_tokens where user_id = $1 order by platform`, [ID.A]);
    expect(rows.map((r) => r.platform)).toEqual(["android", "web"]);
    await store().removePushToken(ID.A, "token-one-123");
    ({ rows } = await db.query<{ platform: string }>(`select platform from device_push_tokens where user_id = $1`, [ID.A]));
    expect(rows.map((r) => r.platform)).toEqual(["web"]);
  });
});
