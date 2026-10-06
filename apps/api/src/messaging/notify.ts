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

/** Lock screens are public: the payload carries no sender name and no message text, only a pointer. */
export const GENERIC_PUSH = { title: "New message", body: "Open the app to read it" } as const;

/**
 * Decides whether a new message should interrupt the recipient, and hands it to the sender.
 * Rules: recipient must have message notifications on (default true), must not be in a block with the
 * sender, and must have at least one registered device. The payload is deliberately generic (no sender
 * name, no message text) because notifications show on lock screens; the app fetches the content itself.
 */
export function createMessageNotifier(db: SqlRunner, sender: PushSender, log: (msg: string, err?: unknown) => void = () => {}) {
  async function messageSent(event: MessageSentEvent): Promise<{ sent: number }> {
    const { rows: settings } = await db.query<{ messages: boolean }>(`select messages from notification_settings where user_id = $1`, [event.recipientId]);
    if (settings[0] && settings[0].messages === false) return { sent: 0 };

    const { rows: blocked } = await db.query(
      `select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = $1)`, [event.senderId, event.recipientId]);
    if (blocked.length > 0) return { sent: 0 };

    const { rows: tokens } = await db.query<PushToken>(`select platform, token from device_push_tokens where user_id = $1`, [event.recipientId]);
    if (tokens.length === 0) return { sent: 0 };

    try {
      await sender.send(tokens, {
        title: GENERIC_PUSH.title,
        body: GENERIC_PUSH.body,
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
