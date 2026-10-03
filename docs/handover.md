# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 3 - people discovery delivered (API + web + mobile); pending live gate |
| Working branch | main |
| What is complete | Phases 0-2 (auth, profiles, onboarding, media); Phase 3: migration 0004 (user_blocks, discovery_events), deterministic scorer, eligibility SQL, `GET /discovery/people`, `POST /discovery/events`, `GET/POST /blocks`, `DELETE /blocks/:userId`, admin `GET /admin/discovery/explain`, shared discovery client, web Discover tab, mobile Discover tab, doctor checks |
| Tests | `pnpm verify` expected **187 passing**: config 7, validation 20, auth-client 16, profile-client 17, API 127 |
| Checked here | Typecheck for all packages and apps (web, mobile, API); full test run; `next build` of the web app; DB tests run against real Postgres semantics (PGlite) |
| Not tested here | Windows PowerShell 5.1 delivery script, real Supabase (RLS, Storage policy, thumbnails), real devices, real browser UI |
| Required live setup | 1) `pnpm --filter @sp/api run migrate` (applies 0004). 2) Run `docs/supabase-phase3-security.sql` in the Supabase SQL Editor. 3) `pnpm --filter @sp/api run setup-check` = All checks passed. 4) Restart API + web |
| Phase 3 gate | Two accounts with onboarding done see each other with reasons; Skip lowers/hides; Block hides both ways on web and phone; admin explain shows the score; photos show as thumbnails |
| Next task | Phase 3 live gate, then Phase 4 (low-pressure interaction: connection requests, icebreakers, question cards) |
| Known limitations | Android/iOS device testing deferred until a proper setup exists. Groups/activities cards wait for Phase 6. Block/report UI beyond "Block" waits for Phase 9. Thumbnail URLs issued before a block stay valid up to 1 hour |
| Do not touch | Unrelated projects (Fazak / Twelve C); untracked `.agents/` and `skills-lock.json` |
| Decision changes | D-016 to D-020 added |
