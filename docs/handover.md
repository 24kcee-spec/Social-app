# Handover (update after every delivery)

| Field | Value |
|---|---|
| Current phase | Phase 5 - messaging + notifications delivered (API + realtime + web) and LIVE on Supabase |
| Working branch | main (phase5-messaging merged) |
| What is complete | Phases 0-4, plus Phase 5: migration 0006 (conversations, conversation_members, messages, notification_settings, device_push_tokens; first_message milestone), direct 1:1 messaging for connected people, idempotent sends via client_tag, read watermarks + unread counts, rate limits, composite (created_at, id) pagination cursor, member-scoped Realtime (postgres_changes on messages), realtime client with reconnect + gap-fill + dedupe, notification dispatch layer (settings check + token lookup + pluggable PushSender, noop until credentials), notification preferences UI, Messages tab on web |
| Live Supabase | 0001-0006 applied (schema_migrations ledger). docs/supabase-phase5-security.sql APPLIED: member SELECT policies (conversations, conversation_members, messages), is_conversation_member(), messages + conversation_members in supabase_realtime publication, RLS enabled on schema_migrations (closes the pre-Phase-5 exposure). setup-check Phase 5 items all pass |
| API added | `POST/GET /conversations`, `GET/POST /conversations/:id/messages`, `POST /conversations/:id/read`, `GET/PUT /me/notification-settings`, `POST/DELETE /me/push-tokens` |
| Client added | `@sp/profile-client`: messaging client (newClientTag, friendly errors) + `subscribeToConversationMessages` (backoff reconnect, dedupe by id, onResync gap-fill). Web: Messages tab (list, thread, optimistic send with safe retry, load older, read receipts, notification toggles) |
| Tests | `pnpm verify` expected **272 passing**: config 7, validation 24, auth-client 16, profile-client 30, API 195. Web `next build` passes; mobile typecheck passes |
| Checked here | Typecheck for all packages and apps, full test run, `next build`, DB tests on real Postgres semantics (PGlite), live Supabase state verified via MCP (tables, RLS, policies, publication) |
| Not tested here | Live two-account realtime end-to-end, real push delivery (noop sender), Windows PowerShell 5.1 delivery script, Android/iOS devices, real browser UI |
| Required live setup | DONE for Phase 5. For a fresh environment: 1) `pnpm --filter @sp/api run migrate`. 2) Run `docs/supabase-phase5-security.sql` in the Supabase SQL Editor. 3) `pnpm --filter @sp/api run setup-check` = All checks passed. 4) Restart API + web |
| Phase 5 gate | Two connected accounts message each other on web: delivery is instant (realtime), unread badges move, read receipts appear, reconnecting the network resyncs without losing or duplicating messages |
| Next task | Mobile messaging UI (client + realtime helper are ready; screens not built). Pre-pilot: real push sender (FCM/APNs/WebPush credentials) replacing noopPushSender in apps/api/src/server.ts; enable Supabase leaked-password protection (auth setting, flagged by security advisor). Phase 6: group/event chat (tables already allow kind + member roles) and media messages (message_kind enum extension) |
| Known limitations | Media messages not implemented (text only). Delivery states are sent/read via watermark; no per-message delivered flag. Push is registration-only until the real sender lands. Mobile has no messaging screens yet |
| Do not touch | Unrelated projects (Fazak / Twelve C); untracked `.agents/` and `skills-lock.json` |
| Decision changes | D-026 to D-028 added |
