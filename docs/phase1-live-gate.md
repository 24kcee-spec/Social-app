# Phase 1 — Live readiness gate

This is a **manual evidence checklist**, not a claim that live Supabase, browser, or Android tests have already passed. Run each check against the intended test project and record the date, target (use a non-secret project alias), result, and any issue.

## 1. Verify the intended environment

From the repository root on Windows CMD:

```bat
git switch main
git pull --ff-only origin main
pnpm verify
pnpm --filter @sp/api run setup-check
powershell -ExecutionPolicy Bypass -File .\scripts\check-api-health.ps1
```

The setup check is read-only. It must report the database connection, expected migration ledger, Phase 5 messaging security, and Phase 6 community security as passing. The health script checks both `/health` and `/ready`; a failed readiness check is a failure, not a successful liveness result.

**Do not run migrations until the pending-migration output has been reviewed.** The current migration runner applies every missing SQL migration in filename order. It does not stop after `0008_community_hardening.sql`; depending on the target database it may also apply `0009_safety_and_moderation.sql` and `0010_media_messages.sql`. Confirm that the full pending list is intended for this project before running:

```bat
pnpm --filter @sp/api run migrate
pnpm --filter @sp/api run setup-check
```

Never paste `.env`, database URLs, passwords, access tokens, or provider keys into chat. The commands are designed to report configuration *names/status*, not secret values.

## 2. Two-account web gate

Use two separate, verified **test** accounts (Account A and Account B). Finish onboarding for both, and do not use personal accounts for destructive tests.

| Test | Procedure | Pass condition |
|---|---|---|
| Sign-in and account | Sign in as A, then B in a separate browser profile; reload each app | Both remain signed in and the account loads without a stuck spinner |
| Discovery | A discovers B and opens B's profile | Profile loads according to visibility/block rules; empty/error states remain usable |
| Connection | A sends a connection request; B accepts it | Both accounts show the accepted connection after refresh |
| Direct messages | A sends B a message; B replies | Both messages appear once; unread count and read receipt update; refresh/reconnect does not lose or duplicate messages |
| Group membership | A creates a test group; B joins | Both accounts can see the group and expected member roles |
| Event and RSVP | A creates a future event in the test group; A and B RSVP | Attendee state is correct; for a separate capacity-1 test event, the second RSVP is waitlisted and is promoted when the seat-holder cancels |
| Event chat | A and B exchange event chat messages | Both can send and fetch messages as permitted group members; polling refreshes within the documented interval |
| Block and report | Use only throwaway test identities and clearly synthetic content | Block/report works and blocked pairs cannot continue prohibited discovery/chat/group interactions |
| Session revocation | Revoke a test session and retry with that session | The revoked session is rejected as documented |
| Cleanup | Delete the test group/event and record any intentionally retained report rows | No unintended test data remains; record any cleanup failures |

For each row, record **PASS / FAIL / BLOCKED**, the observed behavior, and a screenshot or redacted response where useful. Do not mark a feature passed merely because its button or endpoint exists. Do not delete/anonymize an account unless it is a dedicated throwaway account and the consequences are understood.

## 3. Android follow-through

The repository's handover records physical Android testing as not yet completed. Repeat the sign-in, onboarding, discovery, connection, direct-message, group, event, RSVP, and event-chat checks on a physical Android device before counting the cross-platform gate as complete. A typecheck is not device verification.

## 4. Gate decision

- **PASS:** checks and flows above have repeatable evidence; no migration or security check is outstanding.
- **FAIL:** any reproducible defect, wrong response, missing authorization boundary, or broken live configuration.
- **BLOCKED:** the required Supabase project, verified test account, physical device, or provider access is not available.

Unverified items remain blocked; do not silently mark them complete.

## 24 October 2026 implementation update
`pnpm --filter @sp/api exec vitest run test/core-loop.test.ts` exercises real route validation, authentication/session handling and SQL through the complete connection/community journey against PGlite. Only provider token verification is replaced. This is automated API integration evidence, not browser, hosted Realtime or physical-device evidence.

Live read-only HTTPS inspection confirmed migrations 0001–0010 applied. New migrations 0011–0012 and `docs/supabase-pilot-security.sql` remain unapplied from this cloud machine because direct PostgreSQL connectivity times out. `/ready` now checks the release migration ledger and pilot security function, so deploying new code before applying its schema/security requirements correctly reports not ready. Apply the pilot security file LAST after all earlier Supabase security files. Re-running older files afterward can restore permissive policies: rerun setup-check and the pilot security file.
