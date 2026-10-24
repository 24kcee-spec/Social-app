# Sidle web — ten-phase hardening pass

Date: 24 October 2026

This pass continues from commit `8e426fb212207f557055abce4ff47fcdd54871e2`. It is intentionally web-first and release-focused. It does not add speculative social features, change Supabase credentials, weaken existing safety rules or claim physical-device evidence that has not been collected.

## Phase 1 — Stable direct-entry URLs

Added stable entry aliases for Discover, Connections, Messages, Community, Profile, Profile editing and the main Settings sections. They redirect into the existing URL-backed shell state, preserving the current architecture while allowing bookmarks, refreshes, PWA shortcuts and external navigation to use readable destinations.

## Phase 2 — Password recovery correctness

Aligned the reset UI with the shared auth contract: 8-character minimum, 72-byte maximum, confirmation entry, mismatch feedback, disabled busy state and accessible recovery status. This closes the previous 6-vs-8-character inconsistency.

## Phase 3 — Help and safety center

Added a real `/help` destination with guidance for privacy, reporting/blocking, sessions and sensitive information. Settings links to it. The page deliberately does not invent a support email, moderation SLA or emergency service that has not been staffed.

## Phase 4 — Saved profile preview completeness

Expanded the read-only profile view with secondary saved photos, profile-readiness guidance, interest/prompt/style coverage and a clear explanation of the privacy boundary. Academic-email proof is labelled as email ownership rather than identity or enrollment verification.

## Phase 5 — Messaging resilience

Added per-conversation session drafts, explicit Realtime connection wording, load-older busy state, retry for failed idempotent sends, semantic conversation search and clearer unread/current-conversation accessibility. A Realtime connection is never described as the other member being online.

## Phase 6 — Privacy draft and block-state clarity

Privacy now visibly distinguishes unsaved drafts from active settings, clears stale success notices when editing, explains block/unblock consequences and exposes blocked-account loading/count state more clearly.

## Phase 7 — Notification delivery honesty

Notification categories and provider status now load together. The screen distinguishes saved preferences from actual mobile push delivery and explicitly states that browser push and connection-request push are not implemented.

## Phase 8 — Shell lifecycle and responsive state polish

The active screen updates the browser title, browser offline/online transitions are announced accessibly, and the new help/profile/privacy/messaging states have small-screen and forced-colour styling.

## Phase 9 — Web platform hardening

Added baseline response headers (`nosniff`, frame denial, strict referrer policy, disabled unused camera/microphone/geolocation permissions and same-site resource policy), removed the framework-powered header, added PWA shortcuts, robots exclusions for recovery/private entry routes, and branded error/not-found recovery screens.

A restrictive CSP was not added in this pass because Next.js runtime scripts plus the existing Supabase/API integrations require a deliberate nonce/source design. Adding a guessed CSP would risk breaking authentication or hydration.

## Phase 10 — Migration and release regression gates

`pnpm verify` now checks that SQL migrations are contiguous, non-empty and do not contain obvious embedded database/service credentials before running workspace typechecks/tests. Web release-contract tests cover the new routes, password-reset contract, help/recovery surfaces, profile privacy wording, message draft/retry behavior, notification honesty, lifecycle behavior and baseline security headers. GitHub verification has read-only repository permissions, stale-run cancellation and a job timeout.

## Migration decision

No new database migration is required for these phases. The current live project already records migrations `0001` through `0015` as applied, and every change in this pass uses existing profile, privacy, messaging, notification and account contracts. Creating a schema change solely to satisfy the existence of a migration would add unnecessary production risk.

The new migration-order check is preventative: if a future persisted feature genuinely needs `0016`, verification will require it to follow the existing sequence without gaps.

## Evidence boundary

This pass must not be described as complete until the exact branch head passes:

1. `pnpm verify` in GitHub Actions, including migration and web contract tests.
2. `pnpm --filter @sp/web build` in GitHub Actions.
3. Vercel preview build for the exact commit.
4. HTTP check of the preview.
5. Fast-forward/merge of that exact tested commit to `main`.
6. Production Vercel deployment from `main` and live alias HTTP check.

Physical Android, screen-reader/browser hands-on testing, transactional email delivery, provider backup/PITR and real phone push remain separate external gates documented in `docs/status.md`.
