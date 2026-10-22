# Social-app — Repository Audit & Phased Build Roadmap

**Repository reviewed:** https://github.com/24kcee-spec/Social-app  
**Review date:** 22 October 2026  
**Scope:** Public repository documentation and source files reachable through GitHub's raw file views. The project could not be cloned in this environment, and I did not run the app, database migrations, tests, or device builds. Findings below distinguish directly inspected code from claims recorded in project documents.

## Executive verdict

Social-app is not an empty scaffold. It has a meaningful monorepo foundation: Next.js web, Expo/React Native mobile, a Fastify API, Supabase Auth/Postgres/Storage/Realtime integration, shared TypeScript packages, validation, SQL migrations, and domain modules for profile, discovery, connections, messaging, community, sharing and safety.

It is best described as a **feature-rich prototype / pilot-integration stage**, not yet a verified production-ready competitor to Instagram or TikTok. Your next move should not be “add everything Instagram has.” It should be: (1) secure the repo and close existing live-test gates, (2) make the account/profile/settings experience coherent, (3) prove the student connection loop works reliably, and (4) add a content feed only after the pilot demonstrates that students return and want one.

The product definition is unusually useful: it describes a low-pressure social platform for Bulawayo students to meet compatible people, groups and activities, particularly helping shy users start conversations. Preserve that differentiator rather than turning the MVP into a clone of every large social network.

## 0. Immediate security actions

1. **Revoke the GitHub personal access token that was pasted into chat.** Treat it as compromised. Create a replacement only if needed, give it the minimum repository permissions and expiration, store it in a password manager or secret store, and never paste it into prompts or source code.
2. **Decide whether the repository should be public.** The repository is publicly visible today. The checked-in `docs/BUILD-HANDOVER.md` says to make it private. If public access is not intentional, change repository visibility and review the GitHub audit log. Private visibility does not replace secret rotation.
3. Search the repository history and deployment logs for `.env` values, Supabase secret/service-role keys, signing secrets, database URLs, and push-provider credentials. Rotate any real secrets that were committed or otherwise exposed. `.env.example` should contain placeholders only.
4. Fix the remote PostgreSQL TLS configuration before inviting real users. `docs/decisions.md` explicitly records `rejectUnauthorized=false` for remote database TLS as a temporary pilot compromise to revisit before public launch. Use the provider CA / correct certificate chain and validate it.
5. Fix startup/readiness semantics. `apps/api/src/server.ts` registers product routes only when both `DATABASE_URL` and `SUPABASE_URL` are configured; otherwise it logs a warning and skips route registration. The current `/ready` handler determines readiness by checking whether every *registered* check passed; an empty check set passes vacuously. In a production configuration, missing required config could therefore produce a misleading readiness result. Add explicit configuration checks and fail startup or readiness when required settings/routes are unavailable.

## 1. What is already present in the inspected code

| Area | What exists in the repository | Assessment |
|---|---|---|
| Architecture | pnpm monorepo; `apps/web`, `apps/mobile`, `apps/api`; shared `@sp/types`, `@sp/validation`, `@sp/auth-client`, `@sp/profile-client`, config | Good foundation; preserve and improve it rather than replacing the stack |
| Authentication | Sign-in, sign-up, forgot-password UI; Supabase-backed auth client; API token verification; `/me` and session flows; sign-out and session revocation | Core flows are represented. Run live tests for email verification, reset links, expiry, error states, and provider/session revocation limits |
| Onboarding | Display name, bio, connection style, privacy, selected interests, conversation prompts; onboarding completion gates some actions | A coherent starting point for a student product |
| Profile editor | Personal details, interests, prompts, photos, privacy, active device sessions, account deletion/anonymization action | Valuable profile controls exist, but are crowded into one editor instead of organized account settings |
| Discovery | Paginated people discovery, style filter, profile-photo URL loading, impression recording, share/report/block interaction hooks | Basic discovery foundation exists. Verify compatibility score explanations, ranking quality, filtering and empty states with real users |
| Connections | Incoming/outgoing connection requests, accepted connections, low-pressure preference, starting messages from a connection | Core relationship model exists; test request spam, block interactions and state synchronization |
| Messaging | Direct conversations, message pagination, realtime subscription on web/mobile, read watermark/read receipts, idempotent client tags, notification preferences, server rate limits | Strong baseline for text chat. Messages are stored as normal database body values; no end-to-end encryption implementation was found in the inspected message store |
| Community | Groups, events, activities, member roles, RSVPs, group/event discussion, sharing and reporting interfaces | Core student-community direction is represented; documented live gate still needs to pass |
| Safety | Block/report, report review/actions, role-gated moderation paths, account anonymization/deletion UI, rate limits in important user flows | Good foundation; do not treat the presence of handlers as proof of operational moderation readiness |
| Sharing | Share helpers and share modal code for profiles / groups / events; share route registration | Good distribution feature; verify signed-out, expired, and malformed links |
| Design | Web design tokens and branded gradients; responsive-looking card layouts; mobile theme preference with System/Light/Dark choices | There is a visual language to build on, but settings/navigation and UI parity need more structure |
| Quality | Typecheck/test commands and API-focused tests are documented | The handover *claims* 329 passing tests, but this audit did not execute tests or verify the count |

## 2. High-priority gaps and defects found in inspected source

### P0 — Finish before a real student pilot

- **Live readiness gate is still open in the handover.** `docs/BUILD-HANDOVER.md` says the next milestone is to apply the community migration and complete a two-account group/event/RSVP/chat test; it also says mobile/Android testing was deferred. Complete and record this before building more features.
- **Push notifications do not actually send.** `apps/api/src/server.ts` injects `noopPushSender`; `apps/api/src/messaging/notify.ts` explicitly defines it as a no-op until real provider credentials are configured. In-app/unread indicators are not the same as working push notifications.
- **Readiness/configuration handling can be misleading.** Required product routes are conditional on env configuration, but `/ready` can be ready when no dependency checks are registered. Correct this and test all combinations of missing/present configuration.
- **Remote database certificate validation is disabled by a documented decision.** Fix before a broader public launch.
- **Pilot eligibility is undecided.** `docs/product-definition.md` proposes an invite-only NUST pilot and suggests university email or invite code; `docs/decisions.md` still has D-007 open. Decide, document and test the policy before launch.
- **Product docs contradict each other about events.** The product definition includes groups/activities in the MVP but also lists “events” among features deferred to a later backlog, while implementation and handover material already discuss community events and RSVPs. Update one canonical roadmap after the live gate passes.

### P1 — Settings/profile UX, your main request

- **The web avatar/name chip is not a settings control.** In `apps/web/app/page.tsx`, the top navigation has a Profile tab, while the `user-badge-chip` around the avatar/name is a non-clickable `div`. The header exposes a separate Sign out button. That is why the familiar “tap my avatar to open account options” experience is missing.
- **Profile editing and account settings are blended together.** The web Profile tab contains a preview plus identity, interests, prompts, photos, privacy, active devices, and account deletion. Users need a separate “View profile” experience and a structured “Settings” hub.
- **Settings are scattered.** Message notification preferences are in the Messages screen, appearance preference is found in the mobile profile/editor area, and privacy/security actions live inside profile editing. Create a single settings index with stable sections and clear names.
- **Feature parity is incomplete or at least unverified.** Mobile has a theme preference control; I did not find a matching web appearance control in the inspected `page.tsx`. The inspected mobile root also did not show a matching account deletion control. Audit each setting on web and mobile and decide whether it should be shared, platform-specific, or intentionally absent.
- **The “quick vibe”/mood selector is temporary local state.** `moodStatus` starts with a default, changes in the UI, appears in the profile preview, but is not included in the profile save call. It will not behave like a persistent status unless it is added to the domain model/API and saved explicitly. If it is only a mock preview, label it as such or remove it until wired up.
- **A preview button is dead.** The “Say hi” button inside the web profile preview is rendered without an `onClick` handler. Either wire it to a real action in a context where saying hi makes sense or make the preview clearly non-interactive.
- **Some interactive elements are implemented as generic `div`s.** For example, the clickable brand group and choice-set tiles do not use native buttons/links. Keyboard operation and assistive technology support should be reviewed; use semantic controls and visible focus states.
- **Tab navigation is state-only.** The main views are selected with local React state rather than distinct URLs for each major screen. Refresh, browser back/forward, deep linking, and direct links into settings are harder than they should be. Move top-level screens to proper routes or maintain URL state intentionally.

### P1 — Trust and safety wording

- The web Messages subtitle says “end-to-end authenticated conversations.” “Authenticated” does **not** mean end-to-end encrypted. The inspected API store reads and writes message bodies as ordinary database fields. Do not promise end-to-end encryption unless the client-side cryptographic design, key management, and end-to-end tests actually exist. Use accurate wording now; make E2EE a separate, carefully designed project if it is required.
- The delete-account card says the operation anonymizes the account and removes specific user data. Confirm exactly what is deleted, anonymized, retained for abuse prevention/legal obligations, and backed up. Make the product label match actual behavior and show the user a concise confirmation of what changes.
- A “last active”/“active now” label is shown in the inspected profile preview without a live presence value. Do not show presence as fact unless it is powered by real presence data and the user can control it. Otherwise remove it or label it as a preview.

### P2 — Maintainability

- `apps/web/app/page.tsx` and `apps/mobile/App.tsx` are each roughly 1,300 lines and contain multiple screens, data loading, editing state, navigation, and action handlers. This encourages regressions when a broad AI edit touches an entire file.
- Extract components and feature modules one at a time. Keep business rules/API operations in shared clients/domain modules; UI components should render state and issue clearly scoped actions.
- Create a per-feature test matrix and smoke scripts for web/mobile. Do not rely on a passing TypeScript check alone for runtime behavior.

## 3. Recommended settings/navigation structure

### Avatar/account menu

Make the avatar + display name a real button with an accessible label, keyboard support, focus behavior, escape-to-close, and click-outside behavior. Clicking it opens a compact menu:

1. **View my profile** — a read-only preview of what other members see.
2. **Edit profile** — profile photos, bio, interests, conversation prompts, connection style and campus information.
3. **Account settings** — login identity, email/phone status, password/reset entry point, active sessions, account deletion/export, sign out.
4. **Privacy & safety** — discoverability, message/connection permissions, blocked users, data controls, reports/help.
5. **Notifications** — in-app and push preferences by category.
6. **Appearance & accessibility** — System/Light/Dark theme, motion/contrast/font preferences where supported.
7. **Help & feedback** — community rules, safety guidance, support contact, report a problem, app version.

Avoid making the menu contain every setting. It is an entry point; the actual sections should be dedicated screens/routes.

### Suggested route map for web

- `/discover`
- `/connections`
- `/messages`
- `/community`
- `/u/[handle-or-id]` (public profile)
- `/settings` (overview)
- `/settings/profile`
- `/settings/account`
- `/settings/privacy`
- `/settings/notifications`
- `/settings/appearance`
- `/settings/blocked`
- `/help` or `/settings/help`

Preserve incoming share-link behavior and authenticated route protection. On mobile, use a screen stack with the same information architecture; don't force users through a web-style page grid.

## 4. A staged roadmap that AI can execute safely

**Rule for every phase:** one phase per AI request, on a clean Git branch. The AI must inspect relevant files first, plan changes, implement only the scoped work, run focused tests plus `pnpm verify`, report failed checks honestly, and list files changed. Do not let it silently redesign or refactor unrelated files. Require a diff review before merge.

### Phase 0 — Secret recovery and safe baseline

**Tasks**
- Revoke the exposed GitHub token; review repository visibility and audit log.
- Check Git history and deployment logs for committed secrets; rotate affected provider/database secrets.
- Confirm `.env` is ignored; leave only placeholder values in `.env.example`.
- Fix production TLS certificate validation.
- Add startup validation/readiness checks for all required config and registered route groups.
- Document exact local setup and live-environment prerequisites.

**Acceptance checks**
- The old token no longer works.
- A misconfigured API does not report ready or quietly omit product routes.
- Database TLS fails closed on a bad/untrusted certificate.
- No real secrets are present in tracked files or examples.

### Phase 1 — Close existing product live gates (no new major features)

**Tasks**
- Check that each required SQL migration is present, ordered and applied to the intended Supabase project.
- Run `pnpm install` and `pnpm verify` locally; save the actual output rather than relying on README claims.
- Run API `setup-check` and health/readiness checks.
- Use two separate student test accounts on web and a physical Android device: sign up, complete onboarding, discover a person, request/accept a connection, open chat, send/read messages, create a group/event, RSVP, use group/event chat, share links, block/report, revoke session and delete/anonymize an account.
- Verify database state, authorization boundaries and that failures display usable errors.

**Acceptance checks**
- All core two-account flows pass repeatedly with evidence (screenshots/logs/test cases).
- No migrations are missing; web and Android clients call the same intended API contracts.
- Failures are recorded as bugs, not worked around manually.

### Phase 2 — Build the application shell and settings entry point

**Tasks**
- Convert main screens to clear URLs/routes or intentional navigation state that supports refresh and browser history.
- Make the avatar/name chip a real account-menu button on web and add a visible, expected account/settings entry on mobile.
- Build a Settings overview with sections and short descriptions.
- Separate “View my profile” from “Edit profile.”
- Keep Discover / Connections / Messages / Community as primary destinations; settings should be secondary but easy to reach.
- Add loading, empty, error, unauthorized and save-success states for each settings route.
- Use semantic buttons/links, keyboard focus states, accessible labels and mobile-safe touch targets.

**Acceptance checks**
- Clicking the avatar opens and closes the menu correctly; keyboard-only users can operate it.
- Every menu option navigates to a real screen; no dead or placeholder links.
- Refresh and browser back/forward preserve route expectations.
- Same information architecture exists on web and mobile.

### Phase 3 — Complete profile viewing and editing

**Tasks**
- Create a public profile screen: primary photo, display name, optional campus/course/year, bio, interests, prompts, connection style and mutual context.
- Create a separate edit screen with save/cancel/unsaved-change handling.
- Make image upload validate type, size, dimensions and count; show upload progress and retry errors.
- Decide whether handles, pronouns, course/year, campus and graduation year are needed for the NUST pilot; keep personal fields optional where possible.
- Either persist “quick vibe” as a profile field with validation/API/schema/tests and an expiry/clear behavior, or remove it until supported.
- Remove hard-coded/pretend online indicators; add a real presence source and privacy controls only if the product truly needs presence.
- Keep profile preview buttons functional or non-interactive by design.

**Acceptance checks**
- Profile changes survive sign-out/sign-in and appear in Discover/Connections for another account according to visibility rules.
- Failed saves do not silently lose edits; cancel does not accidentally persist changes.
- Image operations handle failure, invalid uploads and signed URL expiry.
- Public view never exposes hidden fields.

### Phase 4 — Account, privacy and safety settings

**Tasks**
- Account screen: verified login identity, password/reset entry, account status, active sessions, sign out other sessions and explicit account deletion/anonymization.
- Privacy screen: discoverability, profile visibility, who can request connection, who can message, show/hide presence, block list, report status where safe to disclose.
- Enforce every privacy switch on the server—not only in frontend display logic.
- Explain account deletion precisely: data removed, anonymized, retained, and whether recovery is possible.
- Review API auth, role checks, ownership checks, validation and rate limits for every user-supplied ID.
- Fix database TLS and readiness before production use.

**Acceptance checks**
- A blocked user cannot discover/message/interact with the blocker; historical behavior is defined and tested.
- Private profile and message rules are enforced server-side.
- Revoked sessions stop working according to documented limits.
- Account removal is tested against profiles, images, groups, messages, reports, sessions and backups/retention policy.

### Phase 5 — One consistent notification center

**Tasks**
- Centralize notification settings instead of hiding them only inside Messages.
- Define categories: connection requests/acceptances, messages, group invitations, event changes/reminders, mentions/replies (only when those features exist), moderation/account alerts.
- Support in-app notifications first, then actual push delivery with correctly configured provider credentials and platform registration.
- Keep lock-screen payloads private; the current generic notification text approach is a good principle to retain.
- Add mark-read, unread count consistency, deep links, token rotation/removal, opt-out and quiet-hour preferences if justified.
- Do not add email notifications until deliverability, user consent and unsubscribe are ready.

**Acceptance checks**
- An enabled notification produces one event; a disabled notification produces none.
- Duplicate sends/retries do not create duplicate notifications.
- Push works on actual Android test devices; provider errors are observable without breaking message delivery.
- No message content is exposed on lock screens unless the user explicitly opts in.

### Phase 6 — Make the core student loop excellent

The core loop is: **discover someone relevant → understand why they may be compatible → make a low-pressure connection → start a conversation → meet or participate in a group/activity → return.**

**Tasks**
- Make compatibility explainable: show shared interests and compatible social pace; don't display a mysterious score without a reason.
- Improve empty states: suggest interests, invite one friend, join a group, or broaden filters.
- Finish request states: pending, accepted, declined, cancelled, blocked, rate-limited and expired (choose which states are product rules).
- Messaging UX: reconnect states, failed/retried messages, pagination, send status, read status, report/block from conversation, message permissions.
- Groups/events: owner/moderator permissions, participant caps, RSVP cancellation, event changes, safe meeting-place guidance, clear timezone handling and spam controls.
- Current community UI polls every eight seconds in places. Verify load and freshness; move to Realtime where valuable, not just because it sounds modern.
- Decide what “low-pressure mode” exactly changes and make it visible and predictable to users.

**Acceptance checks**
- A new user can achieve a meaningful first interaction in minutes without instruction.
- Each state has a visible explanation and next action.
- Cross-account and cross-platform flows produce consistent counts/statuses.
- A small moderated pilot shows the loop is used repeatedly, not only once.

### Phase 7 — Campus identity and trust

**Tasks**
- Resolve D-007: campus email verification, invite code, or both. Write a migration/verification flow that handles unverified accounts safely.
- Keep verified status distinct from a public verified badge if badge misuse could create false trust.
- Create campus/community guidelines and a moderation workflow with reviewer identity, audit trail, escalation paths and clear response targets.
- Implement support/report review operations in a restricted admin interface; verify role restrictions server-side.
- Set privacy boundaries for campus, location and event meeting details. The existing principle of not publicly exposing exact addresses should remain.

**Acceptance checks**
- Ineligible signups are blocked or placed in a controlled waitlist as the product decision specifies.
- Moderation actions are auditable and only available to authorized roles.
- Users can block/report without notifying the reported person that a specific report was filed.

### Phase 8 — Visual polish, accessibility and performance

**Tasks**
- Define shared tokens for colors, type, spacing, radii, shadows, focus states, light/dark themes and motion.
- Reduce the long web and mobile root files by extracting route components and feature modules in small, test-covered changes.
- Replace emoji-only primary navigation with a consistent icon set plus labels/accessibility names; do not rely on emoji rendering across platforms.
- Test narrow phones, larger phones, tablets and desktop; use image aspect ratios and predictable card sizes.
- Add skeletons, empty states, retry buttons, save confirmations, offline/reconnect treatment, optimistic update rollback, and destructive-action confirmations consistently.
- Run accessibility checks: keyboard, screen reader labels, contrast, target size, focus order, reduced motion, form error announcements.
- Measure slow API queries, image loading, bundle size, and feed/discovery pagination using real test data.

**Acceptance checks**
- Main tasks can be completed one-handed on mobile and keyboard-only on web.
- No clipped settings/forms at small widths.
- Loading/error/empty states are tested, not just the happy path.
- Typecheck, tests and production builds are clean.

### Phase 9 — Add a posts/feed system only after product evidence

A general content feed is a major product, moderation and storage commitment. Do not treat it as an easy UI tab.

**First release scope**
- Text and photo posts, edit/delete own post, comments, reactions, report/block, audience/visibility rules, pagination and deletion behavior.
- Feed from connected people and campus groups before attempting a global recommendation algorithm.
- Report queues, rate limits, image moderation/abuse policy, copyright complaint path and retention controls.
- Define whether resharing is allowed and how original authors/visibility are handled.

**Defer until the core loop works**
- Stories, short-form video/reels, live video, music licensing, complex ranking, creator monetization, ads, and public algorithmic recommendations.

**Acceptance checks**
- Privacy, blocking and deleted-user behavior applies across posts/comments/shares.
- Post and comment creation/edit/delete have end-to-end tests and moderation handling.
- Pilot users demonstrate recurring demand for posting, not only direct connections and activities.

### Phase 10 — Beta launch and measurement

**Tasks**
- Invite a small NUST cohort (the product definition proposes 100–300 as a manageable pilot, not a guaranteed target).
- Add privacy-respecting analytics for activation, first connection, conversation started, group joined/RSVP, retention, reports and crashes.
- Measure the activation and week-one retention targets already proposed in the product doc; revise targets from observed pilot results.
- Set up error monitoring, backups/restore drills, database migration rollback plans, rate-limit alerting and incident handling.
- Publish terms, privacy policy, community guidelines, support path and an accurate feature/security status page before broader availability.
- Conduct a launch checklist across Android, web, low-bandwidth connections and real student accounts.

**Acceptance checks**
- Launch readiness owner signs off on migrations, auth, safety, support, monitoring and restore procedures.
- No critical unresolved privacy/security bugs.
- Pilot learnings result in a ranked roadmap, not a wish list.

## 5. Feature decision guide: what to build now vs later

### Build/finish now
- Avatar-to-settings entry and settings hub
- Clear “view profile” vs “edit profile” separation
- Account/privacy/security controls and platform parity
- Real push notification integration
- Current live gates, migrations, cross-account smoke tests and database TLS
- Reliable Discover → Connection → Message → Group/Activity loop
- Better empty/error/loading states and accessibility

### Build after pilot feedback
- Posts, comments, reactions and a connected-friends/group feed
- Mentions, richer notification categories, saved posts and profile links/handles
- Additional profile fields specifically useful to students (course/year/campus club), with privacy defaults

### Delay until demand and operational capacity exist
- Short-form video, stories, live streaming, music, monetization/ads, advanced recommendation algorithms
- Any feature that multiplies moderation work before there is a reliable report-handling operation

## 6. Copy-paste AI work prompts

Use the global rules below for every phase, then append only one phase prompt at a time.

### Global rules to prepend to every prompt

> Work only in the existing Social-app repository and preserve the current stack and conventions. First inspect the relevant files, existing tests and docs. Before editing, write a short plan and list the files likely to change. Do only the requested phase; do not add unrelated features, mass-refactor unrelated code, change database contracts casually, or invent completed functionality. Follow existing validation and auth patterns. Any schema change must include an ordered SQL migration and tests. Any setting must be enforced by the API/server, not only hidden in the UI. Keep web and mobile behavior intentionally aligned. Add/update focused tests, run the relevant package tests and `pnpm verify`, and report exact commands/results. If a command cannot run, say so rather than claiming it passed. Finish with: implementation summary, files changed, migration/env notes, checks passed/failed, known gaps, and a manual test checklist. Do not commit or push changes.

### Prompt A — Phase 0 security/readiness

> Implement Phase 0 only from `social_app_audit_roadmap.md`: production config validation, accurate API readiness behavior, TLS certificate validation for the remote Postgres connection, safe `.env.example` checks, and tests for all missing/present config combinations. Inspect the current env loader, DB pool, API server, `/ready`, and setup-check before changing anything. Do not add social features. Do not expose or request secret values. Keep any provider-specific certificate setup documented. Run focused tests and `pnpm verify` and report exact outcomes.

### Prompt B — Phase 1 live-gate automation and verification

> Implement the smallest automation/documentation changes needed to make the existing Phase 5/6 live gate repeatable: migration/setup checks, health/readiness checks, two-account smoke-test checklist/script, and clear failure reporting. Do not claim the live Supabase/Android tests ran unless they actually ran. Do not add new product features. If the environment cannot run device or Supabase tests, build the repeatable checklist and state the manual steps remaining.

### Prompt C — Phase 2 settings shell

> Implement Phase 2 only: add the avatar/account menu on web and an equivalent account/settings entry on mobile; separate the public profile view from the edit form; create the Settings overview and route/screen skeletons for Profile, Account, Privacy & Safety, Notifications, Appearance, and Help. Every visible control must navigate somewhere real, or be explicitly marked unavailable rather than silently inert. Add keyboard access, focus management, semantic controls, mobile-safe touch targets, route/back behavior and tests. Do not implement every underlying setting in this phase; build the navigation foundation first.

### Prompt D — Phase 3 profile flows

> Implement Phase 3 only: separate public profile and edit-profile UI; wire profile edits, photo upload/removal, interests and prompts to existing clients; fix temporary or fake preview state, including the mood/vibe selector and any static online label. If persistent vibe status is in scope, add a validated shared type, API contract, migration if needed, server-side permission rule and tests; otherwise remove the interactive claim and mark it not supported. Make all preview actions functional or non-interactive. Do not add a feed.

### Prompt E — Phase 4 privacy/account/safety

> Implement Phase 4 only using existing auth, profile and safety clients. Create dedicated Account and Privacy & Safety screens, verify server-side enforcement for discoverability/messaging/block/report/session controls, and make account deletion/anonymization wording match actual data handling. Add tests for ownership, blocked pairs, private visibility, revoked sessions and data cleanup. Do not add new privacy switches unless their server-side rules and persistence are included.

### Prompt F — Phase 5 notification center and push

> Implement Phase 5 only. First trace the current notification settings schema, client and noop push sender. Build a central notification preferences screen with the currently supported categories; wire real push delivery only after the required provider credentials/configuration and mobile device-token lifecycle are implemented and documented. Preserve generic lock-screen payloads. Add deduplication, retry/error handling and tests. If real credentials cannot be supplied in the environment, implement the integration seam and tests, but explicitly report that live push delivery remains unverified.

### Prompt G — Phase 6 student core loop

> Improve only the existing Discover → Connection → Message → Group/Activity loop. Use the current product definition as the source of truth. First identify actual bugs and missing states; then implement the highest-impact small fixes, including compatibility explanations, empty states, request state handling, chat retry/reconnect, RSVP cancellation and permission rules. Do not add posts, stories, reels, ads or monetization. Add a small end-to-end test for the changed flow and report measured behavior.

### Prompt H — Phase 7 campus trust

> Resolve and implement the approved campus eligibility rule from decision D-007 only after confirming it in the docs/PR discussion. Add the minimum verification/invite-code flow, abuse limits, moderation access controls and audit evidence needed for a small NUST pilot. Do not create a public “verified” badge that overstates what was verified. Include privacy and support implications, tests and migration notes.

### Prompt I — Phase 8 visual/accessibility quality

> Improve the design system and accessibility in one feature area at a time. Audit the current tokens, buttons, navigation, forms and responsive styles; replace non-semantic clickable divs, standardize focus/hover/disabled/loading states, and test small screens and keyboard navigation. Extract long files incrementally with tests before and after each refactor. Do not perform a repository-wide rewrite or change product behavior as part of visual polish.

### Prompt J — Phase 9 feed MVP (only after pilot approval)

> Plan—not implement immediately—a small post/feed MVP based on pilot evidence. Propose the schema, API contracts, storage/moderation implications, privacy model, block/delete behavior, migration plan and test plan for text/photo posts, comments and reactions. Separate must-have from deferred features. Wait for explicit scope approval before coding. Do not include stories, short-form video, live streaming, licensed music or monetization in the first feed release.

## 7. Definition of done for every feature

A feature is not done merely because the UI looks complete. It is done when:

- A real user can find it without instructions.
- Loading, empty, failure, retry, success and destructive-confirmation states exist.
- Data persists after app restart/sign-in where intended.
- The API validates input and enforces authorization/visibility server-side.
- Web and mobile are consistent or their differences are documented.
- Tests cover happy path, permission failures, malformed input, retries and relevant edge cases.
- Accessibility basics are verified.
- Any environment variable or migration is documented.
- `pnpm verify` and production builds are run and results are reported honestly.
- No unrelated features or large refactors slipped into the change.

## Sources inspected

- Repository overview and scripts: https://github.com/24kcee-spec/Social-app and https://github.com/24kcee-spec/Social-app/blob/main/README.md
- Product definition: https://github.com/24kcee-spec/Social-app/blob/main/docs/product-definition.md
- Architecture: https://github.com/24kcee-spec/Social-app/blob/main/docs/ARCHITECTURE.md
- Decision log: https://github.com/24kcee-spec/Social-app/blob/main/docs/decisions.md
- Build handover: https://github.com/24kcee-spec/Social-app/blob/main/docs/BUILD-HANDOVER.md
- Web shell/profile editor: https://github.com/24kcee-spec/Social-app/blob/main/apps/web/app/page.tsx
- Web discovery, connections, messages, community: `apps/web/app/discover.tsx`, `connections.tsx`, `messages.tsx`, `community.tsx`
- API registration/readiness: https://github.com/24kcee-spec/Social-app/blob/main/apps/api/src/server.ts and `apps/api/src/app.ts`
- Message storage/push: `apps/api/src/messaging/store.ts`, `apps/api/src/messaging/notify.ts`
- Safety/report storage: `apps/api/src/safety/store.ts`
- Mobile shell/editor: https://github.com/24kcee-spec/Social-app/blob/main/apps/mobile/App.tsx

## Review limitations

This is a static, source-informed review of files available through the public GitHub web interface. It is not a penetration test, code execution, full repository checkout, visual review of a running build, or live database/provider verification. Items described as “not found” or “needs verification” should be checked against a local clone before being treated as a confirmed absence.
