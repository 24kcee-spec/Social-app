import { describe, expect, it } from "vitest";
import { rankCandidates, scoreCandidate, visibleReasons, WEIGHTS, type ScoringInterest, type ScoringPerson } from "../src/discovery/scoring";

const NOW = new Date("2026-10-02T12:00:00.000Z");
const HOURS = 3_600_000;
const DAYS = 24 * HOURS;
const OLD = new Date("2026-01-01T00:00:00.000Z");

const I = (id: string, name: string, category: string, strength: 1 | 2 | 3 = 2): ScoringInterest => ({ id, name, category, strength });
function person(userId: string, over: Partial<ScoringPerson> = {}): ScoringPerson {
  return { userId, interests: [], socialStyles: [], prompts: [], lastActiveAt: null, createdAt: OLD, ...over };
}
const none = { ignores30d: 0, impressions7d: 0 };
const codes = (s: { components: { code: string }[] }) => s.components.map((c) => c.code);
const points = (s: { components: { code: string; points: number }[] }, code: string) => s.components.find((c) => c.code === code)?.points;

describe("scoreCandidate: overlap weights", () => {
  it("scores each shared interest as base + both strengths, and names it in the reason", () => {
    const v = person("v", { interests: [I("f", "Football", "Sports", 3)] });
    const c = person("c", { interests: [I("f", "Football", "Sports", 3)] });
    const s = scoreCandidate(v, c, none, NOW);
    expect(points(s, "shared_interests")).toBe(WEIGHTS.sharedInterestBase + 3 + 3);
    expect(s.components.find((x) => x.code === "shared_interests")?.text).toBe("You both like Football");
  });

  it("weights strong interests above weak ones", () => {
    const v = person("v", { interests: [I("f", "Football", "Sports", 3)] });
    const strong = scoreCandidate(v, person("c", { interests: [I("f", "Football", "Sports", 3)] }), none, NOW);
    const weak = scoreCandidate(v, person("c", { interests: [I("f", "Football", "Sports", 1)] }), none, NOW);
    expect(points(strong, "shared_interests")).toBe(12);
    expect(points(weak, "shared_interests")).toBe(10);
  });

  it("caps the shared-interest component and lists at most three names plus a count", () => {
    const list = ["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => I(x, x.toUpperCase(), "Cat" + x, 3));
    const s = scoreCandidate(person("v", { interests: list }), person("c", { interests: list }), none, NOW);
    expect(points(s, "shared_interests")).toBe(WEIGHTS.sharedInterestCap);
    expect(s.components.find((x) => x.code === "shared_interests")?.text).toBe("You both like A, B, C and 5 more");
  });

  it("gives a small related-category score only where no interest is actually shared in that category", () => {
    const v = person("v", { interests: [I("f", "Football", "Sports"), I("m", "Afrobeats", "Music")] });
    const c = person("c", { interests: [I("f", "Football", "Sports"), I("h", "Hip Hop", "Music"), I("t", "Travel", "Travel")] });
    const s = scoreCandidate(v, c, none, NOW);
    expect(points(s, "related_interests")).toBe(WEIGHTS.relatedCategory);
    expect(s.components.find((x) => x.code === "related_interests")?.text).toBe("You are both into Music");
  });

  it("scores shared social styles and caps them", () => {
    const styles = ["small_group", "one_to_one", "text_first", "voice_first"] as const;
    const one = scoreCandidate(person("v", { socialStyles: ["low_pressure"] }), person("c", { socialStyles: ["low_pressure"] }), none, NOW);
    expect(points(one, "shared_styles")).toBe(5);
    const many = scoreCandidate(person("v", { socialStyles: [...styles] }), person("c", { socialStyles: [...styles] }), none, NOW);
    expect(points(many, "shared_styles")).toBe(WEIGHTS.sharedStyleCap);
  });

  it("scores prompts both people answered", () => {
    const p = { promptId: "weekend", prompt: "My ideal weekend looks like..." };
    const s = scoreCandidate(person("v", { prompts: [p] }), person("c", { prompts: [p] }), none, NOW);
    expect(points(s, "shared_prompts")).toBe(WEIGHTS.sharedPrompt);
    expect(s.components.find((x) => x.code === "shared_prompts")?.text).toContain("My ideal weekend looks like...");
  });
});

describe("scoreCandidate: recency, freshness and negatives", () => {
  const at = (ms: number) => scoreCandidate(person("v"), person("c", { lastActiveAt: new Date(NOW.getTime() - ms) }), none, NOW);
  it("boosts recent activity in tiers", () => {
    expect(points(at(2 * HOURS), "recently_active")).toBe(6);
    expect(points(at(2 * DAYS), "recently_active")).toBe(4);
    expect(points(at(5 * DAYS), "recently_active")).toBe(2);
    expect(points(at(20 * DAYS), "recently_active")).toBe(1);
    expect(points(at(90 * DAYS), "recently_active")).toBeUndefined();
    expect(points(scoreCandidate(person("v"), person("c"), none, NOW), "recently_active")).toBeUndefined();
  });

  it("boosts new members for two weeks only", () => {
    const fresh = scoreCandidate(person("v"), person("c", { createdAt: new Date(NOW.getTime() - 3 * DAYS) }), none, NOW);
    const stale = scoreCandidate(person("v"), person("c", { createdAt: new Date(NOW.getTime() - 30 * DAYS) }), none, NOW);
    expect(points(fresh, "new_member")).toBe(WEIGHTS.newMember);
    expect(points(stale, "new_member")).toBeUndefined();
  });

  it("reduces the score for repeat impressions (first view is free, penalty is capped)", () => {
    const run = (n: number) => scoreCandidate(person("v"), person("c"), { ignores30d: 0, impressions7d: n }, NOW);
    expect(points(run(1), "repeat_fatigue")).toBeUndefined();
    expect(points(run(4), "repeat_fatigue")).toBe(-6);
    expect(points(run(50), "repeat_fatigue")).toBe(-WEIGHTS.repeatFatigueCap);
  });

  it("reduces the score for ignores and hides the person after three", () => {
    const run = (n: number) => scoreCandidate(person("v"), person("c"), { ignores30d: n, impressions7d: 0 }, NOW);
    expect(points(run(1), "ignored_before")).toBe(-20);
    expect(run(2).hidden).toBe(false);
    expect(run(3).hidden).toBe(true);
    expect(points(run(9), "ignored_before")).toBe(-WEIGHTS.ignorePenaltyCap);
  });

  it("always gives an honest fallback reason when nothing is in common", () => {
    const s = scoreCandidate(person("v", { interests: [I("a", "A", "X")] }), person("c", { interests: [I("b", "B", "Y")] }), none, NOW);
    expect(codes(s)).toEqual(["fallback"]);
    expect(visibleReasons(s.components)).toHaveLength(1);
    expect(visibleReasons(s.components)[0]?.text).toMatch(/outside your usual interests/);
  });

  it("never shows negative components as reasons, strongest positive first", () => {
    const v = person("v", { interests: [I("f", "Football", "Sports", 3)], socialStyles: ["low_pressure"] });
    const c = person("c", { interests: [I("f", "Football", "Sports", 3)], socialStyles: ["low_pressure"], lastActiveAt: new Date(NOW.getTime() - HOURS) });
    const s = scoreCandidate(v, c, { ignores30d: 1, impressions7d: 3 }, NOW);
    const shown = visibleReasons(s.components);
    expect(shown.every((r) => r.points > 0)).toBe(true);
    expect(shown.map((r) => r.code)).toEqual(["shared_interests", "recently_active", "shared_styles"]);
  });
});

describe("rankCandidates: deterministic order", () => {
  const viewer = person("v", { interests: [I("f", "Football", "Sports", 2), I("g", "Gaming", "Gaming", 2)] });
  const make = (id: string, interests: ScoringInterest[], lastActive: number | null = null, history = none) => {
    const c = person(id, { interests, lastActiveAt: lastActive === null ? null : new Date(NOW.getTime() - lastActive) });
    return { scored: scoreCandidate(viewer, c, history, NOW), lastActiveAt: c.lastActiveAt };
  };

  it("orders by score, highest first", () => {
    const ranked = rankCandidates([
      make("low", [I("x", "X", "Z")]),
      make("high", [I("f", "Football", "Sports", 2), I("g", "Gaming", "Gaming", 2)]),
      make("mid", [I("f", "Football", "Sports", 2)]),
    ], 10);
    expect(ranked.map((r) => r.userId)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties by recent activity, then by user id, and is repeatable", () => {
    const inputs = () => [
      make("c-id", [I("f", "Football", "Sports")], 5 * DAYS),
      make("b-id", [I("f", "Football", "Sports")], 5 * DAYS),
      make("a-id", [I("f", "Football", "Sports")], 6 * DAYS),
    ];
    const first = rankCandidates(inputs(), 10).map((r) => r.userId);
    expect(first).toEqual(["b-id", "c-id", "a-id"]);
    expect(rankCandidates(inputs().reverse(), 10).map((r) => r.userId)).toEqual(first);
  });

  it("drops people the viewer has ignored repeatedly", () => {
    const ranked = rankCandidates([make("gone", [I("f", "Football", "Sports")], null, { ignores30d: 3, impressions7d: 0 }), make("kept", [I("g", "Gaming", "Gaming")])], 10);
    expect(ranked.map((r) => r.userId)).toEqual(["kept"]);
  });

  it("keeps the feed varied: repeated dominant categories sink slightly below a different category", () => {
    const ranked = rankCandidates([
      make("s1", [I("f", "Football", "Sports", 3)]),
      make("s2", [I("f", "Football", "Sports", 3)]),
      make("s3", [I("f", "Football", "Sports", 2)]),
      make("gm", [I("g", "Gaming", "Gaming", 2)]),
    ], 10);
    // Base: s1=12, s2=12, s3=10, gm=10. After s1 is picked every Sports card pays 3, so gm (10) beats s2 (9).
    expect(ranked.map((r) => r.userId)).toEqual(["s1", "gm", "s2", "s3"]);
    expect(ranked[3]?.components.some((c) => c.code === "diversity")).toBe(true);
    expect(ranked[3]?.score).toBe(4);
  });

  it("only produces the requested number of positions", () => {
    expect(rankCandidates([make("a", []), make("b", []), make("c", [])], 2)).toHaveLength(2);
  });
});
