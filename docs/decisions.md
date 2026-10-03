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
