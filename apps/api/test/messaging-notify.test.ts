import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate";
import { createConnectionRequestNotifier, createExpoPushSender, createMessageNotifier, type PushPayload, type PushToken } from "../src/messaging/notify";

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


describe("connection request notifier", () => {
  it("sends a generic alert when connection-request notifications are enabled", async () => {
    await db.query(
      "insert into device_push_tokens (user_id, platform, token) values ($1, 'android', 'ExponentPushToken[device-abc123]')",
      [ID.B],
    );
    const { calls, sender } = recorder();
    const notifier = createConnectionRequestNotifier(db, sender);
    expect(await notifier.requestSent({ senderId: ID.A, recipientId: ID.B, requestId: "e0000000-0000-4000-8000-000000000000" }))
      .toEqual({ sent: 1 });
    expect(calls[0]!.payload.title).toBe("New connection request");
    expect(calls[0]!.payload.body).toBe("Open Social to see the details");
    expect(calls[0]!.payload.data).toEqual({
      type: "connection_request",
      requestId: "e0000000-0000-4000-8000-000000000000",
    });
    expect(JSON.stringify(calls[0]!.payload)).not.toMatch(/Ann|Ben|example\.com/);
  });

  it("honors the connection-request preference", async () => {
    await db.query(
      "insert into device_push_tokens (user_id, platform, token) values ($1, 'android', 'ExponentPushToken[device-abc123]')",
      [ID.B],
    );
    await db.query(
      "insert into notification_settings (user_id, connection_requests) values ($1, false)",
      [ID.B],
    );
    const { calls, sender } = recorder();
    expect(await createConnectionRequestNotifier(db, sender).requestSent({
      senderId: ID.A, recipientId: ID.B, requestId: "e0000000-0000-4000-8000-000000000000",
    })).toEqual({ sent: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("Expo push sender", () => {
  it("checks tickets and deletes registrations Expo reports as unregistered", async () => {
    const invalid = "ExponentPushToken[invalid-device-123]";
    const valid = "ExponentPushToken[valid-device-123]";
    await db.query(
      "insert into device_push_tokens (user_id, platform, token) values ($1, 'android', $2), ($1, 'android', $3)",
      [ID.B, invalid, valid],
    );
    const sender = createExpoPushSender(() => {}, {
      retryDelayMs: 0,
      fetchImpl: async (_url, init) => {
        const messages = JSON.parse(String(init.body)) as { to: string }[];
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: messages.map((message) => message.to === invalid
              ? { status: "error", message: "The recipient is not registered", details: { error: "DeviceNotRegistered" } }
              : { status: "ok", id: "ticket-valid" }),
          }),
        };
      },
    });

    expect(await createMessageNotifier(db, sender).messageSent(EVENT)).toEqual({ sent: 1 });
    const { rows } = await db.query<{ token: string }>(
      "select token from device_push_tokens where user_id = $1",
      [ID.B],
    );
    expect(rows.map((row) => row.token)).toEqual([valid]);
  });

  it("retries a temporary HTTP error and accepts a valid ticket", async () => {
    let calls = 0;
    const sender = createExpoPushSender(() => {}, {
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ data: [{ status: "ok", id: "ticket-1" }] }) };
      },
    });
    const result = await sender.send(
      [{ platform: "android", token: "ExponentPushToken[valid-device-123]" }],
      { title: "New message", body: "Open the app to read it", data: { type: "message", conversationId: EVENT.conversationId, messageId: EVENT.messageId } },
    );
    expect(calls).toBe(2);
    expect(result).toEqual({ accepted: 1, invalidTokens: [] });
  });

  it("does not report success for an HTTP error response", async () => {
    const sender = createExpoPushSender(() => {}, {
      retryDelayMs: 0,
      fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({}) }),
    });
    await expect(sender.send(
      [{ platform: "android", token: "ExponentPushToken[valid-device-123]" }],
      { title: "New message", body: "Open the app to read it", data: { type: "message", conversationId: EVENT.conversationId, messageId: EVENT.messageId } },
    )).rejects.toThrow("HTTP 400");
  });
});
