# Sidle Superb 88 — implementation ledger

> Updated 25 October 2026: the latest user direction supersedes the earlier low-pressure-only and media-deferral principles. The current release handover is [PLATFORM_RELEASE_HANDOVER.md](PLATFORM_RELEASE_HANDOVER.md).

This ledger maps every recommendation in `Documents/sidle_superb_product_vision_88.md` to the product/code reality after the coordinated web transformation. It deliberately distinguishes code shipped now, mature capability that already existed, principles that should *not* become features, and work that requires a real provider/schema/native/human gate.

Status key: **NEW** = implemented or materially upgraded in this pass; **EXISTING** = already implemented and retained/reused; **PARTIAL** = useful foundation exists but the complete idea needs more product/backend work; **PRINCIPLE** = deliberate product constraint, not a feature to manufacture; **GATE** = cannot be honestly completed from repository code alone.

| # | Status | Implementation reality |
|---|---|---|
| 1 | **NEW** | `superb-design.css`, `superb-pages.css`, `superb-components.css` and `plans-polish.css` establish a coordinated final-cascade design system. |
| 2 | **NEW** | New Sidle visual tokens, calmer layered surfaces, stronger typography/media hierarchy, deliberate motion and dark-mode values. |
| 3 | **NEW** | The existing five-destination web nav becomes a safe-area-aware fixed bottom navigation on phone widths while desktop/tablet retain wider navigation. |
| 4 | **NEW** | Phone/tablet/desktop compositions now reflow intentionally; Discover, connections, pages and messaging receive breakpoint-specific treatment. |
| 5 | **NEW** | Discover gets the strongest visual treatment plus recommendation context, search, filters, save/hide/undo and clearer media hierarchy. |
| 6 | **NEW/PARTIAL** | Discover filters now include persisted intent as well as shared interests, social style and saved introductions. Optional campus/course/year fields exist; authoritative campus-wide ranking/filtering remains additional search work. |
| 7 | **NEW** | Account-synced intent and expiring availability are edited in Settings and shown only to eligible audiences. They no longer dominate the main app. |
| 8 | **NEW** | Optional preset availability persists with server-generated expiry (1 hour to 7 days), clear/save controls and audience enforcement. Expired status is omitted on reads; it never represents online presence. |
| 9 | **NEW + EXISTING** | Plans reuse the existing time/place/capacity/RSVP/waitlist/chat model, with connection invitations, an Activity inbox and escaped UTC .ics calendar export. |
| 10 | **EXISTING/PARTIAL** | Groups already support activities, area, capacity, membership, moderators and events. Featured/trending ranking remains future ranking work. |
| 11 | **EXISTING** | Web onboarding is already progressive across profile basics/social style, interests, prompts and privacy. The new visual system improves that same path rather than duplicating it. |
| 12 | **EXISTING** | Profile preview already includes friendly completeness guidance and explicitly says Sidle does not rank people by completion. |
| 13 | **NEW** | Profile now opens as a dashboard with identity, bio, actual post/follow counts, Posts/Photos/About tabs and explicit Edit/Settings actions. Optional profile details have a shared public/connections/private audience. |
| 14 | **EXISTING** | Prompt catalogue/answers already drive profiles and connection starters. |
| 15 | **NEW + EXISTING DATA** | Discover now exposes “Why you’re seeing this” using the existing positive recommendation-reason contract and shared interests. |
| 16 | **EXISTING** | Connection requests already support structured/preset or permitted custom introductions via `SayHi` and starter APIs. |
| 17 | **NEW** | Private connection labels now sync to the account through preferences; the old browser-local limitation is removed. |
| 18 | **NEW** | Rich messaging has a private metadata contract, attachment uploads, voice recording, replies, reactions, 15-minute edits, deletion tombstones, stable retry IDs and preserved conversation history. Native legacy messaging and richer push delivery have remaining parity work. |
| 19 | **EXISTING** | Structured starters already reduce first-message awkwardness before/at connection. |
| 20 | **NEW** | Browser voice-note recording and audio attachments are implemented with explicit microphone permission, size/duration caps and track teardown. Physical-device recording remains unverified. |
| 21 | **NEW** | Private Activity inbox combines connection requests/acceptance, messages, reactions, comments, follows, calls and Plan invitations, with read/all-read actions. |
| 22 | **NEW/PARTIAL** | Global server search returns eligible people, communities and upcoming Plans. Conversation-name search remains local; indexed full-text search of messages is not shipped. |
| 23 | **NEW** | Accessible `Cmd/Ctrl+K` command palette provides fast desktop navigation to core destinations, safety and admin. |
| 24 | **NEW + EXISTING** | Discover, connections, admin, Plans/offline and prior screens use action-oriented empty states rather than dead ends. |
| 25 | **NEW/PARTIAL** | Discover receives stable skeleton loading; other mature screens retain existing loading states. A shared Skeleton primitive can replace remaining text loaders later. |
| 26 | **NEW** | Consistent hover/press/transition feedback is added with reduced-motion respect. |
| 27 | **EXISTING** | Messaging already uses optimistic send/idempotent client tags with failure/retry recovery. Other mutations remain intentionally conservative where rollback semantics matter. |
| 28 | **PARTIAL** | Existing consistent notice/status patterns are preserved. A single portal-based toast primitive is not falsely claimed yet. |
| 29 | **PARTIAL** | Existing report/share/dialog surfaces remain; the new command dialog establishes stronger modal semantics. A universal sheet/dialog primitive remains architectural cleanup. |
| 30 | **NEW** | Central Sidle design tokens now define brand, surfaces, ink, radii, shadows, widths and motion. |
| 31 | **PARTIAL** | Shared class patterns now cover cards/controls/avatars/status/empty states, but a formal component-primitives package is not manufactured in this pass. |
| 32 | **NEW** | Visual system relies more on spacing/surfaces and restrained hairlines rather than nested heavy borders. |
| 33 | **NEW** | Larger editorial headers, quieter metadata and clear primary/secondary actions establish stronger hierarchy. |
| 34 | **NEW** | Discover/connection media and avatars carry more visual weight than settings chrome. |
| 35 | **NEW** | Photo-forward profile and publishing surfaces now coexist with public posts, reels, stories and creator profiles. |
| 36 | **SUPERSEDED** | The user explicitly requested reels/video and a public feed. The app now includes a paginated feed and reel player, with manual load-more and no autoplay. |
| 37 | **SUPERSEDED** | Home is now a general social feed plus creation/discovery navigation. Explicit content audiences remain enforced. |
| 38 | **SUPERSEDED** | Following and actual follower/following counts are implemented in creator profiles. |
| 39 | **SUPERSEDED/PARTIAL** | Public post reaction/comment counts and profile follow counts are now available. Discovery ranking continues to explain shared context. |
| 40 | **NEW** | Private introductions now sync to the account with idempotent saves and an independent saved-people view across devices. Privacy/block checks are enforced in Supabase; browser-only historical saves are not silently attributed to an account. |
| 41 | **EXISTING + NEW DOCS** | Discoverability/message/story/activity privacy controls exist; new `/privacy` explains their product intent in plain language. |
| 42 | **NEW/PARTIAL** | Optional handle/pronouns/campus/course/year/website details share one audience selector; posts have their own audience. A separate ACL per individual optional field remains future work. |
| 43 | **NEW + EXISTING** | Report/Block are now visibly reachable from expanded Discover profiles; community/message safety surfaces already existed. |
| 44 | **NEW** | Existing moderation now links to platform operations for content reports, media quarantine/review, ad review, quota controls and opt-in aggregate counters. Optional MFA enforcement is available for platform admin; legacy API admin uses a separate server flag. |
| 45 | **NEW COPY + EXISTING DATA** | Academic-email and trusted signals use honest wording; the UI explicitly avoids equating email confirmation with identity verification. |
| 46 | **EXISTING** | Backend connection/report/message constraints and rate-limit/anti-spam decisions remain authoritative. |
| 47 | **NEW + EXISTING** | Global offline state, message drafts, message retry and safe network degradation are present. |
| 48 | **NEW** | Privacy-safe service worker provides a public offline fallback and intentionally never caches authenticated page HTML. |
| 49 | **NEW** | Browser `beforeinstallprompt` is surfaced respectfully with install/dismiss controls and no invented permission claim. |
| 50 | **NEW + EXISTING** | Superb design tokens provide deliberate dark surfaces; the existing theme preference controls remain. |
| 51 | **EXISTING** | Settings already support System/Light/Dark and persist the device preference. |
| 52 | **NEW + EXISTING** | Reduced motion, forced colors, focus/touch hardening and screen-reader semantics extend the previous accessibility pass. Real assistive-technology testing remains a human gate. |
| 53 | **NEW** | Lazy private media URLs, image re-encoding, conditional LiveKit/QR imports and less frequent hidden/offline-aware polling protect bandwidth. A self-hosted ffmpeg preparation tool preserves originals. |
| 54 | **NEW** | LiveKit client loads only on joining a broadcast; QR generation loads when requested. Shared dependency versions are locked; no paid analytics SDK is loaded. |
| 55 | **NEW** | Profile image processing is retained. Social image uploads are resized to at most 1600 pixels and re-encoded to remove original metadata. |
| 56 | **NEW/GATE** | A manual quarantine/review queue, report workflow, upload pause and storage caps exist. Automated classification, malware scanning and server-side media probing remain a deployment-scale integration. |
| 57 | **NEW + EXISTING** | Existing activation funnel is retained. Explicitly consented bounded account-linked counters now cover app opens, posts, messages and Plan participation; no raw content or location is sent. |
| 58 | **NEW/PARTIAL** | Operations shows database/storage reservations, posts/accounts/reports, upload controls and opted-in counters. Provider bandwidth/billing monitoring and incident operations still need operator setup. |
| 59 | **NEW** | Build-time public UX feature flags gate command palette, install prompt, recommendation tuning and saved introductions; comments make clear they are not authorization. |
| 60 | **NEW/PARTIAL** | Existing diagnostic event seam remains local. First-party opted-in counters are separate; API/provider health and the live guard use structured status. External monitoring and alert ownership remain unconfigured. |
| 61 | **NEW** | `/help` now saves feedback to Supabase with receipts, retry IDs and account limits; `/admin` has a protected review queue. This does not claim staffed support or emergency coverage. |
| 62 | **NEW** | `/whats-new` provides a calm beta release-summary surface without notification spam. |
| 63 | **NEW/PARTIAL** | `/privacy`, `/community-guidelines` and `/help` are branded, linked and honest. Formal legal approval/ownership remains external. |
| 64 | **NEW + EXISTING** | Desktop receives richer multi-column discovery/connection composition while existing desktop messaging layout is retained. |
| 65 | **NEW** | Dedicated tablet breakpoints intentionally move grids/navigation between desktop and phone compositions. |
| 66 | **NEW** | 390px and <=720px rules explicitly protect narrow Android-class web widths. |
| 67 | **PARTIAL** | Responsive layouts avoid fixed viewport assumptions and message drafts survive interaction; physical mobile-keyboard behavior still requires real-device/browser QA. |
| 68 | **NEW** | Mobile bottom navigation/install surfaces use `env(safe-area-inset-*)`. |
| 69 | **PARTIAL** | The mobile app exposes the new responsive features in an embedded first-party hub. Fully native refresh/media/location/calling screens and physical-device verification remain separate work. |
| 70 | **EXISTING** | Profile/group/event sharing surfaces already use native share/copy fallback patterns. |
| 71 | **EXISTING + NEW** | Core web aliases/deep-entry routes exist; `/plans` is now a native entry. Mobile handoff remains part of native link validation. |
| 72 | **GATE** | Universal Links/App Links require the signed native app/domain association and physical-device validation. |
| 73 | **NEW** | Share QR codes are generated locally with qrcode; the external QR image request is removed. Clipboard failure is reported honestly. |
| 74 | **NEW** | Precise live location is explicitly opt-in, restricted to selected current connections, bounded to 15/30/60 minutes, revocable and excluded from public discovery. Permissions Policy permits browser consent on first-party pages. |
| 75 | **EXISTING + NEW COPY** | Plans/events persist `generalArea`; new Plans/privacy copy reinforces public/general locations rather than private addresses. |
| 76 | **NEW** | Plan details export RFC-style UTC calendar events with value escaping and UTF-8 line folding. |
| 77 | **EXISTING + NEW UI** | Incoming and outgoing hello/request views already exist; outgoing requests can now also be withdrawn from the web UI. |
| 78 | **NEW** | Discover Hide has a seven-second Undo window; backend ignore is committed only after the undo window or component cleanup. |
| 79 | **NEW** | Search, social-style/shared/saved filters, Hide and profile-tuning links give explicit recommendation controls. |
| 80 | **NEW** | “Why you’re seeing…” presents positive existing ranking reasons. |
| 81 | **NEW + EXISTING** | Recommendation explanations are surfaced while the underlying positive-reason contract remains transparent and privacy-safe. |
| 82 | **EXISTING** | Friendly profile-completion guidance exists without addictive streaks or social ranking. |
| 83 | **PRINCIPLE** | Aggressive daily-use streak mechanics are explicitly excluded from the product vision and remain absent. |
| 84 | **NEW** | The signed-in default is Feed, with direct destinations for media, Activity, search, calls/location, creation, Plans and profile. |
| 85 | **EXISTING + NEW UI** | Progressive onboarding → interests/prompts/privacy → contextual Discover → structured hello already forms the first-value loop; the refresh strengthens the destination. |
| 86 | **UPDATED** | Sidle now combines connection discovery, communities and Plans with general social publishing/creation. Low-pressure introductions are optional in Settings, not the brand promise. |
| 87 | **SUPERSEDED/GATE** | The user requested broader social-media capabilities. Code for publishing, media, calls, streaming and commerce is included. Provider accounts, licensing, hardware, moderation operations and real-device evidence remain explicit gates. |
| 88 | **NEW** | Discover, Connections, Plans, global product chrome, trust pages and operations now share one coordinated Sidle design/product layer instead of another isolated CSS patch. |

## Database/migration decision

The visual transformation reused the existing portable models (migrations 0001–0015). The subsequent persistence work adds `supabase/migrations/202610240001_social_context.sql` for the genuinely new concepts in #7, #8, #40 and #61, without duplicating existing profile/community/message models.

The new migration is applied to the configured Supabase project and verified with the same rollback-only authorization/expiry/retry/erasure probes used in automated PostgreSQL tests. Its private checksum ledger is independent of the portable API ledger, preserving the existing API's exact-ledger readiness check. See [implementation and evidence](../docs/supabase-product-persistence.md). Native controls, cross-device connection labels and other remaining concepts retain their separate scopes.

## External/human gates that remain gates

- Provider-backed SMTP/password-reset/signup delivery evidence.
- Supabase plan-dependent leaked-password protection if the project tier still blocks it.
- Backups/PITR and a real restore drill.
- Real external observability/analytics destination and data-retention decision.
- Formal support contact, moderation staffing/escalation ownership and approved legal policy text.
- Screen-reader/keyboard/browser/device QA evidence, especially mobile virtual-keyboard and native safe-area behavior.
- Native Expo builds, Android signing, App/Universal Links and real push delivery/device tests.
- Any future automated media moderation provider and policy.

These are intentionally not represented as completed simply because code can mention them.
