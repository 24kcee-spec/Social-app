import { describe, expect, it } from "vitest";
import { hashSeed, pickDeterministic, renderIcebreaker, renderThisOrThat } from "../src/connections/starters";

describe("starters", () => {
  it("hashes deterministically", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
    expect(hashSeed("abc")).not.toBe(hashSeed("abd"));
    expect(hashSeed("")).toBe(0x811c9dc5);
  });

  it("picks distinct items deterministically, wrapping around, never more than exist", () => {
    const items = ["a", "b", "c", "d", "e"];
    const first = pickDeterministic(items, "seed-1", 2);
    expect(pickDeterministic(items, "seed-1", 2)).toEqual(first);
    expect(new Set(first).size).toBe(2);
    expect(pickDeterministic(items, "seed-1", 9)).toHaveLength(5);
    expect(pickDeterministic([], "x", 2)).toEqual([]);
    expect(pickDeterministic(items, "x", 0)).toEqual([]);
  });

  it("renders interest-based icebreakers from the category, with a safe generic fallback", () => {
    const sports = renderIcebreaker({ name: "Football", category: "Sports" }, "seed");
    expect(sports).toContain("Football");
    expect(sports.endsWith("?")).toBe(true);
    expect(renderIcebreaker({ name: "Football", category: "Sports" }, "seed")).toBe(sports);
    expect(renderIcebreaker({ name: "Chess", category: "Nonexistent" }, "seed")).toMatch(/Chess/);
    expect(renderIcebreaker({ name: "Chess", category: "Nonexistent" }, "seed")).not.toContain("{name}");
  });

  it("renders the this-or-that pick for either choice", () => {
    expect(renderThisOrThat("Coffee", "Tea", "a")).toBe("This or that: Coffee or Tea? I'd pick Coffee. You?");
    expect(renderThisOrThat("Coffee", "Tea", "b")).toBe("This or that: Coffee or Tea? I'd pick Tea. You?");
  });
});
