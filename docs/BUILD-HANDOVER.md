# BUILD HANDOVER - Social Connection Platform (updated 3 Oct 2026)

Paste this file into a new Claude session, attach `Social-Connection-Platform-Blueprint-FINAL.pdf`, and say: **"Continue at <step>."**

## 1. Snapshot
| Field | Value |
|---|---|
| Owner | 24kcee-spec (24kcee@gmail.com), Bulawayo, **Windows PowerShell 5.1** |
| Local repo | `C:\Dev\social-platform` (untracked `.agents/` and `skills-lock.json` are NOT ours - never commit) |
| GitHub | `https://github.com/24kcee-spec/Social-app.git`, branch `main` (make repo PRIVATE) |
| Stack | pnpm monorepo, TypeScript, Fastify API, Supabase (Postgres + Auth + Storage), Next.js web, Expo mobile, vitest, zod |
| Done | Phase 0 docs; Phase 1 auth (live gate passed); Phase 2 profiles/onboarding/media (done and tested; Android testing deferred); Phase 3 code (people discovery API + web + mobile) via `Deliver-Phase3-Discovery-SOCIAL.ps1` |
| In progress | Phase 3 LIVE GATE (see section 2) |
| Test baseline | `pnpm verify` = 187 passing after Phase 3 (config 7, validation 20, auth-client 16, profile-client 17, api 127) |
| Next | Finish Phase 3 live gate, then Phase 4 (low-pressure interaction) |

## 2. Immediate next steps (in order)
1. `cd C:\Dev\social-platform; git log --oneline -3` must show `phase3`. If not, run `.\Deliver-Phase3-Discovery-SOCIAL.ps1 -GitHubRemote "https://github.com/24kcee-spec/Social-app.git"` from Downloads.
2. `pnpm --filter @sp/api run migrate` (applies 0004). Run `docs/supabase-phase3-security.sql` in the Supabase SQL Editor (safe to re-run). `pnpm --filter @sp/api run setup-check` = All checks passed.
3. Restart API and web. Use two accounts that finished onboarding (one discoverable). Check: each sees the other with reasons; "Not now" demotes; Block hides both ways; photos show.
4. Admin check (optional): grant yourself the admin role in `user_roles`, call `GET /admin/discovery/explain?viewerId=..&candidateId=..`.
5. Then Phase 4.

## 3. Rules (non-negotiable)
**Claude must:**
1. Inspect the real repo first (ask the user for `git archive --format=zip -o "$HOME\Desktop\social-app-snapshot.zip" HEAD`). Never build on guesses.
2. Build in blueprint order; no later-phase scope (no AI, messaging, stories, music, monetisation early).
3. Give complete copy-paste PowerShell (no placeholders). Deliver code as one `.ps1` per step: base64 files + SHA-256 check, backup/rollback, preflight, `pnpm install`, **gate = `pnpm verify` with exact test count**, scoped `git add`, commit, push (never force).
4. **Windows PowerShell 5.1 safe:** never use `2>$null`, `--error-unmatch`, or `2>&1` on native commands under `$ErrorActionPreference='Stop'` (stderr becomes a fatal error). Wrap native calls with `$ErrorActionPreference='Continue'` and map output with `"$_"`. Strip ANSI colour codes before counting tests.
5. Test everything possible in the sandbox (typecheck, tests, run the script on a copy of the real repo) and say plainly what was NOT tested (PS 5.1, live Supabase, real devices).
6. Never ask for secrets (DB password, secret key). `.env` only; publishable key is the only key in clients.
7. Be short. Update `docs/decisions.md` + `docs/handover.md` in each delivery.
8. Never touch unrelated projects (Fazak, Twelve C).

**Product rules:** useful before viral; low-pressure for shy users; every recommendation explained; one identity across Android/iOS/web; privacy first (no precise public location); deterministic scoring first (no black box, no ML); free core, never paywall safety.

## 4. Delivery run block (user side)
```powershell
cd C:\Dev\social-platform
git status --short
Set-ExecutionPolicy -Scope Process Bypass -Force
cd $HOME\Downloads
.\Deliver-<Name>.ps1 -GitHubRemote "https://github.com/24kcee-spec/Social-app.git"
```
Success = `PASS: N tests`, `=== SUCCESS ===`. Without `-GitHubRemote` it commits locally only.

**Manual git:**
```powershell
cd C:\Dev\social-platform
pnpm verify
git add <only your files>
git commit -m "phaseN: description"
git push -u origin main
```
Rejected push: `git fetch origin; git rebase origin/main; pnpm verify; git push origin main`. Never `--force`.

## 5. Remaining phases (blueprint order)
- **Phase 3 Discovery + compatibility (people only) - DELIVERED, live gate pending:** minimal `user_blocks` table; candidate filters (exclude blocked/banned/non-discoverable); deterministic weighted score (shared interests strong, style/prompts moderate, recency small boost, repeated ignores reduce, blocks hard-exclude); reason text on every card; freshness + diversity; `discovery_events` (impression/open/ignore/interact); fixture tests with expected order; API `GET /discovery/people`, `POST /discovery/events`; discovery feed on web + mobile. Groups/activities cards wait for Phase 6.
- **Phase 4 Low-pressure interaction:** connection requests (send/accept/decline/expire), icebreakers from shared interests, question cards, mini-games, conversation assist, low-pressure mode, anti-spam rate limits.
- **Phase 5 Messaging + notifications:** conversations, realtime (Supabase Realtime), delivery states, media messages, push (FCM/APNs/web) + preferences, reconnect handling. Gate: consistent on Android + iOS + web.
- **Phase 6 Groups + activities + events:** roles, capacity/RSVP/waitlist, general-area only, event pages/chat/QR, local feed.
- **Phase 9 Safety (before public pilot):** block/report everywhere, moderation queue, rate limits, verification levels, data deletion, security review, incident playbook.
- **Sharing + Phase 10 cross-device:** public preview pages, share sheet, deep links, QR, account linking, device matrix.
- **Pilot:** NUST/Bulawayo invite-only 100-300 users, production launch checklist (blueprint s15), weekly reviews. Turn Supabase "Confirm email" back ON before inviting users.
- **After pilot signal only:** Phase 7 content, Phase 8 music (one provider, metadata only), Phase 11 analytics then monetisation, Phase 12 scale.

## 6. Known gotchas
- Migrate (0004) BEFORE running `docs/supabase-phase3-security.sql`. Without that SQL, feed photos are blank (Storage policy missing).
- Pilot eligibility (D-007) is still open; the product itself is for everyone, not students only.
- Plain `pnpm doctor` is a pnpm builtin; use `pnpm --filter @sp/api run setup-check` and always `run` for scripts.
- Migrate BEFORE running `docs/supabase-phase2-security.sql`.
- Validation failures return `{error:"validation", fields}` with no `message`; P2b makes clients display them.
- Use the Supabase **Session pooler** connection string (IPv4); DB password letters/numbers only.
- Supabase free tier limits: re-check before the pilot.
- Console may show `Γ£ô` for tick marks - cosmetic.
