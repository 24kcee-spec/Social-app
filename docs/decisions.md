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
