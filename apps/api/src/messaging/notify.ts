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
  send(tokens: PushToken[], payload: PushPayload): Promise<number | void>;
}

export const noopPushSender: PushSender = { send: async () => 0 };

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
      const accepted = await sender.send(tokens, {
        title: GENERIC_PUSH.title,
        body: GENERIC_PUSH.body,
        data: { type: "message", conversationId: event.conversationId, messageId: event.messageId },
      });
      return { sent: typeof accepted === "number" ? accepted : tokens.length };
    } catch (err) {
      log("push send failed", err);
      return { sent: 0 };
    }
  }

  return { messageSent };
}
export type MessageNotifier = ReturnType<typeof createMessageNotifier>;

/** Expo tickets confirm queue acceptance, not delivery to a physical device. */
export function createExpoPushSender(options: {
  fetchImpl?: typeof fetch;
  accessToken?: string;
  onUnregistered?: (token: string) => Promise<void>;
  onTicket?: (id: string, token: string) => Promise<void>;
} = {}): PushSender {
  return {
    async send(tokens, payload) {
      let accepted = 0;
      const expoTokens = tokens.filter((t) => /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(t.token));
      for (let offset = 0; offset < expoTokens.length; offset += 100) {
        const batch = expoTokens.slice(offset, offset + 100);
        const response = await (options.fetchImpl ?? fetch)("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}) },
          body: JSON.stringify(batch.map((t) => ({ to: t.token, sound: "default", title: payload.title, body: payload.body, data: payload.data, priority: "high", channelId: "messages" }))),
          signal: AbortSignal.timeout(10_000), redirect: "error",
        });
        // Do not retry ambiguous POST outcomes: Expo does not guarantee idempotency.
        if (!response.ok) throw new Error("Expo push request rejected");
        const result = await response.json() as { data?: { status: string; id?: string; details?: { error?: string } }[] };
        if (!Array.isArray(result.data) || result.data.length !== batch.length) throw new Error("Invalid Expo push response");
        let rejected = false;
        for (const [index, ticket] of result.data.entries()) {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            await options.onUnregistered?.(batch[index]!.token);
          } else if (ticket.status === "ok" && typeof ticket.id === "string") {
            await options.onTicket?.(ticket.id, batch[index]!.token);
            accepted++;
          } else rejected = true;
        }
        if (rejected) throw new Error("Expo push ticket rejected");
      }
      return accepted;
    },
  };
}
