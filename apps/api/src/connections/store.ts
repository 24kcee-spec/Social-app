import type { ActivationSummary, ConnectionRequestView, ConnectionView, InteractionSettings, IntroKind, PersonSummary, RequestStatus, SendRequestResult, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import type { SqlRunner } from "../migrate";
import { pickDeterministic, renderIcebreaker, renderThisOrThat } from "./starters";

/** Every failure is a typed error so routes map them to a status without string matching. */
export class ConnectionError extends Error {
  constructor(public readonly code: "onboarding_required" | "not_found" | "not_accepting" | "already_connected" | "already_pending" | "cooldown" | "rate_limited" | "daily_limit" | "pending_limit" | "custom_not_allowed" | "invalid_intro" | "not_pending" | "forbidden", message: string) {
    super(message);
  }
}

export const LIMITS = { requestsPerDay: 10, pendingOutgoing: 20, expiryDays: 14, cooldownDays: 30, historyDays: 30 } as const;
const DAY = 86_400_000;
const text = (v: unknown): string => String(v);
const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
const ordered = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

const PAIR_BLOCKED = `exists (select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = $2) or (b.blocker_id = $2 and b.blocked_id = $1))`;

function summary(r: Record<string, unknown>, prefix = ""): PersonSummary {
  return { userId: text(r[`${prefix}id`]), displayName: text(r[`${prefix}display_name`]), bio: text(r[`${prefix}bio`] ?? ""), thumbnailPath: r[`${prefix}thumb`] ? text(r[`${prefix}thumb`]) : null };
}

export function createConnectionsStore(db: SqlRunner, clock: () => Date = () => new Date()) {
  /** Requests expire quietly after 14 days; done lazily so no scheduler is needed for the pilot. */
  async function expireStale(now: Date) {
    await db.query(`update connection_requests set status = 'expired' where status = 'pending' and expires_at <= $1::timestamptz`, [now.toISOString()]);
  }

  async function lowPressure(userId: string): Promise<boolean> {
    const { rows } = await db.query<{ low_pressure_mode: boolean }>(`select low_pressure_mode from interaction_settings where user_id = $1`, [userId]);
    return rows[0]?.low_pressure_mode === true;
  }

  async function senderReady(senderId: string) {
    const { rows } = await db.query<{ onboarding_completed: boolean }>(`select onboarding_completed from profiles where user_id = $1`, [senderId]);
    if (!rows[0]?.onboarding_completed) throw new ConnectionError("onboarding_required", "Finish your profile before saying hi");
  }

  /** The recipient must be someone the sender could see in discovery. Anything else looks like "not found" so ids cannot be probed. */
  async function recipientVisible(senderId: string, recipientId: string): Promise<{ messagePermission: string }> {
    if (senderId === recipientId) throw new ConnectionError("not_found", "Person not found");
    const { rows } = await db.query<Record<string, unknown>>(
      `select p.message_permission::text as mp from profiles p join users u on u.id = p.user_id
        where p.user_id = $2 and p.discoverable = true and p.onboarding_completed = true and u.status = 'active' and not ${PAIR_BLOCKED}`, [senderId, recipientId]);
    if (!rows[0]) throw new ConnectionError("not_found", "Person not found");
    return { messagePermission: text(rows[0].mp) };
  }

  async function connectedPair(a: string, b: string): Promise<boolean> {
    const [x, y] = ordered(a, b);
    return (await db.query(`select 1 from connections where user_a = $1 and user_b = $2`, [x, y])).rows.length > 0;
  }

  async function milestone(userId: string, name: "first_request_sent" | "first_connection", now: Date) {
    await db.query(`insert into activation_milestones (user_id, milestone, reached_at) values ($1, $2, $3::timestamptz) on conflict do nothing`, [userId, name, now.toISOString()]);
  }

  async function connect(a: string, b: string, requestId: string, now: Date) {
    const [x, y] = ordered(a, b);
    await db.query(`insert into connections (user_a, user_b, request_id, created_at) values ($1, $2, $3, $4::timestamptz) on conflict do nothing`, [x, y, requestId, now.toISOString()]);
    await milestone(a, "first_connection", now);
    await milestone(b, "first_connection", now);
  }

  /** Renders the final sentence on the server from the catalog. Throws invalid_intro if the reference is not usable. */
  async function renderIntro(senderId: string, recipientId: string, intro: IntroInput): Promise<{ kind: IntroKind; ref: string | null; choice: string | null; text: string }> {
    if (intro.kind === "custom") {
      if (await lowPressure(recipientId)) throw new ConnectionError("custom_not_allowed", "This person prefers a low-pressure start. Pick one of the suggested openers instead.");
      return { kind: "custom", ref: null, choice: null, text: intro.text.trim() };
    }
    if (intro.kind === "icebreaker") {
      const { rows } = await db.query<Record<string, unknown>>(
        `select i.name, i.category from interests i where i.id = $1 and i.active = true
            and exists (select 1 from user_interests where user_id = $2 and interest_id = i.id)
            and exists (select 1 from user_interests where user_id = $3 and interest_id = i.id)`, [intro.ref, senderId, recipientId]);
      if (!rows[0]) throw new ConnectionError("invalid_intro", "That opener is not available for this person");
      return { kind: "icebreaker", ref: intro.ref, choice: null, text: renderIcebreaker({ name: text(rows[0].name), category: text(rows[0].category) }, `${senderId}:${intro.ref}`) };
    }
    if (intro.kind === "question") {
      const { rows } = await db.query<Record<string, unknown>>(`select question from question_cards where id = $1 and active = true`, [intro.ref]);
      if (!rows[0]) throw new ConnectionError("invalid_intro", "That question is not available");
      return { kind: "question", ref: intro.ref, choice: null, text: text(rows[0].question) };
    }
    const { rows } = await db.query<Record<string, unknown>>(`select option_a, option_b from this_or_that_catalog where id = $1 and active = true`, [intro.ref]);
    if (!rows[0]) throw new ConnectionError("invalid_intro", "That game is not available");
    return { kind: "this_or_that", ref: intro.ref, choice: intro.choice, text: renderThisOrThat(text(rows[0].option_a), text(rows[0].option_b), intro.choice) };
  }

  return {
    /** Suggestions the sender chooses from. Same two people always get the same list. */
    async getStarters(viewerId: string, candidateId: string): Promise<StarterSet> {
      await senderReady(viewerId);
      await recipientVisible(viewerId, candidateId);
      const [shared, questions, games] = await Promise.all([
        db.query<Record<string, unknown>>(
          `select i.id::text as id, i.name, i.category, (a.strength + b.strength) as weight from user_interests a
             join user_interests b on b.interest_id = a.interest_id and b.user_id = $2 join interests i on i.id = a.interest_id
            where a.user_id = $1 and i.active = true order by weight desc, i.name limit 3`, [viewerId, candidateId]),
        db.query<Record<string, unknown>>(`select id, question from question_cards where active = true order by sort_order, id`),
        db.query<Record<string, unknown>>(`select id, option_a, option_b from this_or_that_catalog where active = true order by sort_order, id`),
      ]);
      const seed = `${viewerId}:${candidateId}`;
      return {
        icebreakers: shared.rows.map((r) => ({ ref: text(r.id), interestName: text(r.name), text: renderIcebreaker({ name: text(r.name), category: text(r.category) }, `${viewerId}:${text(r.id)}`) })),
        questions: pickDeterministic(questions.rows, seed, 2).map((r) => ({ ref: text(r.id), text: text(r.question) })),
        games: pickDeterministic(games.rows, seed, 2).map((r) => ({ ref: text(r.id), optionA: text(r.option_a), optionB: text(r.option_b) })),
        allowCustom: !(await lowPressure(candidateId)),
      };
    },

    async sendRequest(senderId: string, recipientId: string, intro: IntroInput): Promise<SendRequestResult> {
      const now = clock();
      await expireStale(now);
      await senderReady(senderId);
      const target = await recipientVisible(senderId, recipientId);
      if (target.messagePermission === "nobody") throw new ConnectionError("not_accepting", "This person is not accepting new connections right now");
      if (await connectedPair(senderId, recipientId)) throw new ConnectionError("already_connected", "You are already connected");

      // They already said hi to you: saying hi back connects you both. No one waits, no one is rejected.
      const reverse = await db.query<{ id: string }>(`select id::text as id from connection_requests where sender_id = $1 and recipient_id = $2 and status = 'pending'`, [recipientId, senderId]);
      if (reverse.rows[0]) {
        await db.query(`update connection_requests set status = 'accepted', responded_at = $2::timestamptz where id = $1`, [reverse.rows[0].id, now.toISOString()]);
        await connect(senderId, recipientId, reverse.rows[0].id, now);
        return { status: "connected", requestId: reverse.rows[0].id };
      }

      const same = await db.query(`select 1 from connection_requests where sender_id = $1 and recipient_id = $2 and status = 'pending'`, [senderId, recipientId]);
      if (same.rows.length) throw new ConnectionError("already_pending", "You already said hi. They have until the request expires to reply.");
      const cool = await db.query(
        `select 1 from connection_requests where sender_id = $1 and recipient_id = $2 and status in ('declined', 'expired') and coalesce(responded_at, expires_at) > $3::timestamptz - interval '${LIMITS.cooldownDays} days'`, [senderId, recipientId, now.toISOString()]);
      if (cool.rows.length) throw new ConnectionError("cooldown", "You can try again with this person a little later.");

      const counts = await db.query<Record<string, unknown>>(
        `select count(*) filter (where created_at > $2::timestamptz - interval '1 day')::int as today, count(*) filter (where status = 'pending')::int as pending from connection_requests where sender_id = $1`, [senderId, now.toISOString()]);
      if (Number(counts.rows[0]?.today) >= LIMITS.requestsPerDay) throw new ConnectionError("daily_limit", "That is plenty of hellos for today. Try again tomorrow.");
      if (Number(counts.rows[0]?.pending) >= LIMITS.pendingOutgoing) throw new ConnectionError("pending_limit", "You have a lot of open requests. Give people time to reply first.");

      const rendered = await renderIntro(senderId, recipientId, intro);
      try {
        const { rows } = await db.query<{ id: string }>(
          `insert into connection_requests (sender_id, recipient_id, intro_kind, intro_ref, intro_choice, intro_text, created_at, expires_at)
           values ($1, $2, $3::intro_kind, $4, $5, $6, $7::timestamptz, $7::timestamptz + interval '${LIMITS.expiryDays} days') returning id::text as id`,
          [senderId, recipientId, rendered.kind, rendered.ref, rendered.choice, rendered.text, now.toISOString()]);
        await db.query(`insert into discovery_events (viewer_id, candidate_id, event_type, created_at) values ($1, $2, 'interact', $3::timestamptz)`, [senderId, recipientId, now.toISOString()]);
        await milestone(senderId, "first_request_sent", now);
        return { status: "pending", requestId: rows[0]!.id };
      } catch (err) {
        if ((err as { code?: string }).code === "23505") throw new ConnectionError("already_pending", "There is already an open request between you");
        throw err;
      }
    },

    /** Recipient answers. Decline is private: the sender only ever sees "no reply". */
    async respond(recipientId: string, requestId: string, action: "accept" | "decline"): Promise<void> {
      const now = clock();
      await expireStale(now);
      const { rows } = await db.query<Record<string, unknown>>(`select sender_id::text as sender_id, recipient_id::text as recipient_id, status::text as status from connection_requests where id = $1`, [requestId]);
      const row = rows[0];
      if (!row || text(row.recipient_id) !== recipientId) throw new ConnectionError("not_found", "Request not found");
      if (text(row.status) !== "pending") throw new ConnectionError("not_pending", "This request is no longer open");
      const senderId = text(row.sender_id);
      if ((await db.query(`select 1 where ${PAIR_BLOCKED}`, [recipientId, senderId])).rows.length) throw new ConnectionError("not_found", "Request not found");
      await db.query(`update connection_requests set status = $2::connection_request_status, responded_at = $3::timestamptz where id = $1`, [requestId, action === "accept" ? "accepted" : "declined", now.toISOString()]);
      if (action === "accept") await connect(senderId, recipientId, requestId, now);
    },

    async withdraw(senderId: string, requestId: string): Promise<void> {
      const now = clock();
      await expireStale(now);
      const { rows } = await db.query<{ id: string }>(`update connection_requests set status = 'withdrawn', responded_at = $3::timestamptz where id = $1 and sender_id = $2 and status = 'pending' returning id`, [requestId, senderId, now.toISOString()]);
      if (!rows[0]) throw new ConnectionError("not_found", "Request not found");
    },

    async listRequests(userId: string, box: "incoming" | "outgoing"): Promise<ConnectionRequestView[]> {
      const now = clock();
      await expireStale(now);
      const incoming = box === "incoming";
      const { rows } = await db.query<Record<string, unknown>>(
        `select r.id::text as rid, r.status::text as status, r.intro_kind::text as kind, r.intro_text, r.created_at, r.expires_at,
                o.user_id::text as id, o.display_name, o.bio, (select thumbnail_path from profile_media m where m.user_id = o.user_id order by m.sort_order, m.created_at limit 1) as thumb
           from connection_requests r join profiles o on o.user_id = ${incoming ? "r.sender_id" : "r.recipient_id"}
          where ${incoming ? "r.recipient_id" : "r.sender_id"} = $1 and ${incoming ? "r.status = 'pending'" : `r.status in ('pending', 'accepted', 'declined', 'expired') and r.created_at > $2::timestamptz - interval '${LIMITS.historyDays} days'`}
            and not exists (select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = $1))
          order by r.created_at desc limit 100`, incoming ? [userId] : [userId, now.toISOString()]);
      return rows.map((r) => ({
        id: text(r.rid), other: summary(r), intro: { kind: text(r.kind) as IntroKind, text: text(r.intro_text) },
        status: (["declined", "expired"].includes(text(r.status)) ? "no_reply" : text(r.status)) as RequestStatus, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
      }));
    },

    async listConnections(userId: string): Promise<ConnectionView[]> {
      const { rows } = await db.query<Record<string, unknown>>(
        `select c.created_at, o.user_id::text as id, o.display_name, o.bio, (select thumbnail_path from profile_media m where m.user_id = o.user_id order by m.sort_order, m.created_at limit 1) as thumb
           from connections c join profiles o on o.user_id = case when c.user_a = $1 then c.user_b else c.user_a end
          where (c.user_a = $1 or c.user_b = $1)
            and not exists (select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = o.user_id) or (b.blocker_id = o.user_id and b.blocked_id = $1))
          order by c.created_at desc`, [userId]);
      return rows.map((r) => ({ other: summary(r), connectedAt: iso(r.created_at) }));
    },

    async removeConnection(userId: string, otherId: string): Promise<void> {
      const [x, y] = ordered(userId, otherId);
      await db.query(`delete from connections where user_a = $1 and user_b = $2`, [x, y]);
    },

    async getSettings(userId: string): Promise<InteractionSettings> {
      return { lowPressureMode: await lowPressure(userId) };
    },
    async updateSettings(userId: string, s: InteractionSettings): Promise<InteractionSettings> {
      await db.query(
        `insert into interaction_settings (user_id, low_pressure_mode, updated_at) values ($1, $2, $3::timestamptz)
         on conflict (user_id) do update set low_pressure_mode = excluded.low_pressure_mode, updated_at = excluded.updated_at`, [userId, s.lowPressureMode, clock().toISOString()]);
      return { lowPressureMode: s.lowPressureMode };
    },

    /** Admin: activation = onboarded member who sent a first request within 48h of signing up. */
    async activationSummary(sinceDays: number): Promise<ActivationSummary> {
      const { rows } = await db.query<Record<string, unknown>>(
        `select count(*)::int as signed_up,
                count(*) filter (where p.onboarding_completed)::int as onboarded,
                count(*) filter (where s.reached_at is not null)::int as sent,
                count(*) filter (where c.reached_at is not null)::int as connected,
                count(*) filter (where p.onboarding_completed and s.reached_at <= u.created_at + interval '48 hours')::int as activated
           from users u left join profiles p on p.user_id = u.id
           left join activation_milestones s on s.user_id = u.id and s.milestone = 'first_request_sent'
           left join activation_milestones c on c.user_id = u.id and c.milestone = 'first_connection'
          where u.created_at > $1::timestamptz - ($2::int * interval '1 day')`, [clock().toISOString(), sinceDays]);
      const r = rows[0] ?? {};
      const onboarded = Number(r.onboarded ?? 0);
      const activated = Number(r.activated ?? 0);
      return { sinceDays, signedUp: Number(r.signed_up ?? 0), onboarded, sentFirstRequest: Number(r.sent ?? 0), connected: Number(r.connected ?? 0), activatedWithin48h: activated, activationRate: onboarded > 0 ? Math.round((activated / onboarded) * 1000) / 1000 : null };
    },
  };
}
export type ConnectionsStore = ReturnType<typeof createConnectionsStore>;
