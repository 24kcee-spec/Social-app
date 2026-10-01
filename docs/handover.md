# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 1 - auth backend done (1.5, 1.6, 1.8, 1.10 backend side). Remaining: web + mobile shells with sign-in |
| Working branch | main |
| What is complete | Monorepo; shared packages; API /health + /ready; users/roles/user_sessions migrations; Supabase JWT verification; /me, /me/sessions, DELETE /me/sessions/:id; requireAuth/requireRole; `setup-check` and smoke-auth script |
| Tests | `pnpm verify` - 56 passing (config 6, validation 7, api 43) |
| Not yet verified | Live Supabase (needs your project): run `pnpm --filter @sp/api run setup-check` then `scripts/smoke-auth.ps1` |
| Known bugs | none known |
| Next task | Web shell (Next.js) + mobile shell (Expo) with sign-up / sign-in / sign-out / reset against Supabase |
| Do not touch | Unrelated projects (Fazak / Twelve C) |
| Decision changes | D-008, D-009, D-010 added |
