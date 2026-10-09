# Decision log

Format: ID | Date | Decision | Reason | Alternatives rejected

## D-001 | 2026-10-01 | Stack follows the build blueprint
React Native + Expo (mobile), Next.js (web), TypeScript API, PostgreSQL, managed auth. Reason: one language, one account/API across Android, iOS and web. Rejected: separate native apps (3x the work for a solo builder).

## D-002 | 2026-10-01 | pnpm workspaces monorepo; shared packages export TypeScript source
Packages (@sp/types, @sp/validation, @sp/config) are consumed as source, no build step. Reason: fastest loop for one developer. Rejected: Turborepo/Nx for now (add when builds get slow).

## D-003 | 2026-10-01 | Supabase as the managed backend (Postgres + Auth + Realtime + Storage)
Reason: covers four blueprint rows on a free tier, standard Postgres underneath. users.id will equal the Supabase auth user id. Check current free-tier limits before the pilot. Rejected: Firebase (not relational), self-hosted auth (blueprint: never build password security yourself).

## D-004 | 2026-10-01 | Plain SQL migrations, own runner
apps/api/migrations/NNNN_name.sql, applied in order, each in a transaction, tracked in schema_migrations. Reason: no ORM lock-in, tested against real Postgres semantics (PGlite). Rejected: ORM-managed migrations for now.

## D-005 | 2026-10-01 | Fastify for the API
Reason: fast, typed, easy to test with inject(). Rejected: Express (older ergonomics), Next.js route handlers only (API needs to serve mobile too).

## D-006 | 2026-10-01 | Email stored lower-case; phone stored E.164
Enforced in both validation and DB constraints so uniqueness is case-insensitive and consistent.

## D-007 | OPEN | Pilot eligibility rule
Options: university email domain, invite code, or both. Decide before Phase 12.

## D-008 | 2026-10-01 | Auth: Supabase issues tokens, our API verifies them
Asymmetric tokens (ES256/RS256) are verified locally against the project JWKS (issuer + audience "authenticated" enforced). Legacy HS256 tokens are verified by calling the Auth server with the publishable key. users.id = Supabase user id; first authenticated request creates the users row + default 'user' role. Anonymous sign-ins are rejected. Email/phone clashes with another account return 409 (account linking is Phase 10).

## D-009 | 2026-10-01 | App-level session revocation
user_sessions rows (one per Supabase session_id) can be revoked by the owner; the API rejects revoked sessions immediately. Limitation: the provider's own session stays valid until sign-out/expiry; full provider-side revocation needs the secret key (later).

## D-010 | 2026-10-01 | TLS to remote Postgres without certificate pinning
Remote DB connections use TLS with rejectUnauthorized=false (Supabase pooler). Acceptable for the pilot; revisit with the provider CA certificate before public launch.

## D-011 | 2026-10-01 | One shared auth client for web and mobile (@sp/auth-client)
Both apps call the same package: validation (shared zod schemas), Supabase Auth with the PUBLISHABLE key only, friendly error codes, and the /me, /me/sessions calls. Reason: one identity and one set of rules on Android, iOS and web; auth logic is unit-tested once. Sign-out uses local scope (this device only) so signing out on a phone does not kill the laptop session. Password reset never reveals whether an email has an account. Rejected: separate auth code per app.

## D-012 | 2026-10-01 | Web = Next.js (App Router, client components); mobile = Expo with AsyncStorage sessions
Both read the repo-root .env and expose only SUPABASE_URL, the publishable key and API addresses. Password-reset emails open the web /reset page (works for web and mobile users); native deep-link reset comes with Phase 10. Rejected: Expo Router/web-from-Expo for now (more moving parts than the pilot needs).

## D-013 | 2026-10-01 | CORS is an allow-list, fail closed
CORS_ORIGINS (exact origins, no wildcard). Local default: http://localhost:3000 only. Staging/production with nothing set = no browser access. Native apps are unaffected (no CORS).


## D-014 | 2026-10-01 | Phase 2 profile data is API-owned with private Storage
Profiles, interests, prompt answers and profile media metadata are written through authenticated API endpoints scoped to the signed-in user. Supabase Storage uses a private `profile-media` bucket with per-user object paths. Reason: one authorization boundary for mobile/web and no public profile/media leakage before discovery/safety phases. Rejected: direct public profile tables and public media bucket during MVP foundation.

## D-015 | 2026-10-01 | Profile onboarding uses a small deterministic minimum dataset
A usable profile requires display name, at least three interests, at least one prompt answer, one social-style preference and explicit privacy settings. Media is optional during onboarding and editable immediately after. Reason: useful within minutes without a 20-minute form. Rejected: requiring a photo before the product provides value.

## D-016 | 2026-10-02 | Discovery is people-only, deterministic and explained (Phase 3)
Ranking is a weighted overlap computed in code (apps/api/src/discovery/scoring.ts), never ML. Shared interests are the strongest signal (6 + both strengths per interest, cap 60), then shared social styles (5 each, cap 15), same-category interests (2 each, cap 8), shared prompts (4 each, cap 8); small boosts for activity (6/4/2/1 by recency) and new members (3, 14 days). Penalties: repeat impressions (-2 each after the first, cap -10), ignores in 30 days (-20 each, cap -60, hidden at 3), diversity (-3 per already-ranked card in the same dominant category, cap -9). Ties break on recent activity then user id, so the order is repeatable. Every card carries positive reasons in plain language; negative components are visible only to admins. Rejected: collaborative filtering/embeddings (black box, no data yet).

## D-017 | 2026-10-02 | Eligibility lives in one SQL fragment; blocks hard-exclude in both directions
Discoverable + onboarding complete + status active + not self + no block either way. The feed and the admin explain tool (`GET /admin/discovery/explain`) share it, so "why does A see B" can be answered exactly. user_blocks ships now (minimal) so discovery is safe; the full block/report/moderation flow stays Phase 9. A blocked person is never told.

## D-018 | 2026-10-02 | Discovery events are API-owned and rate limited
discovery_events (impression/open/ignore/interact) is written only through `POST /discovery/events` (max 50 per request, 300 per minute per viewer). Unknown ids and self are dropped silently so ids cannot be probed. RLS enabled with no client policies on user_blocks and discovery_events.

## D-019 | 2026-10-02 | Other people's photos: thumbnails only, via a narrow Storage policy
Feed cards show only the 512px thumbnail. docs/supabase-phase3-security.sql adds a SECURITY DEFINER check so a signed-in person can read `*-thumb.jpg` of someone who is discoverable, onboarded, active and not blocked either way. Originals stay owner-only. Cards never include email or phone. Limitation: a thumbnail URL already issued stays valid for its 1-hour life after a block.

## D-020 | 2026-10-02 | Product direction note
The app is for everyone, not only students. Phase 3 contains nothing campus-specific. Pilot eligibility (D-007) still decides who is let in first; it does not change the product.

## D-021 | 2026-10-03 | Saying hi is a choice from a menu, rendered by the server (Phase 4)
A connection request carries a structured intro: an interest icebreaker (only for an interest both people have), a question card, a this-or-that pick, or a short custom note (2-240 chars). The server renders the final sentence from the catalog (migration 0005 seeds 16 question cards and 14 this-or-that games), so the client cannot supply text for structured intros. Suggestions are deterministic per pair (FNV-1a pick). Messaging itself is Phase 5; accepting only creates the connection.

## D-022 | 2026-10-03 | Declines are private; requests expire quietly
Requests expire after 14 days (computed lazily, no scheduler). A sender sees only pending / accepted / "no reply": declined and expired read the same, and a sender cannot retry the same person for 30 days. If B already said hi to A, A saying hi back connects them at once. Blocking removes the connection and withdraws open requests.

## D-023 | 2026-10-03 | Low-pressure mode = structured openers only, no obligation to answer
Stored in interaction_settings (own table, so Phase 2 profile types are untouched). People in the mode refuse custom free text (`custom_not_allowed`); the UI hides the free-text box for them. People with message permission "nobody" cannot be sent requests.

## D-024 | 2026-10-03 | Anti-spam limits
Max 10 requests per sender per 24 hours, max 20 pending outgoing, one pending request per pair (database-enforced in either direction), 30-day retry cooldown after a decline/expiry. Recipients that are not visible to the sender (private, not onboarded, blocked, unknown) all look like "not found".

## D-025 | 2026-10-03 | Activation measured from the database
Activation = onboarded member who sent a first request within 48 hours of signing up (activation_milestones: first_request_sent, first_connection). Admin-only `GET /admin/activation/summary?sinceDays=30` returns the funnel and rate. Connected people leave the discovery feed; people with an open request show a relation badge. Sending a request records a discovery `interact` event.

## D-026 | 2026-10-05 | Message pagination cursor is composite (created_at, id)
The first Phase 5 cursor was created_at-only: two messages written in the same millisecond could be skipped or shown twice when paging. MessagePage now returns an opaque nextCursor (`<timestamptz>~<id>`) and listMessages compares `(created_at, id)` tuples. The raw Postgres timestamp text (microsecond precision) goes into the cursor because a JS Date round-trip would truncate to milliseconds and re-introduce ties. Bare created_at cursors from early clients are still accepted.

## D-027 | 2026-10-05 | Realtime is a member-scoped stream plus API resync, never the source of truth
supabase_realtime publishes messages and conversation_members; member-only SELECT policies (via the SECURITY DEFINER is_conversation_member, which avoids RLS self-recursion on conversation_members) let Realtime evaluate RLS as the subscribing user, so a stream only ever reaches the two members. Writes stay API-only. The client helper (packages/profile-client/src/realtime.ts) dedupes by id, resubscribes with backoff after TIMED_OUT/CHANNEL_ERROR/CLOSED, and calls onResync after every (re)subscribe so the UI refetches the latest page from the API - a dropped socket can never silently lose a message. Multi-tab needs no coordination: every tab receives every event and merges idempotently.

## D-028 | 2026-10-05 | Push delivery is a pluggable sender behind a notifier, off until credentials
sendMessage fires onMessageSent only for genuinely new inserts (idempotent client_tag replays never re-notify). The notifier checks notification_settings.messages and registered device_push_tokens, then calls a PushSender. The wired sender is a noop; dropping in FCM/APNs/WebPush is a one-line change in apps/api/src/server.ts. Push failures are logged and swallowed: delivery problems must never fail a send. The same hardening run enabled RLS on public.schema_migrations (was the only open table).

## D-029 | 2026-10-06 | A block hides the whole chat from both people
Discovery already hides blocked pairs in both directions; messaging now follows the same rule. After either person blocks the other, `listConversations` drops the chat, and `listMessages`, `markRead` and `sendMessage` answer "not found" (404) for both people. Unblocking makes the history visible again (the connection is not restored, so sending stays frozen until they reconnect). The database enforces the same rule for Realtime and direct reads through `docs/supabase-phase5b-security.sql` (`is_conversation_visible()`), which replaces the predicate of the three Phase 5 SELECT policies without renaming them. Run it after the Phase 5 file.

## D-030 | 2026-10-06 | Messaging respects message permission and account status
`sendMessage` now refuses when the recipient's profile message permission is `nobody` (`messages_off`, 403) and when the sender is not an active account (`account_inactive`, 403) or the recipient is not active (`not_connected`). The setting is about receiving: a person who set `nobody` can still write in chats they are already in. Opening a conversation stays allowed so history remains reachable.

## D-031 | 2026-10-06 | Sends are serialised per sender; push is generic and follows the device
30 parallel sends used to pass a 20-per-minute limit because the count and the insert were separate statements. Sends are now serialised per sender inside the API process, so the limit is exact for one API instance (several instances could overshoot slightly; acceptable for an anti-spam limit, revisit with a database counter if the API is ever scaled out). Push payloads are now generic ("New message" / "Open the app to read it") plus conversation and message ids: lock screens are public, so no sender name or text is sent, and nothing is sent between blocked people. A device token belongs to the account that registered it last, so a shared phone never delivers one person's notifications to the next person.

## D-032 | 2026-10-06 | Thread merge logic is shared and tested; read receipts are live; mobile screens exist
`mergeMessages` and `applyReadWatermark` live in `@sp/profile-client` (thread.ts) and are used by web and mobile: dedupe by id, optimistic and failed bubbles replaced by clientTag, deterministic (createdAt, id) order, and a Realtime copy never downgrades an already-read message. The realtime helper also streams `conversation_members` UPDATEs (`onRead`) so "Read" appears without a refetch. Web and mobile both have a Message button on each connection that calls `openConversation` (before this nothing could start a chat). Mobile has the same Messages tab and notification toggles as web. Media messages remain deferred (see handover); the blueprint and handover disagreed on the phase and the decision is open.

## D-033 | 2026-10-06 | Phase 6 community hardening (groups, events, RSVP, event chat)
The Phase 6 backend on the branch had no tests, a red migrations test, and real defects. Migration 0007 is left untouched; 0008 fixes the schema: RLS enabled on `event_messages` (it was readable with the public key), one owner per group, case-insensitive area indexes, and `first_group_join` / `first_rsvp` activation milestones. Behaviour fixes: RSVP no longer demotes a seat holder to the waitlist when the event is full; cancelling a seat promotes the longest-waiting person; leaving a group releases that person's upcoming seats; RSVP requires group membership and an unfinished event; capacity checks (join and RSVP) are serialised per group/event inside the API process, same trade-off as D-031; event chat shows the newest 50 messages with a deterministic (created_at, id) cursor for older ones (it used to stop showing new messages after 100); event chat is rate limited (20/min, 400/day) and idempotent per client tag; groups, events, members, attendees and chat hide anyone in a block with the viewer, in both directions (D-029); creating a group needs a finished profile and is capped at 5 owned groups; creating an event must be in the future. Added: member list, attendee list, delete group (owner), cancel event (host or moderator), area/activity/group filters, sender names in chat.

## D-034 | 2026-10-06 | Event chat is polled, not streamed; QR/share deferred
Event chat refreshes every 8 seconds on web and mobile (paused while the tab is hidden on web). Realtime for `event_messages` would need a block-aware, going-only RLS policy and a publication change; polling keeps the table API-only (RLS on, no client policies) and is enough for pilot-size events. Revisit if chat volume grows. QR codes and share links stay in the Sharing/Phase 10 plan (public preview pages and deep links do not exist yet). Moderator promotion and member removal are not built: only owners create events until a moderation phase (Phase 9) adds roles management and reporting.
