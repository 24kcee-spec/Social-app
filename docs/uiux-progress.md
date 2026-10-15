# UI/UX progress log

## Decisions
- Accent: **cobalt #1F4FD8** (replaces indigo #4f46e5). Warm neutrals; body gradient removed.
- Fonts: system stacks only (no next/font/webfont download; low-end/slow-network friendly).
- Tokens live in `@sp/design-tokens`; web via generated CSS, mobile via direct import. `colors` (not `c`) is the mobile import name because screens use `c` as a loop variable.
- CampusPulseRadar: omit from production UI (no backend). Reporting for people/messages is missing on web and mobile; add in C/D after confirming `/reports` targetType.

## Stage A: done (docs/uiux-audit.md)
## Stage B: done (rebased on main incl. Phase 13 files)
Files: packages/design-tokens/** (new), apps/mobile/src/components/*, apps/mobile/src/theme/tokens.ts, apps/web/app/{tokens.css,globals.css,layout.tsx,page.tsx,reset/page.tsx}, apps/mobile/{App.tsx,package.json}, apps/mobile/src/{theme/index.ts,ui/*,Community,Connections,Discover,Messages,SayHi}.tsx, DESIGN.md.
Also in B: LiquidSheet rebuilt on shared theme (keyboard, scroll, a11y, back button); theme/tokens.ts now re-exports the shared theme; UTF-8 BOMs stripped from 11 files; mojibake fixed in Phase 13 components.
Not done: EditorialCard and CampusPulseRadar are unchanged apart from encoding (neither is imported by any screen yet); Android safe-area insets need react-native-safe-area-context (add with `npx expo install`); dark scheme on mobile.
## Stage C1: done (Web UI Transformation: Shell, Auth, Discover)
Files: apps/web/app/globals.css, apps/web/app/page.tsx, apps/web/app/discover.tsx, apps/web/app/reset/page.tsx, apps/web/app/layout.tsx.
- Shell: Added sticky editorial header with brand monogram, responsive nav bar with badge counters for pending connections & unread messages, proper semantic landmarks (header, nav, main, footer).
- Auth: Redesigned sign-in, sign-up and reset forms with mode segmented switcher, clear visual hierarchy, accessible validation, and token styling.
- Discover: Redesigned candidate cards with prominent avatars, mutual-interest chips (cobalt highlighted vs neutral), match reason callouts ("✦"), expandable prompt quotes, integrated low-pressure openers (SayHi), and polite skip/block actions.
- Preserved: Supabase auth flows, real discovery feeds and impressions tracking, opener interactions, session management, and existing routes.

## Stage C2: done (Web UI Transformation: Connections, Messages, Community, Modals & Safety)
Files: apps/web/app/connections.tsx, apps/web/app/messages.tsx, apps/web/app/community.tsx, apps/web/app/report-modal.tsx, apps/web/app/share-modal.tsx, apps/web/app/globals.css.
- Connections: Editorial header, incoming request cards with intro quotes & accept/decline, active connections with message/remove, outgoing hellos with withdraw, low-pressure mode toggle card.
- Messages: Conversation list items with avatar, preview & unread badges, real-time thread with live connection status, message bubbles with cobalt accent & retry handling, composer.
- Community: Local space editorial header, area filtering, segmented tabs (Events / Groups), RSVP waitlist management, group/event creation, attendee rosters.
- Modals: ReportModal and ShareModal updated with accessible dialog semantics, Escape key handling, backdrop click-to-close, and design token conformance (removing old hardcoded indigo hex values).
- Globals CSS: Added supporting utility classes for avatars, card-actions, intro quotes, topbar, tabs, and modals.

## Stage D: done (Mobile UI Harmonization & Token Cleanup)
Files: apps/mobile/src/components/EditorialCard.tsx, apps/mobile/src/Discover.tsx.
- EditorialCard.tsx: Refactored to import `useTheme` and consume shared design tokens (`colors.surface`, `colors.line`, `colors.accent`, `colors.text`, etc.) instead of hardcoded hex values. Documented relationship with production `Discover.tsx`.
- CampusPulseRadar.tsx: Confirmed omitted from production UI (no backend, avoids fabricated social counts).

