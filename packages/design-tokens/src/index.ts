/**
 * Single source of truth for visual decisions. Consumed by:
 *  - web: `pnpm --filter @sp/design-tokens build:css` emits apps/web/app/tokens.css
 *  - mobile: imported directly via apps/mobile/src/theme
 * Values are plain data (no platform APIs) so both platforms stay in sync.
 */

export type ColorTokens = {
  bg: string; surface: string; surfaceSunken: string;
  text: string; text2: string; textMuted: string;
  line: string; lineStrong: string;
  accent: string; accentHover: string; accentSoft: string; accentLine: string; onAccent: string;
  danger: string; dangerSoft: string; success: string; successSoft: string; warning: string; warningSoft: string;
  focus: string; overlay: string;
};

/** Cobalt accent on warm neutrals. Contrast pairs are asserted in tokens.test.ts. */
export const light: ColorTokens = {
  bg: "#F7F6F2", surface: "#FFFFFF", surfaceSunken: "#F0EEE8",
  text: "#14181F", text2: "#3D4551", textMuted: "#59626E",
  line: "#E2DFD6", lineStrong: "#8A867A",
  accent: "#1F4FD8", accentHover: "#1A41B0", accentSoft: "#E8EEFC", accentLine: "#A9BDF2", onAccent: "#FFFFFF",
  danger: "#B42318", dangerSoft: "#FDEEEC", success: "#14694A", successSoft: "#E6F4EC", warning: "#7A4F00", warningSoft: "#FCF3DC",
  focus: "#1F4FD8", overlay: "rgba(15,18,23,0.52)",
};

export const dark: ColorTokens = {
  bg: "#0F1217", surface: "#171B22", surfaceSunken: "#1D222A",
  text: "#EEF0F3", text2: "#C6CBD3", textMuted: "#9AA3AF",
  line: "#2A303A", lineStrong: "#657085",
  accent: "#8CA9FF", accentHover: "#A5BCFF", accentSoft: "#1B2744", accentLine: "#34498C", onAccent: "#0B1020",
  danger: "#FF9486", dangerSoft: "#3A1C19", success: "#63D6A0", successSoft: "#14291F", warning: "#F0C060", warningSoft: "#33280F",
  focus: "#8CA9FF", overlay: "rgba(0,0,0,0.64)",
};

/** 4pt grid. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Type scale: size / line-height in px (rn: dp). */
export const type = {
  caption: { size: 12, line: 16, weight: "600" },
  small: { size: 14, line: 20, weight: "400" },
  body: { size: 16, line: 24, weight: "400" },
  bodyStrong: { size: 16, line: 24, weight: "600" },
  title: { size: 20, line: 28, weight: "700" },
  heading: { size: 26, line: 32, weight: "700" },
  display: { size: 34, line: 40, weight: "700" },
} as const;

export const font = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  /** Editorial serif for headings. System fonts only: no webfont download on low-end/slow networks. */
  display: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
} as const;

/** Subtle depth: one border-first system, two shadow levels. */
export const elevation = {
  1: { css: "0 1px 2px rgba(20,24,31,.06)", rn: { shadowColor: "#14181F", shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 } },
  2: { css: "0 8px 24px rgba(20,24,31,.12)", rn: { shadowColor: "#14181F", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 } },
} as const;

export const motion = { fast: 120, base: 200 } as const;

/** Minimum interactive target (px on web, dp on mobile). */
export const touch = { min: 44 } as const;
