import type { BlockedUser, DiscoveryCard, DiscoveryRelation, DiscoveryEventType, DiscoveryFeed, DiscoveryReason, InterestStrength, MessagePermission, SocialStyle } from "@sp/types";
import type { SqlRunner } from "../migrate";
import { rankCandidates, scoreCandidate, visibleReasons, type ScoredCandidate, type ScoringHistory, type ScoringPerson } from "./scoring";

export class OnboardingRequiredError extends Error {}
export class UnknownUserError extends Error {}
export class SelfActionError extends Error {}
export class RateLimitedError extends Error {}

/** Candidate pool limits: enough for a 300-person pilot, bounded for later growth. */
export const POOL = { sharedInterest: 400, recent: 150, maxPageEnd: 251, eventsPerMinute: 300 } as const;

const text = (v: unknown): string => String(v);
const asDate = (v: unknown): Date => new Date(v as string | Date);

/** Eligibility is one SQL fragment so the feed and the admin "why" tool can never disagree. $1 = viewer id. */
const ELIGIBLE = `p.discoverable = true and p.onboarding_completed = true and u.status = 'active' and p.user_id <> $1
  and not exists (select 1 from user_blocks b where (b.blocker_id = $1 and b.blocked_id = p.user_id) or (b.blocker_id = p.user_id and b.blocked_id = $1))
  and not exists (select 1 from connections c where (c.user_a = $1 and c.user_b = p.user_id) or (c.user_b = $1 and c.user_a = p.user_id))`;

interface LoadedPerson {
  person: ScoringPerson;
  displayName: string;
  bio: string;
  messagePermission: MessagePermission;
  prompts: { promptId: string; prompt: string; category: string; answer: string; updatedAt: string }[];
  thumbnailPath: string | null;
  interestRows: { id: string; name: string; category: string; slug: string; sortOrder: number; strength: InterestStrength }[];
}

export interface DiscoveryExplanation {
  viewerId: string;
  candidateId: string;
  eligible: boolean;
  excludedBecause: string[];
  hiddenByIgnores: boolean;
  score: number | null;
  components: DiscoveryReason[];
  /** 1-based position in the viewer's current feed (first 50), or null if not in it. */
  feedPosition: number | null;
  history: ScoringHistory;
}

export function createDiscoveryStore(db: SqlRunner, clock: () => Date = () => new Date()) {
  async function loadPeople(ids: string[]): Promise<Map<string, LoadedPerson>> {
    const out = new Map<string, LoadedPerson>();
    if (ids.length === 0) return out;
    const [people, interests, prompts, media] = await Promise.all([
      db.query<Record<string, unknown>>(
        `select p.user_id::text as id, p.display_name, p.bio, p.social_styles, p.message_permission::text as message_permission, u.created_at, u.last_active_at
           from profiles p join users u on u.id = p.user_id where p.user_id = any($1::uuid[])`, [ids]),
      db.query<Record<string, unknown>>(
        `select ui.user_id::text as uid, i.id::text as id, i.name, i.category, i.slug, i.sort_order, ui.strength
           from user_interests ui join interests i on i.id = ui.interest_id where ui.user_id = any($1::uuid[]) and i.active = true
          order by i.category, i.sort_order, i.name`, [ids]),
      db.query<Record<string, unknown>>(
        `select a.user_id::text as uid, a.prompt_id, c.prompt, c.category, a.answer, a.updated_at
           from prompt_answers a join prompt_catalog c on c.id = a.prompt_id where a.user_id = any($1::uuid[]) and c.active = true
          order by c.sort_order, c.id`, [ids]),
      db.query<Record<string, unknown>>(
        `select distinct on (user_id) user_id::text as uid, thumbnail_path from profile_media where user_id = any($1::uuid[]) order by user_id, sort_order, created_at`, [ids]),
    ]);
    for (const r of people.rows) {
      out.set(text(r.id), {
        person: { userId: text(r.id), interests: [], socialStyles: ((r.social_styles as SocialStyle[]) ?? []), prompts: [], lastActiveAt: r.last_active_at ? asDate(r.last_active_at) : null, createdAt: asDate(r.created_at) },
        displayName: text(r.display_name), bio: text(r.bio), messagePermission: r.message_permission as MessagePermission, prompts: [], thumbnailPath: null, interestRows: [],
      });
    }
    for (const r of interests.rows) {
      const p = out.get(text(r.uid));
      if (!p) continue;
      const strength = Number(r.strength) as InterestStrength;
      p.person.interests.push({ id: text(r.id), name: text(r.name), category: text(r.category), strength });
      p.interestRows.push({ id: text(r.id), name: text(r.name), category: text(r.category), slug: text(r.slug), sortOrder: Number(r.sort_order), strength });
    }
    for (const r of prompts.rows) {
      const p = out.get(text(r.uid));
      if (!p) continue;
      p.person.prompts.push({ promptId: text(r.prompt_id), prompt: text(r.prompt) });
      p.prompts.push({ promptId: text(r.prompt_id), prompt: text(r.prompt), category: text(r.category), answer: text(r.answer), updatedAt: asDate(r.updated_at).toISOString() });
    }
    for (const r of media.rows) { const p = out.get(text(r.uid)); if (p) p.thumbnailPath = text(r.thumbnail_path); }
    return out;
  }

  async function loadHistory(viewerId: string, ids: string[], now: Date): Promise<Map<string, ScoringHistory>> {
    const out = new Map<string, ScoringHistory>();
    if (ids.length === 0) return out;
    const { rows } = await db.query<Record<string, unknown>>(
      `select candidate_id::text as cid,
              count(*) filter (where event_type = 'ignore' and created_at > $3::timestamptz - interval '30 days') as ignores,
              count(*) filter (where event_type = 'impression' and created_at > $3::timestamptz - interval '7 days') as impressions
         from discovery_events where viewer_id = $1 and candidate_id = any($2::uuid[]) group by candidate_id`, [viewerId, ids, now.toISOString()]);
    for (const r of rows) out.set(text(r.cid), { ignores30d: Number(r.ignores), impressions7d: Number(r.impressions) });
    return out;
  }

  async function loadRelations(viewerId: string, ids: string[], now: Date): Promise<Map<string, DiscoveryRelation>> {
    const out = new Map<string, DiscoveryRelation>();
    if (ids.length === 0) return out;
    const { rows } = await db.query<Record<string, unknown>>(
      `select case when sender_id = $1 then recipient_id::text else sender_id::text end as other, (sender_id = $1) as outgoing from connection_requests
        where status = 'pending' and expires_at > $3::timestamptz and ((sender_id = $1 and recipient_id = any($2::uuid[])) or (recipient_id = $1 and sender_id = any($2::uuid[])))`, [viewerId, ids, now.toISOString()]);
    for (const r of rows) out.set(text(r.other), r.outgoing ? "pending_out" : "pending_in");
    return out;
  }

  async function requireOnboarded(viewerId: string): Promise<LoadedPerson> {
    const flag = await db.query<{ onboarding_completed: boolean }>(`select onboarding_completed from profiles where user_id = $1`, [viewerId]);
    if (!flag.rows[0]?.onboarding_completed) throw new OnboardingRequiredError("Finish your profile to see people");
    const viewer = (await loadPeople([viewerId])).get(viewerId);
    if (!viewer) throw new OnboardingRequiredError("Finish your profile to see people");
    return viewer;
  }

  async function candidateIds(viewerId: string): Promise<string[]> {
    const [shared, recent] = await Promise.all([
      db.query<{ id: string }>(
        `select p.user_id::text as id from profiles p join users u on u.id = p.user_id
           join user_interests ui on ui.user_id = p.user_id and ui.interest_id in (select interest_id from user_interests where user_id = $1)
          where ${ELIGIBLE} group by p.user_id order by count(*) desc, p.user_id limit ${POOL.sharedInterest}`, [viewerId]),
      db.query<{ id: string }>(
        `select p.user_id::text as id from profiles p join users u on u.id = p.user_id
          where ${ELIGIBLE} order by coalesce(u.last_active_at, u.created_at) desc, p.user_id limit ${POOL.recent}`, [viewerId]),
    ]);
    return [...new Set([...shared.rows.map((r) => r.id), ...recent.rows.map((r) => r.id)])];
  }

  function toCard(loaded: LoadedPerson, relation: DiscoveryRelation, ranked: { score: number; components: DiscoveryReason[]; sharedInterests: { id: string }[] }): DiscoveryCard {
    const sharedIds = new Set(ranked.sharedInterests.map((s) => s.id));
    const interests = loaded.interestRows.map((i) => ({ id: i.id, name: i.name, category: i.category, slug: i.slug, sortOrder: i.sortOrder, strength: i.strength }));
    return {
      userId: loaded.person.userId, displayName: loaded.displayName, bio: loaded.bio, socialStyles: loaded.person.socialStyles, messagePermission: loaded.messagePermission,
      interests, sharedInterests: interests.filter((i) => sharedIds.has(i.id)), prompts: loaded.prompts.slice(0, 3), thumbnailPath: loaded.thumbnailPath, relation,
      score: ranked.score, reasons: visibleReasons(ranked.components),
    };
  }

  async function rankedFeed(viewerId: string, take: number) {
    const now = clock();
    const viewer = await requireOnboarded(viewerId);
    const ids = await candidateIds(viewerId);
    const [people, history] = await Promise.all([loadPeople(ids), loadHistory(viewerId, ids, now)]);
    const scored: { scored: ScoredCandidate; lastActiveAt: Date | null }[] = [];
    for (const id of ids) {
      const candidate = people.get(id);
      if (!candidate) continue;
      scored.push({ scored: scoreCandidate(viewer.person, candidate.person, history.get(id) ?? { ignores30d: 0, impressions7d: 0 }, now), lastActiveAt: candidate.person.lastActiveAt });
    }
    return { viewer, people, ranked: rankCandidates(scored, take), now };
  }

  return {
    /** Ranked people for the viewer. offset+limit is capped so ranking cost stays bounded. */
    async getFeed(viewerId: string, limit: number, offset: number): Promise<DiscoveryFeed> {
      const end = Math.min(offset + limit, POOL.maxPageEnd - 1);
      const { people, ranked } = await rankedFeed(viewerId, end + 1);
      const page = ranked.slice(offset, end);
      const relations = await loadRelations(viewerId, page.map((r) => r.userId), clock());
      return { people: page.map((r) => toCard(people.get(r.userId)!, relations.get(r.userId) ?? "none", r)), hasMore: ranked.length > end && end < POOL.maxPageEnd - 1 };
    },

    /** Records impressions/opens/ignores/interacts. Unknown ids and self are dropped silently (no user-existence oracle). Returns how many were stored. */
    async recordEvents(viewerId: string, events: { candidateId: string; type: DiscoveryEventType }[]): Promise<number> {
      const recent = await db.query<{ n: string }>(`select count(*)::text as n from discovery_events where viewer_id = $1 and created_at > now() - interval '1 minute'`, [viewerId]);
      if (Number(recent.rows[0]?.n ?? 0) + events.length > POOL.eventsPerMinute) throw new RateLimitedError("Too many events");
      const { rows } = await db.query<{ id: string }>(
        `insert into discovery_events (viewer_id, candidate_id, event_type)
         select $1, x.cid, x.t::discovery_event_type from unnest($2::uuid[], $3::text[]) as x(cid, t)
           join users u on u.id = x.cid where x.cid <> $1 returning id`,
        [viewerId, events.map((e) => e.candidateId), events.map((e) => e.type)]);
      return rows.length;
    },

    async block(blockerId: string, blockedId: string): Promise<void> {
      if (blockerId === blockedId) throw new SelfActionError("You cannot block yourself");
      const exists = await db.query(`select 1 from users where id = $1`, [blockedId]);
      if (exists.rows.length === 0) throw new UnknownUserError("User not found");
      await db.query(`insert into user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [blockerId, blockedId]);
      // Blocking ends any relationship: connection removed, open requests withdrawn, nothing left to answer.
      await db.query(`delete from connections where (user_a = $1 and user_b = $2) or (user_a = $2 and user_b = $1)`, [blockerId, blockedId]);
      await db.query(`update connection_requests set status = 'withdrawn', responded_at = now() where status = 'pending' and ((sender_id = $1 and recipient_id = $2) or (sender_id = $2 and recipient_id = $1))`, [blockerId, blockedId]);
    },

    async unblock(blockerId: string, blockedId: string): Promise<void> {
      await db.query(`delete from user_blocks where blocker_id = $1 and blocked_id = $2`, [blockerId, blockedId]);
    },

    async listBlocks(blockerId: string): Promise<BlockedUser[]> {
      const { rows } = await db.query<Record<string, unknown>>(
        `select b.blocked_id::text as id, coalesce(p.display_name, 'Member') as display_name, b.created_at
           from user_blocks b left join profiles p on p.user_id = b.blocked_id where b.blocker_id = $1 order by b.created_at desc`, [blockerId]);
      return rows.map((r) => ({ userId: text(r.id), displayName: text(r.display_name), blockedAt: asDate(r.created_at).toISOString() }));
    },

    /** Admin tool: why does (or doesn't) `viewerId` see `candidateId`? Same SQL + same scorer as the feed. */
    async explain(viewerId: string, candidateId: string): Promise<DiscoveryExplanation> {
      const now = clock();
      const empty: ScoringHistory = { ignores30d: 0, impressions7d: 0 };
      const checks = await db.query<Record<string, unknown>>(
        `select p.discoverable, p.onboarding_completed, u.status::text as status,
                exists (select 1 from user_blocks b where b.blocker_id = $1 and b.blocked_id = $2) as viewer_blocked,
                exists (select 1 from user_blocks b where b.blocker_id = $2 and b.blocked_id = $1) as candidate_blocked,
                exists (select 1 from connections c where (c.user_a = $1 and c.user_b = $2) or (c.user_a = $2 and c.user_b = $1)) as already_connected
           from profiles p join users u on u.id = p.user_id where p.user_id = $2`, [viewerId, candidateId]);
      const row = checks.rows[0];
      const why: string[] = [];
      if (viewerId === candidateId) why.push("same_person");
      if (!row) why.push("candidate_has_no_profile");
      else {
        if (!row.discoverable) why.push("candidate_not_discoverable");
        if (!row.onboarding_completed) why.push("candidate_onboarding_incomplete");
        if (row.status !== "active") why.push(`candidate_status_${text(row.status)}`);
        if (row.viewer_blocked) why.push("viewer_blocked_candidate");
        if (row.candidate_blocked) why.push("candidate_blocked_viewer");
        if (row.already_connected) why.push("already_connected");
      }
      const viewerFlag = await db.query<{ onboarding_completed: boolean }>(`select onboarding_completed from profiles where user_id = $1`, [viewerId]);
      if (!viewerFlag.rows[0]?.onboarding_completed) why.push("viewer_onboarding_incomplete");
      const people = await loadPeople([viewerId, candidateId]);
      const viewer = people.get(viewerId); const candidate = people.get(candidateId);
      if (!viewer || !candidate) return { viewerId, candidateId, eligible: false, excludedBecause: why, hiddenByIgnores: false, score: null, components: [], feedPosition: null, history: empty };
      const history = (await loadHistory(viewerId, [candidateId], now)).get(candidateId) ?? empty;
      const scored = scoreCandidate(viewer.person, candidate.person, history, now);
      let feedPosition: number | null = null;
      if (why.length === 0) {
        const { ranked } = await rankedFeed(viewerId, 50);
        const index = ranked.findIndex((r) => r.userId === candidateId);
        if (index >= 0) feedPosition = index + 1;
      }
      return { viewerId, candidateId, eligible: why.length === 0, excludedBecause: why, hiddenByIgnores: scored.hidden, score: scored.base, components: scored.components, feedPosition, history };
    },
  };
}
export type DiscoveryStore = ReturnType<typeof createDiscoveryStore>;
