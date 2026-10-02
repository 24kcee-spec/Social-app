# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 2 - code complete; pending Phase 2 live gate (web + Android/iOS profile/onboarding/media sync) |
| Working branch | main |
| What is complete | Phase 1 auth foundation; Phase 2 profile tables, 50 interests, 10 prompts, profile API/client, onboarding, social-style controls, privacy controls, private profile-media Storage bootstrap, web profile editor/preview, mobile profile editor/preview, profile media upload/delete paths |
| Tests | `pnpm verify` expected **131 passing**: config 7, validation 17, auth-client 16, profile-client 10, API 81 |
| Static checks performed here | TypeScript transpile/syntax check: 39/39 TS/TSX files parsed; typecheck passed for `@sp/types`, `@sp/validation`, `@sp/auth-client`, `@sp/profile-client` using the available local package dependencies |
| Not tested here | Full `pnpm verify` for the whole monorepo, real Supabase/Postgres, real Supabase Storage policies, Windows PowerShell delivery execution, Android/iOS device UI and actual web browser upload flow; the build environment had no usable pnpm registry access and did not contain all app dependencies |
| Required live setup | Run `docs/supabase-phase2-security.sql` in the Supabase SQL Editor after migration 0003, then run API `migrate` + `setup-check`, web, and mobile gates |
| Next task | Phase 2 live gate: create/edit the same profile on web and Android/Expo, upload/delete a profile image, confirm data matches and media remains private |
| Known limitation | Mobile password reset still opens web `/reset` (native deep-link reset is Phase 10). Profile discovery of other users is intentionally not enabled until later discovery/safety phases. |
| Do not touch | Unrelated projects (Fazak / Twelve C) |
| Decision changes | D-014 private profile/Storage authorization boundary; D-015 minimum onboarding dataset |
