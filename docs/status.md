# Sidle — current status and remaining work

Updated: 24 October 2026. This supersedes the older build-phase handovers and 22 October audit. Detailed live evidence: [supabase-live-validation.md](supabase-live-validation.md).

## Working and verified

- Supabase project `mdekznpqmadhhsmouuhx` has **all 15 numbered migrations applied** and the final security SQL installed. No pending or unrecognized migrations.
- The hosted API returns **HTTP 200 / ready** with configuration, database and schema checks passing. Database TLS verifies chains/hostnames using the official provider CA; server-side SSL enforcement is enabled. The production web origin passes CORS and matches Auth redirects.
- All public app tables have RLS. Privileged helper implementations are outside the exposed API schema; anonymous execution and direct badge/report writes are denied. Missing foreign-key indexes are fixed. Performance advisor has no warnings; the only security warning is the provider-plan-blocked leaked-password feature.
- **45 live API assertions passed** using isolated temporary accounts: authentication, private onboarding/profile persistence, messaging/retries/read receipts, notification preferences, unowned-email rejection, moderator-role denial, groups, event RSVP/waitlist promotion/chat, report/block, session revocation, account removal and background Auth erasure.
- Actual authenticated Realtime message/read-watermark delivery passed. Disconnect/reconnect plus API gap-fill recovered complete, nonduplicated history and resumed streaming.
- Live rollback-only SQL probes verified members/nonmembers, private originals/connected thumbnails, blocked pairs, revoked sessions, forged writes and deleted accounts. Temporary Auth/application/group data was removed; original account counts were restored.
- Account removal now has an authenticated Supabase Edge worker and an idle-safe once-per-minute scheduler. The scheduled path completed actual throwaway-account erasure. Its credential is stored in Edge secrets and encrypted Vault; clients cannot read it. Failed jobs remain retryable.
- Web privacy/account settings are separate screens. Mobile profile drafts have Save/Discard, validation, partial-save recovery and navigation guards. Unsupported chat photo attachment controls are removed. Native links use actual configured domains/signing identities.
- **431 automated tests pass**: API 318, auth-client 19, profile-client 58, validation 27, config 7, design tokens 2. All workspace typechecks and the web production build pass. Browser/device interaction is separate from API/SQL evidence.

## Remaining work, in order

1. **Configure a real transactional email provider.** Custom SMTP is absent and no provider credentials are supplied. Supabase's default email delivery is restricted. Production signup confirmation, password reset and legacy-account email access links need real delivery tests. Email confirmation stays enabled; the legacy auto-confirm bypass is closed.
2. **Resolve provider-plan protection/restore requirements.** Enabling leaked-password protection returned HTTP 402. PITR is disabled and the API lists no user-restorable backups. A protected rollback baseline exists for this maintenance change, but that does not replace a tested disaster-recovery backup. No paid upgrade or restore drill was performed.
3. **Close browser and Android/device gates.** API/Realtime flows are verified; keyboard/screen-reader behavior, real browser navigation/draft handling, narrow screens, native permissions and physical-device behavior still need their own evidence. Link EAS, configure preview service URLs/project ID, build/install the APK, and test cold/warm app links using matching signing identities.
4. **Verify actual phone push.** Code for opt-in Expo delivery, token/session lifecycle and receipts exists, but the live provider remains disabled. Configure actual FCM/APNs/Expo credentials and verify foreground/background/closed-app delivery and tap routing on a physical device. Connection-request push, browser push and media messages remain separate unimplemented features.
5. **Complete pilot admission and operations.** D-007 eligibility is still open. Publish the actual admission/retention/privacy/terms/support policies, assign moderation coverage, exercise restore/monitoring procedures, and collect pilot activation/retention evidence. Feed/stories/reels/music/monetization remain deferred until pilot evidence supports them.

## Maintenance

Use the existing secure bindings; never paste credentials into code, output or chat.

```bash
# Read-only live schema/security/queue/schedule status
python scripts/supabase-maintenance.py

# Live rollback-only RLS checks
python scripts/supabase-maintenance.py --verify-rls

# Only after reviewing every pending migration against this project
python scripts/supabase-maintenance.py --apply --security

# Update the existing Edge worker and schedule, preserving credentials
python scripts/deploy-supabase-cleanup.py
```

The optional `--provision` flag is only for first-time worker credential creation when both bindings are absent. The deployment script refuses inconsistent existing bindings. See [cleanup schedule](supabase-cleanup-schedule.sql) and [live validation](supabase-live-validation.md).

`SUPABASE_ACCESS_TOKEN` is an operator HTTPS Management credential, not a browser/mobile or application runtime secret. Server cleanup credentials stay in Supabase Edge secrets/Vault. The cloud machine's direct PostgreSQL TCP route remains unavailable; hosted API access and HTTPS database maintenance are working. Environment startup configuration is saved separately from Git and publication.
