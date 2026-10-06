import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createMessageNotifier, type PushPayload, type PushToken } from "../src/messaging/notify";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const ID = { A: "a1000000-0000-4000-8000-000000000000", B: "a2000000-0000-4000-8000-000000000000" };
let db: PGlite;

const EVENT = { conversationId: "c0000000-0000-4000-8000-000000000000", senderId: ID.A, recipientId: ID.B, messageId: "d0000000-0000-4000-8000-000000000000", body: "Hi Ben!" };

beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, dir);
});
beforeEach(async () => {
  await db.exec("truncate users cascade");
  await db.query(`insert into users (id, email) values ($1, 'ann@example.com'), ($2, 'ben@example.com')`, [ID.A, ID.B]);
  await db.query(`insert into profiles (user_id, display_name, bio, social_styles, discoverable, onboarding_completed) values ($1, 'Ann', '', '{low_pressure}', true, true)`, [ID.A]);
});

function recorder() {
  const calls: { tokens: PushToken[]; payload: PushPayload }[] = [];
  return { calls, sender: { send: async (tokens: PushToken[], payload: PushPayload) => { calls.push({ tokens, payload }); } } };
}

describe("message notifier", () => {
  it("sends to every registered device with a generic payload that leaks nothing private", async () => {
    await db.query(`insert into device_push_tokens (user_id, platform, token) values ($1, 'android', 'token-android-1'), ($1, 'web', 'token-web-23456')`, [ID.B]);
    const { calls, sender } = recorder();
    const notifier = createMessageNotifier(db, sender);
    expect(await notifier.messageSent({ ...EVENT, body: "my secret plan" })).toEqual({ sent: 2 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tokens.map((t) => t.platform).sort()).toEqual(["android", "web"]);
    expect(calls[0]!.payload.title).toBe("New message");
    expect(calls[0]!.payload.body).toBe("Open the app to read it");
    expect(JSON.stringify(calls[0]!.payload)).not.toMatch(/secret|Ann/);
    expect(calls[0]!.payload.data).toEqual({ type: "message", conversationId: EVENT.conversationId, messageId: EVENT.messageId });
  });

  it("stays silent when sender and recipient have blocked each other", async () => {
    await db.query(`insert into device_push_tokens (user_id, platform, token) values ($1, 'android', 'token-android-1')`, [ID.B]);
    await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2)`, [ID.B, ID.A]);
    const { calls, sender } = recorder();
    expect(await createMessageNotifier(db, sender).messageSent(EVENT)).toEqual({ sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it("does not interrupt someone who switched message notifications off", async () => {
    await db.query(`insert into device_push_tokens (user_id, platform, token) values ($1, 'android', 'token-android-1')`, [ID.B]);
    await db.query(`insert into notification_settings (user_id, messages) values ($1, false)`, [ID.B]);
    const { calls, sender } = recorder();
    expect(await createMessageNotifier(db, sender).messageSent(EVENT)).toEqual({ sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it("does nothing when the recipient has no registered devices", async () => {
    const { calls, sender } = recorder();
    expect(await createMessageNotifier(db, sender).messageSent(EVENT)).toEqual({ sent: 0 });
    expect(calls).toHaveLength(0);
  });

  it("reports a sender failure without throwing", async () => {
    await db.query(`insert into device_push_tokens (user_id, platform, token) values ($1, 'web', 'token-web-23456')`, [ID.B]);
    const logs: string[] = [];
    const notifier = createMessageNotifier(db, { send: async () => { throw new Error("fcm down"); } }, (msg) => logs.push(msg));
    expect(await notifier.messageSent(EVENT)).toEqual({ sent: 0 });
    expect(logs).toEqual(["push send failed"]);
  });
});
