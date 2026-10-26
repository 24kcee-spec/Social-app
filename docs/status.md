# Sidle — current status

Updated 26 October 2026 (Africa/Harare). The [interaction release](production-release.md) supersedes the older feature/test notes below. The [audit](product-audit-2026-10-26.md) records the defects found in the preceding build.

- Messaging now synchronizes rich changes, preserves history position, retains sender-scoped retry IDs/attachments across reload, supports indexed conversation search/shared media/reply lookup, and queues rich/legacy push through the same durable delivery path.
- Core/platform pages use one named-icon navigation/account menu. Feed labels/contrast, active destinations, Settings history/drafts and authentication return paths are corrected. Voice preview/cancel, photo viewing and accessible destructive dialogs are included.
- Supabase has all 15 portable and seven independent product migrations applied. Live rollback-only suites cover the new signal/search/queue permissions as well as existing privacy/security. No real-user data was reset.
- Local workspace baseline is 511 tests, with separate Chromium interaction tests and operator-tool tests. CI also builds the web app. Exact release deployment checks must pass before merging.
- All 17 implementation live-browser assertions passed with owned temporary accounts; original counts were restored.

Remaining launch gates: actual SMTP/inbox delivery, provider-plan protection/recoverable backups, offsite database-plus-Storage restoration, signed physical-device/App Link/push/assistive-technology evidence, optional TURN/LiveKit/merchant integrations, and named support/moderation/legal operations. The legacy native screen still needs full rich-control parity; no physical-device release is claimed.

Use `python scripts/production-readiness.py --scope core` for deployed code/services, or the default all-gates audit for the honest external readiness result. See [production release](production-release.md) for commands and evidence requirements.

## Historical baseline before the expanded platform release

Updated: 24 October 2026. This supersedes the older build-phase handovers and 22 October audit. Detailed live evidence: [supabase-live-validation.md](supabase-live-validation.md) and [product persistence](supabase-product-persistence.md).

## Working and verified

- Supabase project `mdekznpqmadhhsmouuhx` has **all 15 numbered migrations applied** and the final security SQL installed. No pending or unrecognized migrations.
- The independently versioned Supabase product migration `202610240001_social_context.sql` is applied and checksum-verified. Social intent, expiring availability, private cross-device saved introductions and feedback/admin review now persist through session-checked RPCs. New data is removed on account anonymization; privacy and block changes are enforced in the database. The portable API ledger remains 0001–0015.
- The new product flows pass live Chromium checks on the production web build at desktop and 390px widths, including a separate browser context for saved introductions and real feedback/admin persistence. Test-only Auth/application records were removed. Preview API readiness returns 200 through the deployed same-origin proxy. Full device/screen-reader and broader application interaction gates remain separate.
- The hosted API returns **HTTP 200 / ready** with configuration, database and schema checks passing. Database TLS verifies chains/hostnames using the official provider CA; server-side SSL enforcement is enabled. The production web origin passes CORS and matches Auth redirects.
- All public app tables have RLS. Privileged helper implementations are outside the exposed API schema; anonymous execution and direct badge/report writes are denied. Missing foreign-key indexes are fixed. Performance advisor has no warnings; the only security warning is the provider-plan-blocked leaked-password feature.
- **45 live API assertions passed** using isolated temporary accounts: authentication, private onboarding/profile persistence, messaging/retries/read receipts, notification preferences, unowned-email rejection, moderator-role denial, groups, event RSVP/waitlist promotion/chat, report/block, session revocation, account removal and background Auth erasure.
- Actual authenticated Realtime message/read-watermark delivery passed. Disconnect/reconnect plus API gap-fill recovered complete, nonduplicated history and resumed streaming.
- Live rollback-only SQL probes verified members/nonmembers, private originals/connected thumbnails, blocked pairs, revoked sessions, forged writes and deleted accounts. Temporary Auth/application/group data was removed; original account counts were restored.
- Account removal now has an authenticated Supabase Edge worker and an idle-safe once-per-minute scheduler. The scheduled path completed actual throwaway-account erasure. Its credential is stored in Edge secrets and encrypted Vault; clients cannot read it. Failed jobs remain retryable.
- Web privacy/account settings are separate screens. Mobile profile drafts have Save/Discard, validation, partial-save recovery and navigation guards. Unsupported chat photo attachment controls are removed. Native links use actual configured domains/signing identities.
- **464 automated tests pass**: API 319, auth-client 19, profile-client 67, validation 27, config 7, design tokens 2, web 23. All workspace typechecks and the web production build pass. Browser/device interaction is separate from API/SQL evidence.

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

# Independent Supabase product migration inventory/checksums and rollback-only probes
python scripts/supabase-product-maintenance.py
python scripts/supabase-product-maintenance.py --verify

# Only after reviewing every pending migration against this project
python scripts/supabase-maintenance.py --apply --security

# Update the existing Edge worker and schedule, preserving credentials
python scripts/deploy-supabase-cleanup.py
```

The optional `--provision` flag is only for first-time worker credential creation when both bindings are absent. The deployment script refuses inconsistent existing bindings. See [cleanup schedule](supabase-cleanup-schedule.sql) and [live validation](supabase-live-validation.md).

`SUPABASE_ACCESS_TOKEN` is an operator HTTPS Management credential, not a browser/mobile or application runtime secret. Server cleanup credentials stay in Supabase Edge secrets/Vault. The cloud machine's direct PostgreSQL TCP route remains unavailable; hosted API access and HTTPS database maintenance are working. Environment startup configuration is saved separately from Git and publication.
