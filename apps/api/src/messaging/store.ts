import type { ConversationView, MessagePage, MessageView, NotificationSettings, PushPlatform } from "@sp/types";
import type { SqlRunner } from "../migrate";

/** Every failure is a typed error so routes map them to a status without string matching. */
export class MessagingError extends Error {
  constructor(
    public readonly code: "not_found" | "not_member" | "not_connected" | "onboarding_required" | "rate_limited" | "daily_limit",
    message: string,
  ) {
    super(message);
  }
}

export const MESSAGE_LIMITS = { perMinute: 20, perDay: 400, pageSize: 50, pageMax: 100 } as const;

/** Fired only for genuinely new messages (never for idempotent replays of the same client_tag). */
export interface MessageSentEvent {
  conversationId: string;
  senderId: string;
  recipientId: string;
  messageId: string;
  body: string;
}
export interface MessagingHooks {
  onMessageSent?: (event: MessageSentEvent) => Promise<unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (v: unknown): string => String(v);
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

const PAIR_BLOCKED = `exists (select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = $1))`;

export function createMessagingStore(db: SqlRunner, clock: () => Date = () => new Date(), hooks: MessagingHooks = {}) {
  async function memberOf(conversationId: string, userId: string): Promise<boolean> {
    return (await db.query(`select 1 from conversation_members where conversation_id = $1 and user_id = $2`, [conversationId, userId])).rows.length > 0;
  }

  async function requireMember(conversationId: string, userId: string) {
    // A conversation the user is not in looks like "not found", so ids cannot be probed.
    if (!(await memberOf(conversationId, userId))) throw new MessagingError("not_member", "Conversation not found");
  }

  async function connectedPair(a: string, b: string): Promise<boolean> {
    const [x, y] = ordered(a, b);
    return (await db.query(`select 1 from connections where user_a = $1 and user_b = $2`, [x, y])).rows.length > 0;
  }

  /** The two members of a direct conversation, ordered. */
  async function directPair(conversationId: string): Promise<[string, string] | null> {
    const { rows } = await db.query<{ direct_a: string; direct_b: string }>(`select direct_a::text, direct_b::text from conversations where id = $1 and kind = 'direct'`, [conversationId]);
    return rows[0] ? [text(rows[0].direct_a), text(rows[0].direct_b)] : null;
  }

  function messageView(r: Record<string, unknown>, otherReadAt: Date): MessageView {
    return {
      id: text(r.id), conversationId: text(r.conversation_id), senderId: text(r.sender_id),
      kind: "text", body: text(r.body), clientTag: text(r.client_tag), createdAt: iso(r.created_at),
      read: new Date(iso(r.created_at)) <= otherReadAt,
    };
  }

  /** Open (or return) the direct conversation with someone you are connected to. */
  async function openConversation(me: string, otherId: string): Promise<ConversationView> {
    if (me === otherId) throw new MessagingError("not_found", "Person not found");
    const { rows: ready } = await db.query<{ onboarding_completed: boolean }>(`select onboarding_completed from profiles where user_id = $1`, [me]);
    if (!ready[0]?.onboarding_completed) throw new MessagingError("onboarding_required", "Finish your profile before messaging");
    const [x, y] = ordered(me, otherId);
    const { rows: other } = await db.query<Record<string, unknown>>(
      `select p.user_id::text as id, p.display_name, p.bio from profiles p join users u on u.id = p.user_id
        where p.user_id = $2 and u.status = 'active' and not ${PAIR_BLOCKED}`, [me, otherId]);
    if (!other[0] || !(await connectedPair(me, otherId))) throw new MessagingError("not_connected", "You can message people you are connected with");

    await db.query(`insert into conversations (kind, direct_a, direct_b) values ('direct', $1, $2) on conflict do nothing`, [x, y]);
    const { rows: conv } = await db.query<Record<string, unknown>>(
      `select c.id::text as id, c.created_at,
              (select thumbnail_path from profile_media m where m.user_id = $3 order by m.sort_order, m.created_at limit 1) as thumb
         from conversations c where c.kind = 'direct' and c.direct_a = $1 and c.direct_b = $2`, [x, y, otherId]);
    const id = text(conv[0]!.id);
    await db.query(`insert into conversation_members (conversation_id, user_id) values ($1, $2), ($1, $3) on conflict do nothing`, [id, x, y]);

    return {
      id,
      other: { userId: otherId, displayName: text(other[0].display_name), bio: text(other[0].bio ?? ""), thumbnailPath: conv[0]!.thumb ? text(conv[0]!.thumb) : null },
      lastMessage: null, unreadCount: 0, createdAt: iso(conv[0]!.created_at),
    };
  }

  /** Newest conversations first; unread is what the other person sent since your watermark. */
  async function listConversations(me: string): Promise<ConversationView[]> {
    const { rows } = await db.query<Record<string, unknown>>(
      `select c.id::text as id, c.created_at,
              o.user_id::text as oid, o.display_name, o.bio,
              (select thumbnail_path from profile_media m where m.user_id = o.user_id order by m.sort_order, m.created_at limit 1) as thumb,
              lm.sender_id::text as lm_sender, lm.body as lm_body, lm.created_at as lm_at,
              (select count(*)::int from messages u where u.conversation_id = c.id and u.sender_id <> $1 and u.created_at > cm.last_read_at) as unread
         from conversations c
         join conversation_members cm on cm.conversation_id = c.id and cm.user_id = $1
         join conversation_members om on om.conversation_id = c.id and om.user_id <> $1
         join profiles o on o.user_id = om.user_id
         left join lateral (select sender_id, body, created_at from messages m where m.conversation_id = c.id order by m.created_at desc, m.id desc limit 1) lm on true
        order by coalesce(lm.created_at, c.created_at) desc`,
      [me]);
    return rows.map((r) => ({
      id: text(r.id),
      other: { userId: text(r.oid), displayName: text(r.display_name), bio: text(r.bio ?? ""), thumbnailPath: r.thumb ? text(r.thumb) : null },
      lastMessage: r.lm_at ? { senderId: text(r.lm_sender), body: text(r.lm_body), createdAt: iso(r.lm_at) } : null,
      unreadCount: Number(r.unread ?? 0),
      createdAt: iso(r.created_at),
    }));
  }

  /**
   * Newest page first internally, returned oldest-first.
   * Cursor is the composite (created_at, id) from MessagePage.nextCursor, so messages sharing the exact
   * same created_at are never skipped or duplicated. A bare created_at (legacy clients) still works.
   */
  async function listMessages(me: string, conversationId: string, opts: { limit: number; before?: string }): Promise<MessagePage> {
    await requireMember(conversationId, me);
    const pair = await directPair(conversationId);
    const otherId = pair ? (pair[0] === me ? pair[1] : pair[0]) : null;
    const { rows: readRow } = otherId
      ? await db.query<{ last_read_at: Date }>(`select last_read_at from conversation_members where conversation_id = $1 and user_id = $2`, [conversationId, otherId])
      : { rows: [] as { last_read_at: Date }[] };
    const otherReadAt = readRow[0] ? new Date(readRow[0].last_read_at) : new Date(0);

    const limit = Math.min(Math.max(1, opts.limit), MESSAGE_LIMITS.pageMax);
    const params: unknown[] = [conversationId, limit + 1];
    let cursor = "";
    if (opts.before) {
      const sep = opts.before.lastIndexOf("~");
      const hasId = sep > 0 && UUID_RE.test(opts.before.slice(sep + 1));
      const at = hasId ? opts.before.slice(0, sep) : opts.before;
      if (hasId) {
        cursor = `and (m.created_at, m.id) < ($3::timestamptz, $4::uuid)`;
        params.push(at, opts.before.slice(sep + 1));
      } else {
        cursor = `and m.created_at < $3::timestamptz`;
        params.push(at);
      }
    }
    const { rows } = await db.query<Record<string, unknown>>(
      `select m.id::text, m.conversation_id::text, m.sender_id::text, m.body, m.client_tag::text, m.created_at,
              m.created_at::text as created_at_raw
         from messages m where m.conversation_id = $1 ${cursor} order by m.created_at desc, m.id desc limit $2`,
      params);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();
    // created_at_raw keeps full Postgres microsecond precision; a JS Date round-trip would truncate to
    // milliseconds and could skip same-millisecond messages on the next page.
    const oldest = page[0];
    return {
      messages: page.map((r) => messageView(r, otherReadAt)),
      hasMore,
      nextCursor: hasMore && oldest ? `${text(oldest.created_at_raw)}~${text(oldest.id)}` : null,
    };
  }

  /** Sends a text message. Retries with the same clientTag return the stored message instead of a duplicate. */
  async function sendMessage(me: string, conversationId: string, body: string, clientTag: string): Promise<MessageView> {
    await requireMember(conversationId, me);
    const pair = await directPair(conversationId);
    if (!pair) throw new MessagingError("not_found", "Conversation not found");
    const otherId = pair[0] === me ? pair[1] : pair[0];
    // The chat freezes when the connection is removed: history stays readable, new messages stop.
    if (!(await connectedPair(me, otherId))) throw new MessagingError("not_connected", "You two are no longer connected, so this chat is read-only");

    const now = clock();
    const { rows: minute } = await db.query<{ n: number }>(`select count(*)::int as n from messages where conversation_id = $1 and sender_id = $2 and created_at > $3::timestamptz`, [conversationId, me, new Date(now.getTime() - 60_000).toISOString()]);
    if (Number(minute[0]?.n ?? 0) >= MESSAGE_LIMITS.perMinute) throw new MessagingError("rate_limited", "Too many messages in a short burst");
    const { rows: day } = await db.query<{ n: number }>(`select count(*)::int as n from messages where sender_id = $1 and created_at > $2::timestamptz`, [me, new Date(now.getTime() - 86_400_000).toISOString()]);
    if (Number(day[0]?.n ?? 0) >= MESSAGE_LIMITS.perDay) throw new MessagingError("daily_limit", "Daily message limit reached");

    const { rows: inserted } = await db.query<Record<string, unknown>>(
      `insert into messages (conversation_id, sender_id, kind, body, client_tag, created_at) values ($1, $2, 'text', $3, $4::uuid, $5::timestamptz)
       on conflict (conversation_id, sender_id, client_tag) do nothing
       returning id::text, conversation_id::text, sender_id::text, body, client_tag::text, created_at`,
      [conversationId, me, body, clientTag, now.toISOString()]);
    let row = inserted[0];
    if (!row) {
      // Idempotent retry: return the original send.
      row = (await db.query<Record<string, unknown>>(
        `select id::text, conversation_id::text, sender_id::text, body, client_tag::text, created_at from messages where conversation_id = $1 and sender_id = $2 and client_tag = $3::uuid`,
        [conversationId, me, clientTag])).rows[0]!;
    } else {
      await db.query(`insert into activation_milestones (user_id, milestone, reached_at) values ($1, 'first_message', $2::timestamptz) on conflict do nothing`, [me, now.toISOString()]);
      // Sending implies you have read everything so far.
      await db.query(`update conversation_members set last_read_at = greatest(last_read_at, $3::timestamptz) where conversation_id = $1 and user_id = $2`, [conversationId, me, now.toISOString()]);
      if (hooks.onMessageSent) {
        // Delivery (push) must never fail a send: notifier errors are swallowed here.
        await hooks.onMessageSent({ conversationId, senderId: me, recipientId: otherId, messageId: text(row.id), body }).catch(() => undefined);
      }
    }
    const { rows: readRow } = await db.query<{ last_read_at: Date }>(`select last_read_at from conversation_members where conversation_id = $1 and user_id = $2`, [conversationId, otherId]);
    return messageView(row, readRow[0] ? new Date(readRow[0].last_read_at) : new Date(0));
  }

  /** Moves the read watermark to now. */
  async function markRead(me: string, conversationId: string): Promise<void> {
    await requireMember(conversationId, me);
    await db.query(`update conversation_members set last_read_at = $3::timestamptz where conversation_id = $1 and user_id = $2`, [conversationId, me, clock().toISOString()]);
  }

  async function getSettings(me: string): Promise<NotificationSettings> {
    const { rows } = await db.query<Record<string, unknown>>(`select messages, connection_requests from notification_settings where user_id = $1`, [me]);
    return rows[0] ? { messages: rows[0].messages === true, connectionRequests: rows[0].connection_requests === true } : { messages: true, connectionRequests: true };
  }

  async function updateSettings(me: string, input: NotificationSettings): Promise<NotificationSettings> {
    await db.query(
      `insert into notification_settings (user_id, messages, connection_requests, updated_at) values ($1, $2, $3, $4::timestamptz)
       on conflict (user_id) do update set messages = excluded.messages, connection_requests = excluded.connection_requests, updated_at = excluded.updated_at`,
      [me, input.messages, input.connectionRequests, clock().toISOString()]);
    return input;
  }

  async function registerPushToken(me: string, platform: PushPlatform, token: string): Promise<void> {
    await db.query(
      `insert into device_push_tokens (user_id, platform, token, updated_at) values ($1, $2, $3, $4::timestamptz)
       on conflict (user_id, token) do update set platform = excluded.platform, updated_at = excluded.updated_at`,
      [me, platform, token, clock().toISOString()]);
  }

  async function removePushToken(me: string, token: string): Promise<void> {
    await db.query(`delete from device_push_tokens where user_id = $1 and token = $2`, [me, token]);
  }

  return { openConversation, listConversations, listMessages, sendMessage, markRead, getSettings, updateSettings, registerPushToken, removePushToken };
}
export type MessagingStore = ReturnType<typeof createMessagingStore>;
