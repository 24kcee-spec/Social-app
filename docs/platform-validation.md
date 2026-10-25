# Platform release validation — 25 October 2026

Feature branch: `feat/sidle-complete-platform`, based on `3d39e3f22f8df6ac34d2e2b82b8321f8c408a2c2`. See [release handover](../Documents/PLATFORM_RELEASE_HANDOVER.md) for scope, gates and operating limits.

## Evidence completed

- `pnpm verify`: 487 passing tests, all workspace typechecks, 15 portable migration checks and 5 independent Supabase product migrations.
- `pnpm --filter @sp/web build`: production compilation/typecheck/static and dynamic route generation pass.
- Mobile config guards and Expo public configuration evaluation pass; new WebView version matches Expo's bundled native-module recommendation. No signed device binary is claimed.
- Live independent migration ledger is checksum-verified with no pending entries. Portable ledger is unchanged at 15.
- All four live rollback-only product/platform/commerce/media SQL suites pass, including session/block/account deletion, member audiences, upload reservation/metadata matching/quarantine, story expiry, music playlist ownership, content pagination, receipts/quiet hours, rich messages, service-only billing and webhook/session deduplication, ad credit/debt accounting and live owner/viewer/guard boundaries.
- Deployed Edge cleanup is ACTIVE version 4. Its existing encrypted credential and schedule are preserved. Authenticated read-only dry run returned `200 {"dryRun":true,"dueAccountJobs":0,"limit":5}`. A manual destructive worker invocation was rejected by automatic review and was not forced.
- `docker compose ... --profile realtime config --quiet` passes with private fixture environment values. No production container deployment is claimed.
- Backup/restore shell syntax and Python compile checks pass. A generated two-second MP4 was normalized by ffmpeg with fast-start, metadata stripping and a generated poster; output stayed within the app's upload cap.

## Browser and deployment record

Browser validation uses a local production build against the actual hosted API, Supabase Auth/PostgREST and Storage. Chromium's cloud transport forwards HTTPS through a certificate-verified Node proxy; it does not mock application responses or disable TLS. Only freshly created, marker-owned fixture accounts/objects are removed. Original production counts must be restored after each run.

The release pull request is [#24](https://github.com/24kcee-spec/Social-app/pull/24). Initial feature head `edb51d2` passed GitHub verify and Vercel preview READY. Seventeen browser assertions pass on the final production build: actual Auth onboarding, readable profile/Settings persistence, text/private/compressed-image publication, MP4 reel/story/audio publication, private audience denial, follow/save/like/comment persistence, MP4 playback metadata, music playlists, rich message sending, synthetic-microphone voice upload, selected-recipient precise sharing/stop, reopened-share revocation, disabled-provider UX, 390px containment and zero uncaught JavaScript errors. Owned test bytes/accounts were removed and original production counts restored. Final-head GitHub/Vercel checks are visible on the PR. Provider-disabled calling/streaming/commerce is verified as disabled, not described as a completed physical call, broadcast or charge.

## Final privacy fixes

Reopening an existing location share exposes its Stop control even when the device has no active watcher. Revoked signaling authorization or terminal peer failure stops capture and ends the local call; transient signaling outages preserve it. Three lifecycle regression tests pass. Publishing format/audience changes reset the draft retry ID. Reserved handles are enforced after normalization, and quarantined media review honors the optional admin MFA requirement.
