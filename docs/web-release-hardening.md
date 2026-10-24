# Sidle web release hardening — phases 1–3

Updated: 24 October 2026.

This pass continues the web-first release work after the settings/account accessibility pass. It intentionally leaves API contracts, Supabase schema, authentication behavior and mobile-native code unchanged.

## Phase 1 — shell navigation and focus semantics

- Adds a client shell accessibility controller loaded from the root layout.
- Corrects the rendered primary navigation from tab semantics to ordinary navigation semantics, using `aria-current="page"` for the active destination.
- Marks decorative navigation icons and numeric badges as hidden from assistive technology while giving Connections and Messages useful count-aware accessible names.
- Hooks History API `pushState` / `replaceState` and browser Back/Forward so SPA screen changes move focus to the new main destination (or a requested settings/profile section) and announce the opened screen through a polite live region.
- Leaves existing URL-backed navigation and unsaved-profile confirmation logic in control; the controller does not choose destinations or mutate application data.

## Phase 2 — responsive and interaction hardening

- Adds a consistent visible keyboard focus treatment without drawing outlines around programmatically focused main/section containers.
- Raises key shell/settings controls to touch-friendly target heights.
- Adds narrow-screen containment, safe-area-aware header padding, horizontal navigation scroll snapping and bounded account-menu scrolling.
- Adds high-contrast / forced-colour focus and selected-state treatment.
- Keeps the existing reduced-motion behavior from `shell-polish.css`.

## Phase 3 — regression and production-build gate

- Adds dependency-free Node tests for the web accessibility contract: skip-link target, shell controller installation, navigation semantics/focus restoration, responsive/high-contrast CSS and unsaved-draft `beforeunload` guards.
- Adds `@sp/web` to the workspace test run through its new `test` script.
- Extends GitHub Actions verification with an explicit Next.js production build after the full workspace verify step.

## Evidence boundary

Automated tests, TypeScript, GitHub Actions and the Vercel production build can verify the implementation and build contract. They do **not** replace a manual browser/screen-reader pass. The remaining human browser gate should still cover keyboard-only traversal in a signed-in two-account flow, screen-reader announcements, zoom/reflow at narrow widths, contrast in real browsers, theme persistence, and dirty-form leave confirmation.
