import type { PushPlatform } from "@sp/types";
import type { SqlRunner } from "../migrate";
import type { MessageSentEvent } from "./store";

export interface PushToken {
  platform: PushPlatform;
  token: string;
}

export type PushPayload =
  | {
      title: string;
      body: string;
      data: { type: "message"; conversationId: string; messageId: string };
    }
  | {
      title: string;
      body: string;
      data: { type: "connection_request"; requestId: string };
    };

export interface PushSendResult {
  /** Tickets accepted by Expo. This is not a guarantee of delivery to the device. */
  accepted: number;
  /** Tokens Expo says no longer exist; the caller should remove these from its registry. */
  invalidTokens: string[];
}

export interface PushSender {
  send(tokens: PushToken[], payload: PushPayload): Promise<void | PushSendResult>;
}

export const noopPushSender: PushSender = { send: async () => {} };

/** Lock screens are public: payload text stays generic and contains no personal message content. */
export const GENERIC_MESSAGE_PUSH = { title: "New message", body: "Open the app to read it" } as const;
export const GENERIC_CONNECTION_PUSH = { title: "New connection request", body: "Open Social to see the details" } as const;

type PushEvent = { senderId: string; recipientId: string };
type ConnectionRequestCreatedEvent = PushEvent & { requestId: string };

async function deleteInvalidTokens(
  db: SqlRunner,
  userId: string,
  invalidTokens: string[],
  log: (msg: string, err?: unknown) => void,
): Promise<void> {
  for (const token of new Set(invalidTokens)) {
    try {
      await db.query("delete from device_push_tokens where user_id = $1 and token = $2", [userId, token]);
    } catch (err) {
      // A cleanup failure must not affect the message/request that caused the notification.
      log("push token cleanup failed", err);
    }
  }
}

/** A common sender path keeps provider failures from breaking core social actions. */
async function dispatch(
  db: SqlRunner,
  sender: PushSender,
  recipientId: string,
  tokens: PushToken[],
  payload: PushPayload,
  log: (msg: string, err?: unknown) => void,
): Promise<{ sent: number }> {
  if (!tokens.length) return { sent: 0 };
  try {
    const result = await sender.send(tokens, payload);
    if (result) await deleteInvalidTokens(db, recipientId, result.invalidTokens, log);
    // Legacy/test senders return void, meaning "accepted by sender" for backwards compatibility.
    return { sent: result?.accepted ?? tokens.length };
  } catch (err) {
    log("push send failed", err);
    return { sent: 0 };
  }
}

export function createMessageNotifier(
  db: SqlRunner,
  sender: PushSender,
  log: (msg: string, err?: unknown) => void = () => {},
) {
  async function messageSent(event: MessageSentEvent): Promise<{ sent: number }> {
    const { rows: settings } = await db.query<{ messages: boolean }>(
      "select messages from notification_settings where user_id = $1",
      [event.recipientId],
    );
    if (settings[0] && settings[0].messages === false) return { sent: 0 };

    const { rows: blocked } = await db.query(
      "select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = $1)",
      [event.senderId, event.recipientId],
    );
    if (blocked.length) return { sent: 0 };

    const { rows: tokens } = await db.query<PushToken>(
      "select platform, token from device_push_tokens where user_id = $1",
      [event.recipientId],
    );
    return dispatch(db, sender, event.recipientId, tokens, {
      ...GENERIC_MESSAGE_PUSH,
      data: { type: "message", conversationId: event.conversationId, messageId: event.messageId },
    }, log);
  }

  return { messageSent };
}
export type MessageNotifier = ReturnType<typeof createMessageNotifier>;

export function createConnectionRequestNotifier(
  db: SqlRunner,
  sender: PushSender,
  log: (msg: string, err?: unknown) => void = () => {},
) {
  async function requestSent(event: ConnectionRequestCreatedEvent): Promise<{ sent: number }> {
    const { rows: settings } = await db.query<{ connection_requests: boolean }>(
      "select connection_requests from notification_settings where user_id = $1",
      [event.recipientId],
    );
    if (settings[0] && settings[0].connection_requests === false) return { sent: 0 };

    const { rows: blocked } = await db.query(
      "select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = $1)",
      [event.senderId, event.recipientId],
    );
    if (blocked.length) return { sent: 0 };

    const { rows: tokens } = await db.query<PushToken>(
      "select platform, token from device_push_tokens where user_id = $1",
      [event.recipientId],
    );
    return dispatch(db, sender, event.recipientId, tokens, {
      ...GENERIC_CONNECTION_PUSH,
      data: { type: "connection_request", requestId: event.requestId },
    }, log);
  }

  return { requestSent };
}
export type ConnectionRequestNotifier = ReturnType<typeof createConnectionRequestNotifier>;

type ExpoTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};
type ExpoResponseBody = { data?: ExpoTicket[] | ExpoTicket };

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};
type FetchLike = (input: string, init: RequestInit) => Promise<FetchResponseLike>;

/**
 * Sends generic message/connection alerts with Expo Push Service.
 * Retries temporary 429/5xx responses, checks each ticket, and returns tokens Expo has invalidated.
 */
export function createExpoPushSender(
  log: (msg: string, err?: unknown) => void = () => {},
  options: { accessToken?: string; fetchImpl?: FetchLike; retryDelayMs?: number } = {},
): PushSender {
  const fetchImpl: FetchLike = options.fetchImpl ?? (fetch as unknown as FetchLike);

  return {
    async send(tokens: PushToken[], payload: PushPayload): Promise<PushSendResult> {
      const expoTokens = tokens.filter(
        (t) => (t.platform === "android" || t.platform === "ios") &&
          (t.token.startsWith("ExponentPushToken[") || t.token.startsWith("ExpoPushToken[")),
      );
      const result: PushSendResult = { accepted: 0, invalidTokens: [] };
      if (!expoTokens.length) return result;

      for (let offset = 0; offset < expoTokens.length; offset += 100) {
        const batch = expoTokens.slice(offset, offset + 100);
        const messages = batch.map((t) => ({
          to: t.token,
          sound: "default",
          title: payload.title,
          body: payload.body,
          data: payload.data,
          priority: "high",
          channelId: "messages",
        }));

        let response: FetchResponseLike | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "application/json",
          };
          if (options.accessToken?.trim()) headers.Authorization = "Bearer " + options.accessToken.trim();

          response = await fetchImpl("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers,
            body: JSON.stringify(messages),
            signal: AbortSignal.timeout(10_000),
          });

          const temporary = response.status === 429 || response.status >= 500;
          if (temporary && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, (options.retryDelayMs ?? 300) * (attempt + 1)));
            continue;
          }
          break;
        }

        if (!response) throw new Error("Expo Push API did not return a response");
        if (!response.ok) throw new Error("Expo Push API returned HTTP " + response.status);

        const body = await response.json() as ExpoResponseBody;
        const tickets = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
        if (tickets.length !== batch.length) {
          throw new Error("Expo Push API returned an unexpected number of tickets");
        }

        tickets.forEach((ticket, index) => {
          if (ticket.status === "ok") {
            result.accepted += 1;
          } else {
            if (ticket.details?.error === "DeviceNotRegistered") {
              result.invalidTokens.push(batch[index]!.token);
            }
            log("Expo push ticket failed: " + (ticket.details?.error ?? ticket.message ?? "unknown error"));
          }
        });
      }

      return result;
    },
  };
}
