import assert from "node:assert/strict";
import { test } from "node:test";
import { dark, light, type ColorTokens } from "./index.ts";

function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

// [foreground, background, minimum ratio]. 4.5 = WCAG AA text, 3 = non-text/large.
const pairs: [keyof ColorTokens, keyof ColorTokens, number][] = [
  ["text", "bg", 4.5], ["text", "surface", 4.5], ["text2", "surface", 4.5], ["textMuted", "bg", 4.5], ["textMuted", "surface", 4.5], ["textMuted", "surfaceSunken", 4.5],
  ["accent", "bg", 4.5], ["accent", "surface", 4.5], ["accent", "accentSoft", 4.5], ["onAccent", "accent", 4.5], ["onAccent", "accentHover", 4.5],
  ["danger", "surface", 4.5], ["danger", "dangerSoft", 4.5], ["success", "surface", 4.5], ["success", "successSoft", 4.5], ["warning", "warningSoft", 4.5],
  ["focus", "bg", 3], ["focus", "surface", 3], ["lineStrong", "surface", 3],
];
for (const [name, theme] of [["light", light], ["dark", dark]] as const) {
  test(`${name} theme meets WCAG contrast`, () => {
    for (const [fg, bg, min] of pairs) {
      const r = ratio(theme[fg], theme[bg]);
      assert.ok(r >= min, `${name}: ${fg} on ${bg} = ${r.toFixed(2)} (< ${min})`);
    }
  });
}
