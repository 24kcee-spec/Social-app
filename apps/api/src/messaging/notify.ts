import type { PushPlatform } from "@sp/types";
import type { SqlRunner } from "../migrate";
import type { MessageSentEvent } from "./store";

export interface PushToken {
  platform: PushPlatform;
  token: string;
}

export interface PushPayload {
  title: string;
  body: string;
  data: { type: "message"; conversationId: string; messageId: string };
}

/**
 * Sends a push payload to device tokens. The default is a no-op: real FCM/APNs/WebPush credentials
 * arrive with the pre-pilot push work (see docs/handover.md). Swapping in a real sender requires no
 * changes here.
 */
export interface PushSender {
  send(tokens: PushToken[], payload: PushPayload): Promise<void>;
}

export const noopPushSender: PushSender = { send: async () => {} };

const PREVIEW_MAX = 120;

/**
 * Decides whether a new message should interrupt the recipient, and hands it to the sender.
 * Rules: recipient must have message notifications on (default true) and at least one registered
 * device. Nothing is sent for muted recipients or token-less devices.
 */
export function createMessageNotifier(db: SqlRunner, sender: PushSender, log: (msg: string, err?: unknown) => void = () => {}) {
  async function messageSent(event: MessageSentEvent): Promise<{ sent: number }> {
    const { rows: settings } = await db.query<{ messages: boolean }>(`select messages from notification_settings where user_id = $1`, [event.recipientId]);
    if (settings[0] && settings[0].messages === false) return { sent: 0 };

    const { rows: tokens } = await db.query<PushToken>(`select platform, token from device_push_tokens where user_id = $1`, [event.recipientId]);
    if (tokens.length === 0) return { sent: 0 };

    const { rows: profile } = await db.query<{ display_name: string }>(`select display_name from profiles where user_id = $1`, [event.senderId]);
    const preview = event.body.length > PREVIEW_MAX ? `${event.body.slice(0, PREVIEW_MAX - 1)}…` : event.body;
    try {
      await sender.send(tokens, {
        title: String(profile[0]?.display_name ?? "New message"),
        body: preview,
        data: { type: "message", conversationId: event.conversationId, messageId: event.messageId },
      });
      return { sent: tokens.length };
    } catch (err) {
      log("push send failed", err);
      return { sent: 0 };
    }
  }

  return { messageSent };
}
export type MessageNotifier = ReturnType<typeof createMessageNotifier>;
