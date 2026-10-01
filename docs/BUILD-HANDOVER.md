# BUILD HANDOVER - Social Connection Platform

Paste this whole file into any new Claude session, attach `Social-Connection-Platform-Blueprint-FINAL.pdf`, and say: **"Continue at <Phase/Step>."** Claude must follow the rules below.

## 1. Snapshot (update after every delivery)
| Field | Value |
|---|---|
| Owner | 24kcee-spec (24kcee@gmail.com), Bulawayo, Windows + PowerShell |
| Local repo | `C:\Dev\social-platform` |
| GitHub | `https://github.com/24kcee-spec/Social-app.git` (branch `main`; set to PRIVATE) |
| Stack | pnpm workspaces, TypeScript, Fastify API, Postgres (Supabase planned), Expo (mobile), Next.js (web), vitest, zod |
| Done | Phase 0 docs; monorepo; shared packages; API `/health` + `/ready`; migrations 0001 (users/roles) + 0002 (user_sessions); Supabase JWT verification; `/me`, `/me/sessions`, `DELETE /me/sessions/:id`; `requireAuth`/`requireRole`; `pnpm --filter @sp/api run setup-check`; `scripts/smoke-auth.ps1`; CORS allow-list; `@sp/auth-client`; web shell (apps/web, Next.js); mobile shell (apps/mobile, Expo) |
| Current step | Phase 1 gate: run the live checks in 4.1 (web + phone + API), then start Phase 2 (profile + onboarding) |
| Tests | `pnpm verify` = typecheck + all tests. Baseline 82 passing (config 7, validation 10, auth-client 15, api 50). Update count each delivery |
| Pilot | NUST / Bulawayo students, invite-only, 100-300 users |
| Open decision | D-007 pilot eligibility (university email vs invite code) |

Files to read first in the repo: `docs/decisions.md`, `docs/product-definition.md`, `docs/handover.md`, this file.

## 2. Rules (non-negotiable)
**Claude must:**
1. Build in blueprint order. Do not skip phases. Do not build P2 features (AI, streaming, monetisation, multi-provider music) before the pilot shows repeat use.
2. Output complete copy-paste PowerShell. No placeholders for the user to fill in. One paste = one outcome.
3. Deliver code as ONE `.ps1` delivery script per phase, same pattern as `Deliver-P0P1-Foundation-SOCIAL.ps1`: files embedded as base64 with SHA-256 check, backup + rollback on failure, preflight (git, node >= 22.13, pnpm, git identity), `pnpm install`, **gate = `pnpm verify` with an exact expected test count**, scoped `git add` of listed paths only, commit, push (never force).
4. Strip ANSI colour codes before parsing test output (vitest colours broke the counter once).
5. Test everything it can in its own sandbox before delivering (typecheck, tests, running the script in a clean folder). State plainly what it could NOT test (Windows PowerShell 5.1, real Supabase, real devices).
6. Never ask the user to paste secrets (service-role key, passwords, DB password) in chat. Keys go in `.env` only.
7. Be short. No filler, no re-explaining finished work.
8. Never mix in unrelated projects (Fazak, Twelve C, solar). Do not touch them.
9. Every feature meets Definition of Done: happy path, loading/empty/error states, permission tests, analytics event if it matters, no secrets/PII in logs, tested before merge.
10. Update `docs/decisions.md` and `docs/handover.md` inside each delivery.

**Product rules (from blueprint):** useful before viral; low-pressure for shy users; explain every recommendation; one identity across Android/iOS/web; privacy first (no precise public location); fast on low-end phones; every phase ends with a pass/fail gate; first algorithm is deterministic weighted overlap, never a black box; music = references/metadata only, respect provider terms; do not monetise before usage data; keep core safety and network effect free.

## 3. Delivery protocol (every phase)
**Claude side:** build -> test in sandbox -> generate `Deliver-<PhaseN>-<Name>.ps1` -> state tested/untested -> give the run block.

**User side - run block (replace the file name only if Claude says so):**
```powershell
git config --global user.name "24kcee-spec"
git config --global user.email "24kcee@gmail.com"
Set-ExecutionPolicy -Scope Process Bypass -Force
cd $HOME\Downloads
.\Deliver-<PhaseN>-<Name>.ps1 -GitHubRemote "https://github.com/24kcee-spec/Social-app.git"
```
Success = `PASS: N tests` then `=== SUCCESS ===` and a pushed commit hash.

**Manual git add / commit / push (use for any change made by hand, or if the script committed locally only):**
```powershell
cd C:\Dev\social-platform
pnpm verify
git status --short
git add -A
git commit -m "phaseN: short description"
$url = "https://github.com/24kcee-spec/Social-app.git"
if ((git remote) -contains "origin") { git remote set-url origin $url } else { git remote add origin $url }
git branch -M main
git push -u origin main
git log --oneline -1
```
Never `git push --force`. If push says "rejected / fetch first": `git fetch origin; git rebase origin/main; pnpm verify; git push origin main`, or send the red text to Claude.

**Where to post what in a new session:** this file + blueprint PDF + the failing screenshot or the last red lines of the terminal + the phase you want. Keep chats inside the Claude Project "Social app".

## 4. Remaining work by phase

### 4.1 Phase 1 - live gate check (next, user side)
Code is DONE and tested (D-008..D-013). Do these once, in order; send Claude any red text:
1. `.env` filled (DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY). Optional: MOBILE_API_URL=http://<PC LAN IP>:4000.
2. Supabase > Auth > URL Configuration > Redirect URLs: add `http://localhost:3000/reset`.
3. `pnpm --filter @sp/api run migrate`, then `pnpm --filter @sp/api run setup-check`, then start the API (`pnpm --filter @sp/api dev`) and run `scripts\smoke-auth.ps1`.
4. Web: `pnpm --filter @sp/web dev` -> http://localhost:3000: create account, sign out, sign in, "Forgot password?" -> email -> new password -> sign in.
5. Phone: `pnpm --filter @sp/mobile start`, scan the QR in Expo Go: sign in with the SAME account. Web "Your devices" must now list 2 devices; sign the phone out from the web list; the phone must return to the sign-in screen.
**Gate:** new account registers on web and mobile, signs in on a second device, logs out, resets access, sees only its own data.

### 4.2 Phase 2 - Profile + onboarding (days 8-14)
Profile/interest/prompt/user_interest tables; profile API (create/read/update); interest catalogue seed; onboarding (minimum data); social-style + privacy controls; media upload with type/size validation + thumbnails (Supabase Storage); profile preview built from shared interests/prompts. **Gate:** useful profile in a few minutes on Android, iOS, web; same data on all.

### 4.3 Phase 3 - Discovery + compatibility (days 15-17)
Candidate filters (exclude blocked/banned/out-of-settings); feature vectors; deterministic weighted score (shared interests strong, activity intent very strong, style/prompt/community moderate, recency small boost, repeated ignores reduce, blocks hard-exclude); explanation reasons on every card; freshness + diversity rules; discovery cards (people/groups/activities); log impression/open/ignore/interact/join; fixture-based tests with expected order. **Gate:** explainable recommendations; you can inspect why A saw B. No ML yet.

### 4.4 Phase 4 - Low-pressure interaction (days 18-20)
Connection requests (send/accept/decline/quiet expiry); interest-based icebreakers; question cards; mini-games (this-or-that etc.); conversation assist (user chooses what to send); low-pressure mode; anti-spam rate limits; activation tracking. **Gate:** a shy user discovers someone, gets a reason to interact, sends an intro without inventing the conversation.

### 4.5 Phase 5 - Messaging + notifications (days 21-23)
Conversations/members/messages tables; realtime (Supabase Realtime); delivery states; image/audio/link messages with validation; replies; careful typing/presence; push (FCM/APNs/web) + preferences; offline queue/reconnect. **Gate:** Android + iOS + web consistent in one chat, no data loss on reconnect.

### 4.6 Phase 6 - Groups + activities + events (days 24-25)
Groups (public/private/invite), roles, activities with capacity/RSVP/waitlist, general-area location only, event pages, event chat, QR check-in, local feed. **Gate:** create/join an activity, invite, chat, RSVP, share.

### 4.7 Phase 9 (pull forward) - Safety (day 27)
Block (instant stop of contact + discovery), report (person/message/profile/post/group/activity/event), moderation queue, rate limits, verification levels, precise-location protection, data-deletion flow, security review, incident playbook. **Gate:** block/report in seconds; reports investigable without searching the DB. **Must be done before the public pilot.**

### 4.8 Phase 8 (partial) + Sharing (day 26)
Public web preview pages + share cards, native share sheet, deep links, QR for profiles/groups/events, share-conversion tracking. Music integration comes later (one provider, metadata only).

### 4.9 Phase 10 - Web + cross-device (day 28)
Account linking to one internal user id, device session list/revoke, profile/message/media sync, shareable public pages, deep-link into app, cross-platform test matrix. **Gate:** same account consistent on Android, iOS, web.

### 4.10 Pilot (days 29-30) -> Phase 12
Fix only critical bugs; run production launch checklist (blueprint section 15: 20 checks, backups restored, budget alerts, privacy policy + terms published); invite a controlled NUST group; weekly review of activation, retention, shares, reports, crashes. Expand only after repeat use.

### 4.11 After pilot signal only
Phase 7 (stories, questions, polls, memory chains), Phase 8 (music), Phase 11 (analytics dashboards, then monetisation: premium convenience features, event/business promotion; never paywall safety or the core network), Phase 12 scale (CDN, queues, backups, support process, Harare).

## 5. Known gotchas (already hit)
- Git needs `user.name` / `user.email` set or the script aborts (and rolls back cleanly).
- Running the script without `-GitHubRemote` commits locally only; push with the manual block in section 3.
- In PowerShell, a failing native command (e.g. `git remote remove origin` with no remote) can stop the whole pasted block. Use the `if ((git remote) -contains "origin")` pattern.
- vitest colour codes broke the test counter (fixed: ANSI stripped). The in-memory Postgres tests take ~35s on first run; timeouts are 60s.
- Console may show `Γ£ô` instead of a tick - cosmetic only.
- Repo was created Public; make it Private (Settings > General > Danger Zone).
- Supabase free-tier limits must be re-checked before the pilot.
- Supabase "Confirm email" may be turned OFF during development (default email sending is rate-limited). **Turn it back ON before inviting pilot users.**
- `pnpm doctor` is a built-in pnpm command; our checker is `pnpm --filter @sp/api run setup-check`. Always use `run` for package scripts.
- `.env` lives at the repo root, is git-ignored, and holds DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. The secret key is never used by clients.
