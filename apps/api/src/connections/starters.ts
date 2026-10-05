/**
 * Conversation starters are deterministic: the same two people always get the same suggestions, and the server
 * (not the client) renders the final sentence, so a request can never carry text the catalog did not produce.
 */

/** FNV-1a 32-bit. Stable across runtimes; used only to pick between equally good options. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Picks `count` distinct items starting at a seed-determined offset, wrapping around, in catalog order from there. */
export function pickDeterministic<T>(items: readonly T[], seed: string, count: number): T[] {
  if (items.length === 0 || count <= 0) return [];
  const start = hashSeed(seed) % items.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, items.length); i++) out.push(items[(start + i) % items.length]!);
  return out;
}

const TEMPLATES: Record<string, string[]> = {
  Sports: ["What got you into {name}?", "How often do you get to enjoy {name}?"],
  Gaming: ["What are you into most in {name} right now?", "How did you first get into {name}?"],
  Music: ["What is your favourite thing about {name} at the moment?", "Who or what should I listen to in {name}?"],
  Anime: ["What is the best thing you have come across in {name} lately?", "Where would you start someone new to {name}?"],
  Study: ["How do you like to approach {name}?", "What is the most useful thing you have learned about {name}?"],
  Tech: ["What are you exploring in {name} these days?", "What got you curious about {name}?"],
  Creative: ["What are you working on in {name} lately?", "What do you love most about {name}?"],
  Food: ["What is the best thing you have made or tried in {name}?", "Any {name} favourite I should try?"],
  Travel: ["What is your best memory connected to {name}?", "What is next on your list for {name}?"],
  Entertainment: ["What is the best {name} pick you would recommend right now?", "What was the last {name} that really stuck with you?"],
  Learning: ["What is the best thing you have taken from {name} lately?", "Where would you start someone curious about {name}?"],
  Lifestyle: ["What do you enjoy most about {name}?", "How did {name} become part of your life?"],
  Community: ["What do you enjoy most about {name}?", "How did you get involved in {name}?"],
};
const GENERIC = ["What do you enjoy most about {name}?", "How did you get into {name}?"];

export function renderIcebreaker(interest: { name: string; category: string }, seed: string): string {
  const options = TEMPLATES[interest.category] ?? GENERIC;
  return options[hashSeed(seed) % options.length]!.replace("{name}", interest.name);
}

/** Sender's pick shown to the recipient, who can answer with the same choice or the other one. */
export function renderThisOrThat(optionA: string, optionB: string, choice: "a" | "b"): string {
  return `This or that: ${optionA} or ${optionB}? I'd pick ${choice === "a" ? optionA : optionB}. You?`;
}
