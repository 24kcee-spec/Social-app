# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 4 - low-pressure interaction delivered (API + web + mobile); pending live gate |
| Working branch | main |
| What is complete | Phases 0-3, plus Phase 4: migration 0005 (connection_requests, connections, question_cards, this_or_that_catalog, interaction_settings, activation_milestones), starters, request/accept/decline/withdraw, quiet expiry, rate limits, low-pressure mode, activation summary, Say hi picker + Connections tab on web and mobile |
| API added | `GET /people/:userId/starters`, `POST/GET /connections/requests`, `POST /connections/requests/:id/accept|decline`, `DELETE /connections/requests/:id`, `GET /connections`, `DELETE /connections/:userId`, `GET/PUT /me/interaction-settings`, admin `GET /admin/activation/summary` |
| Tests | `pnpm verify` expected **235 passing**: config 7, validation 23, auth-client 16, profile-client 21, API 168 |
| Checked here | Typecheck for all packages and apps, full test run, `next build`, DB tests on real Postgres semantics (PGlite) |
| Not tested here | Windows PowerShell 5.1 delivery script, real Supabase (RLS, Storage policy), real devices, real browser UI |
| Required live setup | 1) `pnpm --filter @sp/api run migrate` (applies 0005). 2) Run `docs/supabase-phase4-security.sql` in the Supabase SQL Editor. 3) `pnpm --filter @sp/api run setup-check` = All checks passed. 4) Restart API + web |
| Phase 4 gate | A shy user finds someone in Discover, taps Say hi, picks an opener (no typing), the other person sees it in Connections and can Connect or "Not now" (sender sees only "no reply"); mutual hello connects instantly; low-pressure mode hides free text; block ends everything |
| Next task | Phase 4 live gate, then Phase 5 (messaging + notifications) |
| Known limitations | Android/iOS device testing deferred. No chat yet (Phase 5): a connection is the permission to message. Push/notifications arrive in Phase 5, so people see requests when they open the app. Report flow beyond Block waits for Phase 9 |
| Do not touch | Unrelated projects (Fazak / Twelve C); untracked `.agents/` and `skills-lock.json` |
| Decision changes | D-021 to D-025 added |
