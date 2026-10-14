# Design system (as implemented in Stage B)

Source of truth: `packages/design-tokens/src/index.ts`. Web consumes generated `apps/web/app/tokens.css`; mobile imports through `apps/mobile/src/theme`. Nothing here is aspirational: items not yet adopted by screens are listed under **Not yet adopted**.

## Principles
Calm, editorial, low-pressure. Borders before shadows. One accent. Status is never colour-only. System fonts only (no webfont downloads).

## Colour (light / dark)
Warm neutrals + cobalt accent. Dark values are generated into `tokens.css` and follow `prefers-color-scheme` (override with `data-theme="light|dark"` on `<html>`). Mobile is light-only until Stage D.

| Token | Light | Dark | Use |
|---|---|---|---|
| bg / surface / surface-sunken | #F7F6F2 / #FFFFFF / #F0EEE8 | #0F1217 / #171B22 / #1D222A | page / cards, inputs / wells, chips |
| text / text-2 / text-muted | #14181F / #3D4551 / #59626E | #EEF0F3 / #C6CBD3 / #9AA3AF | primary / secondary / hints |
| line / line-strong | #E2DFD6 / #8A867A | #2A303A / #657085 | dividers / control borders (3:1) |
| accent / accent-hover / accent-soft / accent-line / on-accent | #1F4FD8 / #1A41B0 / #E8EEFC / #A9BDF2 / #FFFFFF | #8CA9FF / #A5BCFF / #1B2744 / #34498C / #0B1020 | actions, selection |
| danger / success / warning (+ -soft) | #B42318 / #14694A / #7A4F00 | #FF9486 / #63D6A0 / #F0C060 | status |
| focus | #1F4FD8 | #8CA9FF | 3px focus ring |

Contrast is enforced by `pnpm --filter @sp/design-tokens test` (text 4.5:1, focus/control borders 3:1, both themes).

## Type
Scale (size/line): caption 12/16, small 14/20, body 16/24, title 20/28, heading 26/32, display 34/40. Sans = system UI stack. Display (h1/h2 on web) = system serif stack (Iowan Old Style / Palatino / Georgia).

## Space, radius, elevation, motion, touch
4pt grid (4…48). Radius sm 8, md 12, lg 16, pill 999. Elevation 1 (subtle) and 2 (overlays only). Motion 120/200 ms; `prefers-reduced-motion` disables animation globally on web. Minimum target 44px/dp.

## Implemented components
- **Web (CSS):** `button` (44px min, hover, `.secondary`, `.compact`, `.link`), inputs (44px min, 3:1 border), focus-visible ring on all interactive elements, `.card`, skip link (`#main`), landmarks (one `<main id="main">` per page).
- **Mobile (`src/ui`):** `Button` (44dp, busy/disabled state, a11y state), `Field` (label, error, a11y label), `Banner` (error/success/info with icon, live region). Used by `App.tsx` for auth, onboarding and profile screens.

## Not yet adopted (Stages C–E)
Web dialogs (focus trap, Escape), tabs semantics, cards for discovery/profile; mobile Sheet, Chip, Badge, Avatar, Skeleton, EmptyState, bottom tabs, dark scheme. Web still has legacy variable aliases (`--fg`, `--muted`, `--card`, `--err`, `--ok`, `--shadow`) and inline hex colours in `share-modal.tsx`, `report-modal.tsx`, `discover.tsx` and others. Stage C removes them.
