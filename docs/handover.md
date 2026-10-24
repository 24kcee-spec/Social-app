> **Live Supabase follow-up:** Migrations 0001–0015 and final policy hardening are applied and verified. See [supabase-live-validation.md](supabase-live-validation.md). Tests now total 427. Hosted API CA rollout, custom SMTP, provider-plan-blocked leaked-password protection and real-device gates remain separately tracked.

# Sidle handover — 24 October 2026

The canonical implementation status, test evidence, configuration requirements and ordered release backlog are in [status.md](status.md). The older build-phase documents are historical and must not override current code or live evidence.

Current development branch: `fix/sidle-pilot-readiness`, based on Sidle branding commit `2402b18` from `main`.

Delivered: confirmed academic-email proof; verified remote database TLS; transactional account anonymization with durable Storage/Auth cleanup; restrictive Supabase account/session policies; schema/security readiness; multi-account API integration; configuration-driven native links; dedicated web privacy/account screens; mobile profile-draft recovery/navigation guards; optional Expo message push, session-scoped tokens and receipts; removal of the pretend photo attachment control.

Validation: 416 tests and all workspace typechecks pass; Next.js production build and mobile config/Expo resolution pass. Local web/API startup and access-control responses were checked. PostgreSQL TCP connectivity timed out, so readiness is correctly 503. Supabase HTTPS is reachable and the live ledger records migrations 0001–0010. Migrations 0011–0013 and the final pilot security SQL remain unapplied here. Physical devices, actual push and hosted browser/Realtime gates remain unverified.

Next: verified DB route/CA → review/apply migrations 0011–0013 → apply `supabase-pilot-security.sql` LAST → setup-check and `/ready` → two-account browser gate → EAS APK/physical Android → actual push → pilot admission/operations gate. See status.md for exact evidence requirements.

Do not change unrelated projects or commit local `.agents/`, `skills-lock.json`, credentials or generated outputs. Use the existing cloud checkout; each task is isolated and needs no Git worktree unless requested. Keep Windows PowerShell 5.1 compatibility for existing operator scripts.
