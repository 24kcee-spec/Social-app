# Sidle handover — 26 October 2026

Current release and exact boundaries: [production-release.md](production-release.md). Current summary: [status.md](status.md). Original findings: [audit](product-audit-2026-10-26.md).

The interaction release fixes live chat mutations, scroll/draft/retry behavior, shared navigation, invisible filters, Settings history/draft protection and safe return destinations. It adds indexed conversation tools, a private durable push queue, encrypted Storage backup tooling and scheduled deployment checks. Both additive Supabase migrations are applied; both migration ledgers/checksums and live rollback-only authorization probes pass. Portable ledger remains 0001–0015; the independent product ledger has seven entries.

Existing credentials and production data are preserved. Never edit an applied migration or expose private tables to make subscriptions easier. Never put Management/service/SMTP/backup identity secrets in clients or Git. CI browser builds use synthetic public fixture values and must not be deployed as the production build.

SMTP, actual device builds/push, offsite restore, optional calls/live/commerce credentials and operational ownership remain external gates. No claim of physical delivery, a real broadcast/payment or a real-user disaster-recovery restore is made. Use the read-only production audit and the documented operator commands; do not close manual evidence gates with unit-test results.
