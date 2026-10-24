# Sidle — implementation and remaining release work

Updated: 24 October 2026. This is the current status; older phase handovers and the 22 October audit are historical snapshots. Implementation phases and audit phases use different numbering, so remaining work is named below.

## Implemented in the readiness branch

1. Academic-email ownership: Supabase confirms the current primary email; it must match the account/request and an explicitly supported institution. No badge from an entered address, arbitrary institution label, student ID or editable JWT metadata. Migration 0011 resets unproven legacy badges and invalidates evidence when email changes. Badge means email access, not enrollment/identity.
2. Remote PostgreSQL TLS verifies the chain/hostname. Optional `DATABASE_CA_CERT_PATH` supplies a provider CA; URL options cannot disable verification.
3. Account removal is transactional, anonymizes contact/profile data, releases RSVP seats and queues durable Storage/Auth cleanup. Owners must delete owned groups first. Old tokens cannot repopulate deleted contact data. Historical messages/reports and provider backup retention are explicitly distinguished from removal.
4. Supabase pilot security makes profile/report writes API-only and uses restrictive active-account/session policies for private reads and Storage access. This prevents direct-client badge forgery and old JWTs bypassing revocation/deletion.
5. API readiness checks the exact release migration ledger, security function and restrictive policies. An incomplete deployment reports 503 rather than ready.
6. Automated multi-account API journey covers onboarding, discovery, connection acceptance/authorization, direct-message idempotency/read receipts, groups, event waitlist promotion/chat, share preview, block/report and session revocation. Real routes/stores/SQL run against PGlite; provider token verification is substituted.
7. Android/native links use the configured HTTPS web domain and actual signing identities. EAS builds validate the linked project UUID. Missing signing identities produce empty association documents instead of placeholder certificates/team IDs.
8. Web privacy/account destinations render dedicated screens within the existing URL-backed navigation contract. Privacy supports save/discard and blocked-account management; Account includes password reset, sessions and accurate removal consequences.
9. Mobile profile drafts support one Save/Discard flow, validation, preserved interest strengths, partial-save recovery and guarded navigation/Android Back. Immediate photo operations remain separate. Both editors retain newer edits made during an in-flight save.
10. Expo message push is opt-in (`PUSH_PROVIDER=expo`, default disabled). Device permission/registration/rotation/unregistration, session-scoped tokens, notification-tap lookup, HTTP/ticket checks, batching and durable receipt processing are implemented. DeviceNotRegistered removes dead tokens. Ambiguous sends are not blindly retried. Provider acceptance does not prove the phone displayed an alert. Connection-request and browser push remain unsupported and are labeled accordingly.
11. The fake mobile photo-attachment button is removed. Direct chat remains text-only; migration 0010 alone does not make image messages work.

## Validation observed here

- Frozen-lockfile install succeeded and was repeated successfully using pnpm 9.15.4.
- `pnpm verify`: **416 tests passed** (API 305, profile-client 58, auth-client 17, validation 27, config 7, design tokens 2); all workspace typechecks passed. Runtime: Node 24.19.0, compatible with `engines >=22`; CI remains pinned to Node 22.
- Next.js production build passed with Sidle assets and metadata.
- Mobile build-config guards passed; Expo public config resolved with the notification plugin. Use `EXPO_NO_TELEMETRY=1 CI=1` in cloud shells without a writable user home.
- Local production web `/`, `/reset`, association documents and API `/health` responded correctly. Protected profile/delivery endpoints rejected unauthenticated requests (401).
- `/ready` correctly returned 503: direct PostgreSQL TCP connections timed out. This is a blocked live-readiness check, not a pass.
- Supabase HTTPS health succeeded through the platform proxy. A read-only HTTPS query confirmed live migrations **0001–0010** applied. No new live migrations/security files were applied here.
- No physical Android/iOS, hosted two-account browser/Realtime, actual push or EAS remote-build evidence is claimed. PowerShell scripts were not run on Windows PowerShell 5.1 here.

## Remaining work, in order

1. **Deployment prerequisite — establish verified PostgreSQL connectivity.** Use a machine/deployment with a supported route to the intended database; supply the provider CA if necessary. Do not weaken TLS. Review pending migrations, then apply **0011–0013** and run `docs/supabase-pilot-security.sql` LAST after older Supabase security scripts. 0011 resets unproven badges; 0013 clears legacy unscoped push tokens. Run setup-check and require `/ready` 200 before deploying this API release to users. Confirm cleanup workers have server-only `SUPABASE_SECRET_KEY` and can finish a dedicated throwaway removal job.
2. **Live web evidence — run the manual two-account checklist.** Complete `docs/phase1-live-gate.md` against the intended deployment: provider signup/reset, saved profile/visibility, browser settings/history/unsaved drafts, connection, actual Realtime/reconnect/read receipts, group/event/RSVP, block/report, revocation and throwaway-account removal. Record PASS/FAIL/BLOCKED per case. Automated PGlite tests do not replace it.
3. **Android/device evidence — build the linked EAS preview.** Configure `EAS_PROJECT_ID`, public HTTPS service URLs and publishable key in EAS preview, build/install the APK, and repeat the core flows on a physical phone. Verify new native dependencies, keyboard/photo permissions, Android Back, cold/warm app links and signing associations. Final Android/iOS release IDs and signing values must match deployed association documents.
4. **Push delivery evidence — configure the actual provider project.** Supply Expo FCM v1/APNs credentials, optionally the server's Expo access token if enhanced push security is enabled, then enable `PUSH_PROVIDER=expo`. Verify foreground/background/closed-app delivery, notification taps, preference-off behavior, rotation, shared-device sign-out and session revocation. Monitor receipt outcomes. Do not enable production push solely because unit tests pass.
5. **Pilot operations — complete the operator-owned launch gate.** D-007's admission rule is still open; no invite-only/campus-admission gate is falsely claimed implemented. Publish the actual eligibility, privacy/retention, terms, community rules and support contact; assign moderation coverage and response targets. Verify backup restore and deployed monitoring, then test accessibility, narrow screens, low bandwidth and failure/retry paths with real accounts. Use existing activation metrics and record retention/report/crash evidence during a controlled pilot.
6. **Post-pilot backlog.** Use pilot evidence before implementing posts/feed. Stories/reels/music/monetization remain deferred by the product roadmap. Media messaging, connection-request push and browser push are explicit separate features, not release capabilities hidden behind incomplete controls.

## Runtime configuration

Keep server secrets out of clients. Existing Supabase/database bindings are reused; no credentials belong in committed files. `.env.example` contains names/placeholders only.

- `DATABASE_CA_CERT_PATH`: optional provider PEM CA path for verified remote Postgres.
- `PUSH_PROVIDER`: `disabled` or `expo`; disabled by default.
- `EXPO_ACCESS_TOKEN`: optional server-only Expo enhanced push security token.
- `SUPABASE_SECRET_KEY`: server-only Storage/Auth cleanup worker credential.
- `EAS_PROJECT_ID`: linked Expo project's UUID for native preview/production builds.
- `PUBLIC_WEB_URL`, `MOBILE_API_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: actual public configuration for installed clients.
- Web association identities: `ANDROID_PACKAGE`, comma-separated `ANDROID_SIGNING_SHA256`, `APPLE_TEAM_ID`, `IOS_BUNDLE_IDENTIFIER`. Keep native build identifiers aligned.

The cloud install/start configuration is saved separately as an environment draft; saving it does not deploy code, apply database migrations or publish a snapshot.
