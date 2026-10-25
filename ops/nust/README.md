# NUST hosting handover

This is an optional deployment template, not a claim that NUST has supplied infrastructure. Keep the existing Supabase project initially: moving web/API/relay does not require rewriting the product or migrating production records. Full self-hosted Supabase is a separate operational migration; use the [official maintained stack](https://supabase.com/docs/guides/self-hosting/docker) and rehearse Auth, Storage, Realtime, extensions, grants, backups, domains and key rotation on an isolated copy before cutover. The additive product SQL requires Supabase Auth/Storage roles and schemas; a bare PostgreSQL database is insufficient.

## Prepare a host

Use a supported Linux server, Docker Engine/Compose, a static public IP, HTTPS domains, encrypted persistent volumes, an operator with patching responsibility, outbound email/network access and a bandwidth budget. No sizing promise can be made without expected concurrent users, bitrates and measurements. Do not put media on Render's ephemeral filesystem or run ffmpeg inside Vercel request functions.

1. Clone a reviewed release SHA. Set `SIDLE_SERVER_ENV_FILE` to an absolute, root-owned mode-600 env file **outside** the repository. Start from `.env.example`; copy existing service bindings through a secure secret manager. Do not put privileged keys into mobile/public build variables. Public Supabase URL/key are required at web build time; other credentials are runtime-only.
2. Configure `WEB_DOMAIN`, `PUBLIC_WEB_URL`, `SUPABASE_URL`, publishable/server keys, `DATABASE_URL`, CA trust and API CORS. Use the server database role expected by the current API. Never turn TLS verification off. The web same-origin `/api/sidle/*` proxy connects to `api:4000`; the API needs no public port.
3. Run `docker compose --env-file /secure/sidle.env -f ops/nust/compose.yml config --quiet`, then build/deploy the default web/API/proxy services. Verify `/api/sidle/ready`, sign-in redirects, profile/media ACLs and the release browser probes. Docker templates were configuration-checked, not deployed on NUST hardware.
4. In Supabase Auth, register the new HTTPS site/redirect URLs while retaining the old domain during transition. Align Expo/App Links, signing identities and email templates. Do not rotate keys, delete the managed project, replace user IDs or reseed production data.
5. Lower DNS TTL before an actual domain cutover, retain the previous deployment for rollback, and monitor logs/quotas. The app's private signed URLs continue to reference the same Supabase project.

## Calling and live streaming

Copy `turnserver.conf.example` into a private server path, choose the real public IP/realm, set a strong shared secret matching the web runtime, and configure firewall/NAT. The example denies private relay destinations, bounds allocations and bitrate, and exposes authenticated TURN on 3478 plus relay UDP 49160–49200. Use trusted certificates for TURN/TLS on 5349. Test across cellular/Wi-Fi/NAT; local success does not prove relay reliability. Configure `TURN_URLS` and `TURN_SHARED_SECRET`; leave `CALL_ICE_MODE=disabled` unless deliberately accepting direct peer IP exposure. Calling defaults to relay-only when TURN is configured.

Optional LiveKit uses the realtime Compose profile, a WSS HTTPS domain through Caddy, TCP 7881 and UDP 50000–50100. Set strong API key/secret, `LIVEKIT_URL=wss://…`, `LIVEKIT_MAX_PARTICIPANTS`, and start `live-guard`. The guard checks active rooms, members, exact app sessions, blocks and expiry every 30 seconds; failed guard heartbeats prevent new grants after 90 seconds. Set `LIVEKIT_GUARD_ENABLED=true` only with this service running. Keep credentials off clients. Watch provider/host egress: 1 Mbps for one hour is about 450 MB **per outgoing stream**, before overhead. Twenty viewers are roughly 9 GB/hour. Configure network caps, capacity and operator alerts accordingly.

The current code supports hosted one-to-many live rooms with one publishing host and a 2-hour maximum. It does not record or rebroadcast copyrighted TV/radio/catalogues. LiveKit joins/publishing and remote device media require live infrastructure verification. Membership removal has the guard's polling delay; previously viewed/downloaded content cannot be recalled.

## Video and music preparation

The deployed product serves private progressive MP4/WebM/audio files with native controls, lazy loading, short signed URLs and no autoplay. It does not claim adaptive HLS/DASH transcoding. Run `python3 scripts/prepare-media.py input.mp4 /private/new-output-directory` on a machine with ffmpeg/ffprobe to produce a compatible H.264/AAC MP4 with fast-start and a poster before upload. This strips source metadata and preserves the original. Source uploads are capped, and duration metadata is client-reported; hardened server media probing/virus scanning and an automated transcoding queue remain production-scale work.

Image uploads are resized to at most 1600 pixels on their longest side and re-encoded without source metadata. Music supports original/licensed uploads and private playlists; a commercial catalogue, music-in-video licences, royalty accounting and distribution agreements cannot be supplied by code or hosting.

## Backup and restore

`backup-platform.sh` requires age, pg_dump, a configured age **public** recipient and a private backup directory; it creates encrypted logical archives over verified PostgreSQL TLS. It does not back up Storage object bytes, external provider secrets or DNS. Add a separate encrypted object mirror with inventory/checksums and preserve Auth signing/configuration secrets in your institution's secret manager. Do not treat a Git push as a database backup.

`restore-scratch.sh` requires a separate empty disposable target and a private age identity; it refuses a nonempty target and never uses `--clean`. Supabase roles/extensions must be provisioned first. Grants/RLS, object bytes, Auth signing and end-to-end probes need a full isolated rehearsal before any real restore. No production restore was run. Define retention, offsite storage, access owners, RPO/RTO and a scheduled restore drill before public scale.

## Payments and email

Eligible commercial hosting and a real merchant account are required before `COMMERCIAL_DEPLOYMENT_APPROVED=true` and `ENABLE_PAYMENTS=true`. Configure Stripe prices, server/webhook keys, server Supabase key and a public HTTPS callback. Subscribe to checkout completion, asynchronous success and `charge.refunded`; configure the Customer Portal. Test declined/abandoned/duplicate/out-of-order/refund events with Stripe test mode before live mode. The server verifies provider state and fixed price IDs; the return URL does not grant credits. No real charge was performed.

Supabase Auth SMTP requires actual provider credentials/domain verification in its own configuration. SMTP/Resend environment presence alone does not configure Auth. Re-enable Expo delivery only after real credentials and physical-device validation; richer RPC messages currently create in-app activity but do not invoke the legacy API's Expo notifier. Web push/connection-request push remain separate delivery work.
