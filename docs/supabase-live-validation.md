# Supabase live validation — 24 October 2026

Project: `mdekznpqmadhhsmouuhx`. Access uses the existing scoped environment binding through the HTTPS Management API; no token values are committed or logged.

## Changes applied and verified

- Numbered migration ledger advanced from 0001–0010 to **0001–0015**. Each new migration and its ledger record committed in one transaction.
- A protected `sidle_maintenance` rollback baseline preserves the single legacy badge reset by migration 0011. Anonymous/authenticated schema/table access is revoked. No legacy push tokens existed to clear.
- Final pilot security SQL applied after prior security files. Implementations with elevated permissions now live in unexposed `app_private`; public compatibility wrappers use invoker permissions. Public privileged RPC count is zero; anonymous helper execution is revoked.
- All public application tables retain RLS. Eight active-account/session guards and the Storage guard are installed. Direct badge/report writes and unsupported chat-media client access are denied.
- Real rollback-only SQL tests passed for both conversation members, outsider denial, original-photo privacy, connected thumbnail access, direct-write denial, revoked-session reads/uploads, blocked-pair visibility and deleted accounts. Temporary data was rolled back; both real users and profiles remain intact.
- Missing foreign-key indexes fixed. Supabase performance advisor now reports **zero warnings** and no unindexed foreign keys. Informational unused-index findings are retained for measurement rather than deleting useful indexes from a two-user dataset.
- Database SSL enforcement enabled and confirmed applied.
- Email auto-confirm disabled; minimum password length aligned to the app's eight-character rule; password changes require reauthentication. Existing password logins were not deleted/reset. Legacy academic badges require fresh inbox proof.
- Auth site URL and redirect allowlist now include the verified production Sidle web origin; existing local-development entries remain.
- Security advisor's only remaining warning is leaked-password protection. Enabling it returned **HTTP 402**; no paid-plan changes were made.

## Reproducible checks

```bash
# Read-only status (default); reads token from secure environment only
python scripts/supabase-maintenance.py

# All synthetic fixtures are rolled back, including Storage metadata
python scripts/supabase-maintenance.py --verify-rls

# Only after reviewing every pending file against the intended project
python scripts/supabase-maintenance.py --apply --security
```

Do not run old security files after the final pilot security file without reapplying the final file. Do not add `app_private` or `sidle_maintenance` to exposed API schemas. Do not put `SUPABASE_ACCESS_TOKEN` in application runtime clients.

## Remaining operational evidence

- Hosted API initially returned healthy liveness but failed database/schema readiness. The official Supabase CA is now bundled in the code with verification still enabled; check production `/ready` after rollout before claiming connectivity is restored.
- Custom SMTP is not configured. Supabase's default email service is restricted; reliable pilot signup, reset and verification-link delivery needs an actual configured mail provider.
- Leaked-password checks remain provider-plan blocked (HTTP 402).
- Point-in-time recovery is disabled and the API lists no user-restorable backups. The protected rollback baseline covers this change, not full disaster recovery. No paid upgrade or restore drill was performed.
- Physical Android, actual push delivery and complete browser/device interaction evidence remain separate gates.
