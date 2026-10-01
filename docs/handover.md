# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 1 - code complete: auth backend + web shell + mobile shell. Remaining: live gate check (below) |
| Working branch | main |
| What is complete | Monorepo; shared packages (types, validation, config, auth-client); API /health /ready /me /me/sessions with CORS; migrations 0001-0002; web app (apps/web) and mobile app (apps/mobile) with sign-up, sign-in, sign-out, password reset |
| Tests | `pnpm verify` - 82 passing (config 7, validation 10, auth-client 15, api 50) |
| Not yet verified | Real Supabase + real devices: run the Phase 1 gate checklist in docs/BUILD-HANDOVER.md section 4.1 |
| Run it | API: `pnpm --filter @sp/api dev` / Web: `pnpm --filter @sp/web dev` (http://localhost:3000) / Mobile: `pnpm --filter @sp/mobile start` |
| Supabase dashboard | Auth > URL Configuration: add `http://localhost:3000/reset` to Redirect URLs |
| Known limits | Mobile reset links open the web page, so test reset on web; Windows long paths may bite Expo installs (keep the repo at C:\Dev) |
| Do not touch | Unrelated projects (Fazak / Twelve C) |
| Decision changes | D-011, D-012, D-013 added |
