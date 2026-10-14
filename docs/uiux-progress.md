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
Open items for C: dialogs, tabs semantics, share-modal QR (third-party api.qrserver.com), inline hex, remove legacy CSS aliases.
