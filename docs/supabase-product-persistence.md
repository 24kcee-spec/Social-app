# Supabase product persistence — 24 October 2026

This continues recommendations 7, 8, 40 and 61 in `Documents/sidle_superb_88_implementation_status.md`.

## Shipped contracts

- Social intent: up to three explicit choices, saved to the signed-in account. Connections-only is the default audience; discovery visibility requires an explicit selection. Profile privacy, active accounts and mutual blocks remain authoritative.
- Availability: preset, optional context with a server-generated expiry of 1 hour, 24 hours, 3 days or 7 days. Expired values are omitted on reads; this never represents live presence. Clearing and saving removes availability immediately.
- Saved introductions: private, idempotent account-owned saves, with an independent saved-people view across devices. Privacy and blocks are rechecked on reads. Blocking removes saves in both directions; unblocking does not restore them. Up to 500 saves per account. The old browser-local save collection is not automatically imported because it has no reliable account ownership; members can explicitly save those introductions again.
- Feedback: durable submissions with a receipt, stable retry IDs and a five-per-24-hour account limit. Admin-only queue/review controls are in `/admin`. Feedback is removed on account anonymization. The form does not promise staffed support or emergency response; abuse reports keep their existing safety workflow.

`@sp/profile-client` exposes the same authenticated RPC client to web/native consumers. Web controls ship now; native UI/device evidence remains a separate gate. Private connection labels still use their existing browser-only storage.

## Migration and authorization

`supabase/migrations/202610240001_social_context.sql` is an additive Supabase-specific migration. Tables and definer implementations live in unexposed `app_private`; tables have RLS and no client table privileges. Public wrappers are invoker functions. Each privileged entry point verifies the current Auth identity and active Sidle session internally. Owners are never accepted as input. Anonymous execution, arbitrary helper access and non-admin queue access are denied.

The Supabase RPC layer uses its own checksum ledger, `app_private.product_migrations`. The existing portable API ledger remains exactly 0001–0015, preserving compatibility with the deployed Render API's exact-ledger readiness check. This is intentional independent versioning, not a missing portable migration. The deployment applies no backfill or edits to existing production records. Account-anonymization/block triggers operate only on the new product tables.

```bash
# Inspect (default is read-only)
python scripts/supabase-product-maintenance.py

# Apply only after reviewing pending files; each migration and checksum commit together
python scripts/supabase-product-maintenance.py --apply

# Rollback-only live checks; all synthetic records are removed by rollback
python scripts/supabase-product-maintenance.py --verify

# Existing portable-schema/security checks remain independent
python scripts/supabase-maintenance.py --verify-rls
```

Never edit an applied file or erase its ledger entry. A correction requires a new additive migration. To roll back application behavior, deploy the prior web version; the dormant additive tables do not prevent it from running. Keep `app_private` outside the exposed Data API schemas.

## Deployment configuration

Browser calls to the existing Fastify API now use the same-origin `/api/sidle/*` rewrite. This makes preview hosts functional without weakening the API's exact-origin CORS list. The configured `PUBLIC_API_URL` remains the upstream; bearer authentication and authorization still run in Fastify. Proxied responses explicitly use `private, no-store`. Supabase RPCs use only the publishable key and current user JWT.

The existing Vercel `PUBLIC_API_URL` and `SUPABASE_PUBLISHABLE_KEY` bindings now include preview alongside production. Their values were preserved; no privileged runtime/Management credentials were added to Vercel or client bundles.

## Verification

- Portable migrations and Supabase migration inventory are checked by `pnpm verify:migrations`.
- The entire Supabase product migration and `scripts/verify-supabase-product.sql` run on PGlite in the API suite. The same rollback-only script passed on the live project.
- Checks cover context persistence/default audience, private/connected/blocked visibility, expiry, own saves, repeated saves, feedback idempotency/conflicts/input limits/rate limits, admin read/review, direct-table/helper denial, anonymous/revoked/deleted sessions and anonymization cleanup.
- Existing live membership/Storage/RLS checks pass independently. The portable ledger is unchanged; hosted `/ready` returns 200 with configuration/database/schema checks passing.
- Production counts before/after migration and SQL probes match: two users, two profiles, ten messages, one group, one event and two Auth users.
- Nine live browser/API checks passed on the production web build, using two isolated real Auth accounts: onboarding, actual PostgREST defaults, context save, permitted availability on a 390px Discover view, private saves, recovery in a separate browser context, removal, feedback receipt and admin review. No uncaught browser errors occurred in the tested flow. All owned Auth/application fixtures were removed and original counts restored. The cloud browser used a transport adapter through the certificate-verified session proxy; API/RPC responses and database writes were real. This is not physical-device or screen-reader evidence.
- The Vercel preview for the implementation commit is READY. Authenticated preview `/api/sidle/ready` returns HTTP 200 with all checks passing and `Cache-Control: private, no-store`, validating the deployed rewrite rather than relying on its configuration alone. Final CI/deployment checks are required for the exact head before merging.

SMTP delivery, plan-dependent leaked-password protection, backup/restore drills, physical devices, native push and staffed pilot operations remain the gates documented in `status.md`.
