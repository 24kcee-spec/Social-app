# Sidle interaction release — 26 October 2026

This release implements the messaging and visual corrections from the [26 October audit](product-audit-2026-10-26.md), followed by deployment/recovery tooling. The original audit remains a record of the earlier `bd3598a` build, not a description of the corrected release.

## Messaging

- Both open clients receive opaque, member-only change signals for replies, reactions, edits and removal. Original private content and reaction tables remain outside the exposed schema. Revoked sessions, blocked pairs and outsiders cannot subscribe to the conversation signal. Shared inbox counts refresh after signals and recover on visibility/network changes.
- Incoming messages preserve history reading position. Date groups, an anchored unread divider, New messages jump, grouped senders and retained earlier-page cursors improve long threads. Receipt marking requires a focused, visible conversation near its latest message.
- Pending sends render immediately. Sender-scoped session storage preserves the exact payload/retry ID across reloads; IndexedDB retains selected attachments locally. Retrying an uncertain committed send does not duplicate it. Sign-out clears chat drafts/outbox storage. A seven-day restore limit applies to retained entries; browser storage is not a guaranteed backup.
- Earlier-page rich metadata is retained, errors are visible, and current details are refreshed after invalidation. Indexed conversation search, shared-media pagination and direct lookup let replies/search jump to a message outside the loaded page, with the same server membership checks.
- Voice recording has elapsed time, cancellation and playback before send. Private media can renew expired links while retaining playback position. The shared confirm dialog handles destructive message/member actions, keyboard cancellation and focus restoration. Profile photos have an accessible full-screen viewer.
- Every new message from the legacy API or rich RPC queues one durable push job transactionally. The API's Expo worker claims jobs atomically, uses current notification/mute/quiet-hour/session checks and records acceptance/skip/unknown/expiry. It does not blindly replay an ambiguous provider POST, because Expo does not guarantee idempotency. Receipt processing remains separate from actual device delivery. Historical messages are not enqueued.
- Native core chat now honors foreground state for read marking, receives shared invalidations, and avoids forcing every incoming message to the bottom. The legacy native screen does not become a full native implementation of every rich web control in this release.

## Navigation and visual behavior

One named-SVG header/navigation/account-menu component now serves core and platform pages. Feed/Discover/Messages/Plans/Profile remain visible on phones; More gives an explicit route to Connections and other destinations with pending-request context. Active state derives from the actual view, rather than positional masks or a falsely selected Feed item.

Feed filter labels and selected states are readable; the keyboard shortcut hint/footer contrast is corrected. Settings sections are searchable and survive refresh/Back/Forward. Optional profile detail drafts survive subsection changes, warn before leaving and provide Save/Discard. Existing profile/photo/privacy guards remain. Safe authentication return paths are restored without allowing foreign origins. Empty states distinguish Following/Saved/own posts. Calls/live/payments explain availability in member-facing language; provider configuration belongs in operations.

## Applied database changes

Portable migration ledger: unchanged **0001–0015**. Independent checksum-verified product ledger: **seven** migrations, including:

1. `202610260001_conversation_delivery.sql`: private durable push jobs, opaque RLS-protected conversation signals and triggers.
2. `202610260002_conversation_tools.sql`: indexed search and member-authorized lookup/shared-media pagination.

Both changes are additive. Already applied migrations were not rewritten. All product/security probes use rollback-only synthetic fixtures. The live database retains RLS on all public tables and zero privileged public RPC implementations. Do not run historical security scripts after the final pilot policy file without reapplying the final policy file.

## Verification

Local checks pass: **509 workspace tests**, all workspace typechecks, **20 Chromium interaction cases** across desktop/phone, and **13 operator-tool tests**. The browser suite includes a production build; mobile configuration guards pass separately. These results are also required in GitHub CI for the release head.

The release adds real Chromium interaction checks to CI alongside the existing workspace verification and production build. Fixtures in CI substitute provider/API transport deliberately; live two-account browser checks separately exercise actual Auth, hosted API, PostgREST, Storage policies and Realtime against Supabase. No source-string assertion alone closes an interaction gate.

During implementation, all 17 live browser assertions passed, including the four previously failing two-client/scroll checks. Original Auth/application/message counts were restored. Re-run the same deployment checks after merge; final GitHub/Vercel results apply to the exact release head.

Commands:

```bash
pnpm verify
pnpm --filter @sp/mobile run config:check
pnpm --filter @sp/web exec playwright install chromium
pnpm --filter @sp/web test:browser
python -m unittest discover -s scripts/tests -v
python scripts/supabase-product-maintenance.py --verify
python scripts/production-readiness.py --scope core
python scripts/check-deployment.py
```

`test:browser` builds with synthetic public fixture configuration before starting its isolated server. Do not deploy that local fixture build. Vercel builds normally using its saved production variables. For a cloud-installed Chromium, optionally set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; otherwise Playwright uses its installed browser.

## Email and launch gates

Signup now carries the intended confirmation redirect, web/native offer explicit confirmation resend with a cooldown, and reset/access-link provider failures remain visible without enumerating unknown accounts.

Custom SMTP still needs real provider-verified sender/domain bindings. Save `SMTP_HOST`, `SMTP_PORT` (465/587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_ADMIN_EMAIL` and `SMTP_SENDER_NAME` securely, then run:

```bash
python scripts/configure-supabase-email.py          # read-only status
python scripts/configure-supabase-email.py --apply  # apply saved complete bindings
```

The tool never sends email, prints credentials or enables auto-confirm. Sender/DNS/inbox behavior must be tested with a controlled recipient before claiming delivery. No SMTP credentials were available during this release.

`production-readiness.py` defaults to **all** production gates: exit 0 means selected checks pass, 1 means an infrastructure/security check failed, and 2 means infrastructure passed but provider/device/restore configuration or evidence is missing. `--scope core` checks the deployed code/services and both migration ledgers without falsely closing external gates.

Manual evidence can be supplied with `--evidence production-evidence.local.json` (Git ignored). It is an operator attestation, not an automatic proof. Required shape:

```json
{
  "project": "mdekznpqmadhhsmouuhx",
  "web_origin": "https://social-platform-web-two.vercel.app",
  "email_delivery": { "status": "pending", "verified_at": null, "report": "" },
  "isolated_restore_drill": { "status": "pending", "verified_at": null, "report": "" },
  "physical_android": { "status": "pending", "verified_at": null, "report": "" }
}
```

Only replace a pending entry with `passed`, its actual timezone-qualified verification time, and a reviewable report after the work succeeds. Reports must concern this project/origin and be at most 30 days old.

## Monitoring, backups and recovery

An hourly GitHub production-health workflow checks deployed HTML/security headers, exact API readiness and denied unauthenticated access. It publishes failed workflow runs through normal repository notification settings; it does not invent a staffed on-call destination. It retries cold starts rather than treating liveness alone as database readiness. External error/budget alerts and named response coverage still need operator ownership.

Database backup/restore tooling now preserves database ACLs, verifies the archive checksum, and refuses nonempty/non-disposable restore targets. A synthetic PGlite archive restoration test checks private-schema/table permissions. This is **not** a production disaster-recovery drill.

`scripts/backup-storage.py` adds encrypted Storage-byte archives for both Sidle buckets, with a per-object size/hash/content-type manifest. Object paths are validated and plaintext media is not written to disk. It requires `age`, a saved public `BACKUP_AGE_RECIPIENT`, a private `BACKUP_DIRECTORY`, and the existing Supabase service binding. Keep the private identity outside Git/cloud logs. Copy database and Storage archives/checksums to the configured offsite destination, verify integrity, and rehearse both restorations on an isolated provider-compatible target before claiming recovery readiness. No recipient/identity/offsite/restore-host bindings were supplied, so no real-user backup or restore was performed.

Still external: custom SMTP/inbox evidence; plan-blocked leaked-password protection/PITR; real Expo/FCM/APNs configuration and physical push delivery; signed EAS builds/App Links/hardware/assistive-technology tests; TURN/LiveKit/merchant setup for their optional integrations; actual offsite recovery and named support/moderation/legal owners. Permission to work does not supply missing service credentials, infrastructure or physical hardware. These gates remain visible rather than being represented as completed.
