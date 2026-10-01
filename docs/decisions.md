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

