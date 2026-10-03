import type { DiscoveryReason, DiscoveryReasonCode, InterestStrength, SocialStyle } from "@sp/types";

/**
 * Deterministic weighted-overlap scoring (blueprint Phase 3). No ML, no randomness, no hidden inputs:
 * the same people + history + clock always produce the same order, and every point is attached to a reason.
 */
export const WEIGHTS = {
  /** Per shared interest: base + both people's strengths (1-3 each) => 8..12 points. Shared interests are the strongest signal. */
  sharedInterestBase: 6,
  sharedInterestCap: 60,
  /** Same interest category (e.g. both into Music) without a shared interest in it. */
  relatedCategory: 2,
  relatedCategoryCap: 8,
  sharedStyle: 5,
  sharedStyleCap: 15,
  sharedPrompt: 4,
  sharedPromptCap: 8,
  /** Recency: small boost so the feed favours people who will actually reply. */
  activeWithin1d: 6,
  activeWithin3d: 4,
  activeWithin7d: 2,
  activeWithin30d: 1,
  newMemberDays: 14,
  newMember: 3,
  /** Freshness: each impression beyond the first in 7 days costs points, so the same faces do not loop. */
  repeatFatiguePerImpression: 2,
  repeatFatigueCap: 10,
  /** Repeated ignores reduce; this many in 30 days hides the person from this viewer. */
  ignorePenalty: 20,
  ignorePenaltyCap: 60,
  ignoresBeforeHide: 3,
  /** Diversity: each already-picked card sharing the same dominant category costs points. */
  diversityPerRepeat: 3,
  diversityCap: 9,
} as const;

export interface ScoringInterest { id: string; name: string; category: string; strength: InterestStrength }
export interface ScoringPrompt { promptId: string; prompt: string }
export interface ScoringPerson {
  userId: string;
  interests: ScoringInterest[];
  socialStyles: SocialStyle[];
  prompts: ScoringPrompt[];
  lastActiveAt: Date | null;
  createdAt: Date;
}
export interface ScoringHistory { ignores30d: number; impressions7d: number }
export interface ScoredCandidate {
  userId: string;
  base: number;
  components: DiscoveryReason[];
  sharedInterests: ScoringInterest[];
  dominantCategory: string | null;
  hidden: boolean;
}

const STYLE_TEXT: Record<SocialStyle, string> = {
  small_group: "small groups",
  one_to_one: "one-to-one conversations",
  text_first: "text-first chats",
  voice_first: "voice-first chats",
  low_pressure: "a low-pressure pace",
};

const DAY_MS = 86_400_000;

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function component(code: DiscoveryReasonCode, text: string, points: number): DiscoveryReason { return { code, text, points }; }

export function scoreCandidate(viewer: ScoringPerson, candidate: ScoringPerson, history: ScoringHistory, now: Date): ScoredCandidate {
  const components: DiscoveryReason[] = [];

  // Shared interests (strong). Strongest pairs first so the sentence names what matters most.
  const mine = new Map(viewer.interests.map((i) => [i.id, i]));
  const shared = candidate.interests
    .filter((i) => mine.has(i.id))
    .map((i) => ({ interest: i, points: WEIGHTS.sharedInterestBase + i.strength + mine.get(i.id)!.strength }))
    .sort((a, b) => b.points - a.points || a.interest.name.localeCompare(b.interest.name));
  if (shared.length > 0) {
    const raw = shared.reduce((sum, s) => sum + s.points, 0);
    const names = shared.slice(0, 3).map((s) => s.interest.name);
    const phrase = shared.length > 3 ? `${names.join(", ")} and ${shared.length - 3} more` : listNames(names);
    components.push(component("shared_interests", `You both like ${phrase}`, Math.min(raw, WEIGHTS.sharedInterestCap)));
  }

  // Related categories (moderate): same category on both sides, but no shared interest inside it.
  const sharedCategories = new Set(shared.map((s) => s.interest.category));
  const viewerCategories = new Set(viewer.interests.map((i) => i.category));
  const related = [...new Set(candidate.interests.map((i) => i.category))].filter((c) => viewerCategories.has(c) && !sharedCategories.has(c)).sort();
  if (related.length > 0) {
    components.push(component("related_interests", `You are both into ${listNames(related.slice(0, 2))}`, Math.min(related.length * WEIGHTS.relatedCategory, WEIGHTS.relatedCategoryCap)));
  }

  // Social style (moderate).
  const myStyles = new Set(viewer.socialStyles);
  const sharedStyles = candidate.socialStyles.filter((s) => myStyles.has(s)).sort();
  if (sharedStyles.length > 0) {
    components.push(component("shared_styles", `You both enjoy ${listNames(sharedStyles.slice(0, 2).map((s) => STYLE_TEXT[s]))}`, Math.min(sharedStyles.length * WEIGHTS.sharedStyle, WEIGHTS.sharedStyleCap)));
  }

  // Prompts (moderate): both chose to answer the same question, a natural conversation opener.
  const myPrompts = new Map(viewer.prompts.map((p) => [p.promptId, p.prompt]));
  const sharedPrompts = candidate.prompts.filter((p) => myPrompts.has(p.promptId)).sort((a, b) => a.promptId.localeCompare(b.promptId));
  if (sharedPrompts.length > 0) {
    components.push(component("shared_prompts", `You both answered "${sharedPrompts[0]!.prompt}"`, Math.min(sharedPrompts.length * WEIGHTS.sharedPrompt, WEIGHTS.sharedPromptCap)));
  }

  // Recency (small boost).
  if (candidate.lastActiveAt) {
    const age = now.getTime() - candidate.lastActiveAt.getTime();
    if (age <= DAY_MS) components.push(component("recently_active", "Active today", WEIGHTS.activeWithin1d));
    else if (age <= 3 * DAY_MS) components.push(component("recently_active", "Active in the last few days", WEIGHTS.activeWithin3d));
    else if (age <= 7 * DAY_MS) components.push(component("recently_active", "Active this week", WEIGHTS.activeWithin7d));
    else if (age <= 30 * DAY_MS) components.push(component("recently_active", "Active this month", WEIGHTS.activeWithin30d));
  }
  if (now.getTime() - candidate.createdAt.getTime() <= WEIGHTS.newMemberDays * DAY_MS) components.push(component("new_member", "New to the app", WEIGHTS.newMember));

  // Freshness and negative signals.
  if (history.impressions7d > 1) {
    const penalty = Math.min((history.impressions7d - 1) * WEIGHTS.repeatFatiguePerImpression, WEIGHTS.repeatFatigueCap);
    components.push(component("repeat_fatigue", `Seen ${history.impressions7d} times this week`, -penalty));
  }
  if (history.ignores30d > 0) {
    components.push(component("ignored_before", `Skipped ${history.ignores30d} time(s) in the last 30 days`, -Math.min(history.ignores30d * WEIGHTS.ignorePenalty, WEIGHTS.ignorePenaltyCap)));
  }

  const hasContentReason = components.some((c) => ["shared_interests", "related_interests", "shared_styles", "shared_prompts"].includes(c.code));
  if (!hasContentReason) components.push(component("fallback", "A chance to meet someone outside your usual interests", 0));

  // Dominant category = where the shared interests are strongest (used by the diversity rule).
  const categoryPoints = new Map<string, number>();
  for (const s of shared) categoryPoints.set(s.interest.category, (categoryPoints.get(s.interest.category) ?? 0) + s.points);
  const dominantCategory = [...categoryPoints.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  return {
    userId: candidate.userId,
    base: components.reduce((sum, c) => sum + c.points, 0),
    components,
    sharedInterests: shared.map((s) => s.interest),
    dominantCategory,
    hidden: history.ignores30d >= WEIGHTS.ignoresBeforeHide,
  };
}

export interface RankedCandidate extends ScoredCandidate { score: number }

export interface RankInput { scored: ScoredCandidate; lastActiveAt: Date | null }

function compareStable(a: { score: number; lastActiveAt: Date | null; userId: string }, b: { score: number; lastActiveAt: Date | null; userId: string }): number {
  if (b.score !== a.score) return b.score - a.score;
  const at = a.lastActiveAt?.getTime() ?? -1;
  const bt = b.lastActiveAt?.getTime() ?? -1;
  if (bt !== at) return bt - at;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/**
 * Greedy diversity re-rank: repeatedly pick the best remaining candidate after subtracting a penalty for every
 * already-picked card with the same dominant category. Ties break on recency then user id, so the order is stable.
 * Only the first `take` positions are produced (callers page with offset + limit + 1).
 */
export function rankCandidates(inputs: RankInput[], take: number): RankedCandidate[] {
  const pool = inputs.filter((i) => !i.scored.hidden).map((i) => ({ ...i, score: i.scored.base, userId: i.scored.userId }));
  const picked: RankedCandidate[] = [];
  const categoryCounts = new Map<string, number>();
  while (picked.length < take && pool.length > 0) {
    let bestIndex = 0;
    let bestAdjusted = { score: Number.NEGATIVE_INFINITY, lastActiveAt: null as Date | null, userId: "" };
    pool.forEach((entry, index) => {
      const cat = entry.scored.dominantCategory;
      const penalty = cat ? Math.min((categoryCounts.get(cat) ?? 0) * WEIGHTS.diversityPerRepeat, WEIGHTS.diversityCap) : 0;
      const adjusted = { score: entry.scored.base - penalty, lastActiveAt: entry.lastActiveAt, userId: entry.userId };
      if (index === 0 || compareStable(adjusted, bestAdjusted) < 0) { bestIndex = index; bestAdjusted = adjusted; }
    });
    const [chosen] = pool.splice(bestIndex, 1);
    const cat = chosen!.scored.dominantCategory;
    const penalty = cat ? Math.min((categoryCounts.get(cat) ?? 0) * WEIGHTS.diversityPerRepeat, WEIGHTS.diversityCap) : 0;
    const components = penalty > 0 ? [...chosen!.scored.components, component("diversity", "Moved down to keep your feed varied", -penalty)] : chosen!.scored.components;
    picked.push({ ...chosen!.scored, components, score: chosen!.scored.base - penalty });
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }
  return picked;
}

/** Positive components only, strongest first. Guaranteed non-empty (every candidate gets at least the fallback reason). */
export function visibleReasons(components: DiscoveryReason[]): DiscoveryReason[] {
  const positive = components.filter((c) => c.points > 0).sort((a, b) => b.points - a.points || a.code.localeCompare(b.code));
  if (positive.length > 0) return positive;
  const fallback = components.find((c) => c.code === "fallback");
  return fallback ? [fallback] : [component("fallback", "A chance to meet someone new", 0)];
}
