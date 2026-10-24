# Sidle Superb 88 — implementation ledger

This ledger maps every recommendation in `Documents/sidle_superb_product_vision_88.md` to the product/code reality after the coordinated web transformation. It deliberately distinguishes code shipped now, mature capability that already existed, principles that should *not* become features, and work that requires a real provider/schema/native/human gate.

Status key: **NEW** = implemented or materially upgraded in this pass; **EXISTING** = already implemented and retained/reused; **PARTIAL** = useful foundation exists but the complete idea needs more product/backend work; **PRINCIPLE** = deliberate product constraint, not a feature to manufacture; **GATE** = cannot be honestly completed from repository code alone.

| # | Status | Implementation reality |
|---|---|---|
| 1 | **NEW** | `superb-design.css`, `superb-pages.css`, `superb-components.css` and `plans-polish.css` establish a coordinated final-cascade design system. |
| 2 | **NEW** | New Sidle visual tokens, calmer layered surfaces, stronger typography/media hierarchy, deliberate motion and dark-mode values. |
| 3 | **NEW** | The existing five-destination web nav becomes a safe-area-aware fixed bottom navigation on phone widths while desktop/tablet retain wider navigation. |
| 4 | **NEW** | Phone/tablet/desktop compositions now reflow intentionally; Discover, connections, pages and messaging receive breakpoint-specific treatment. |
| 5 | **NEW** | Discover gets the strongest visual treatment plus recommendation context, search, filters, save/hide/undo and clearer media hierarchy. |
| 6 | **NEW** | Current introductions can be searched and filtered by shared passions/social style/saved state. Server-wide faculty/year/campus filters need those authoritative fields first. |
| 7 | **NEW** | Account-synced social intent now has a dedicated Supabase contract and Discover editor: up to three choices, connections-only by default, with explicit discovery sharing. Profile privacy and blocks apply. |
| 8 | **NEW** | Optional preset availability persists with server-generated expiry (1 hour to 7 days), clear/save controls and audience enforcement. Expired status is omitted on reads; it never represents online presence. |
| 9 | **NEW + EXISTING** | Existing `CommunityEvent` already had time, general area, capacity, RSVP/waitlist, sharing and attendee chat. It is promoted to a first-class native `/plans` product route instead of duplicating the schema. |
| 10 | **EXISTING/PARTIAL** | Groups already support activities, area, capacity, membership, moderators and events. Featured/trending ranking remains future ranking work. |
| 11 | **EXISTING** | Web onboarding is already progressive across profile basics/social style, interests, prompts and privacy. The new visual system improves that same path rather than duplicating it. |
| 12 | **EXISTING** | Profile preview already includes friendly completeness guidance and explicitly says Sidle does not rank people by completion. |
| 13 | **EXISTING + NEW UI** | Saved media, prompts, interests, social styles and privacy context already exist; the new design makes people/media more visually dominant. |
| 14 | **EXISTING** | Prompt catalogue/answers already drive profiles and connection starters. |
| 15 | **NEW + EXISTING DATA** | Discover now exposes “Why you’re seeing this” using the existing positive recommendation-reason contract and shared interests. |
| 16 | **EXISTING** | Connection requests already support structured/preset or permitted custom introductions via `SayHi` and starter APIs. |
| 17 | **NEW** | Connections can be privately labeled Friend/Classmate/Study/Sport/Networking/Other; labels are deliberately browser-local and disclosed as such. |
| 18 | **EXISTING/PARTIAL** | Messaging already has realtime resync, optimistic send, retry, pagination, drafts and resilience. Rich replies/reactions/media need explicit backend contracts before being claimed. |
| 19 | **EXISTING** | Structured starters already reduce first-message awkwardness before/at connection. |
| 20 | **PRINCIPLE** | Voice notes remain deliberately later; text reliability and moderation come first. |
| 21 | **EXISTING/PARTIAL** | In-app unread/request counts and notification preferences exist. A unified multi-domain activity inbox remains a distinct future backend/product surface. |
| 22 | **PARTIAL** | Discover and connections now have contextual search; `Cmd/Ctrl+K` supplies global destination search. True server-wide people/community/message full-text search needs a search API/index. |
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
| 35 | **NEW** | Discover/profile treatment is more photo-forward while explicitly avoiding an influencer feed. |
| 36 | **PRINCIPLE** | Product vision explicitly rejects a TikTok-style endless feed. No such feed is added. |
| 37 | **PRINCIPLE** | Any future home/activity surface is constrained to useful people/community/plan actions rather than passive consumption. |
| 38 | **PRINCIPLE + EXISTING** | Sidle is connection-based; public follower counts are not introduced. |
| 39 | **PRINCIPLE** | Public popularity is intentionally not centered; Discover even explains that recommendation context is not a popularity score. |
| 40 | **NEW** | Private introductions now sync to the account with idempotent saves and an independent saved-people view across devices. Privacy/block checks are enforced in Supabase; browser-only historical saves are not silently attributed to an account. |
| 41 | **EXISTING + NEW DOCS** | Discoverability/message/story/activity privacy controls exist; new `/privacy` explains their product intent in plain language. |
| 42 | **EXISTING/PARTIAL** | Granular profile privacy categories already exist. Per-field audience ACLs would require a larger schema/product model and are not guessed. |
| 43 | **NEW + EXISTING** | Report/Block are now visibly reachable from expanded Discover profiles; community/message safety surfaces already existed. |
| 44 | **NEW + EXISTING API** | `/admin` provides an admin-only moderation queue and report resolution UI backed by existing protected report APIs. |
| 45 | **NEW COPY + EXISTING DATA** | Academic-email and trusted signals use honest wording; the UI explicitly avoids equating email confirmation with identity verification. |
| 46 | **EXISTING** | Backend connection/report/message constraints and rate-limit/anti-spam decisions remain authoritative. |
| 47 | **NEW + EXISTING** | Global offline state, message drafts, message retry and safe network degradation are present. |
| 48 | **NEW** | Privacy-safe service worker provides a public offline fallback and intentionally never caches authenticated page HTML. |
| 49 | **NEW** | Browser `beforeinstallprompt` is surfaced respectfully with install/dismiss controls and no invented permission claim. |
| 50 | **NEW + EXISTING** | Superb design tokens provide deliberate dark surfaces; the existing theme preference controls remain. |
| 51 | **EXISTING** | Settings already support System/Light/Dark and persist the device preference. |
| 52 | **NEW + EXISTING** | Reduced motion, forced colors, focus/touch hardening and screen-reader semantics extend the previous accessibility pass. Real assistive-technology testing remains a human gate. |
| 53 | **NEW + EXISTING** | Lazy media loading and preserved layouts improve perceived performance; no large dependency was introduced for the refresh. |
| 54 | **NEW PRINCIPLE IN CODE** | The refresh is dependency-free CSS/React rather than importing a heavy UI framework. |
| 55 | **EXISTING** | Web profile upload code already processes/compresses images via canvas before upload. |
| 56 | **GATE** | Scaled automated image moderation needs a real chosen moderation provider/policy and should not be simulated. |
| 57 | **EXISTING + NEW SURFACE** | Activation milestones and 30-day activation summary already existed; `/admin` now exposes meaningful funnel data to admins. |
| 58 | **NEW/PARTIAL** | Admin dashboard covers activation and safety reports. Broader DAU/API/delivery metrics need first-party telemetry/ops data sources. |
| 59 | **NEW** | Build-time public UX feature flags gate command palette, install prompt, recommendation tuning and saved introductions; comments make clear they are not authorization. |
| 60 | **NEW SEAM/GATE** | Privacy-conscious client telemetry event seam exists and stores only a bounded session diagnostic trail. No external monitoring vendor is silently configured. |
| 61 | **NEW** | `/help` now saves feedback to Supabase with receipts, retry IDs and account limits; `/admin` has a protected review queue. This does not claim staffed support or emergency coverage. |
| 62 | **NEW** | `/whats-new` provides a calm beta release-summary surface without notification spam. |
| 63 | **NEW/PARTIAL** | `/privacy`, `/community-guidelines` and `/help` are branded, linked and honest. Formal legal approval/ownership remains external. |
| 64 | **NEW + EXISTING** | Desktop receives richer multi-column discovery/connection composition while existing desktop messaging layout is retained. |
| 65 | **NEW** | Dedicated tablet breakpoints intentionally move grids/navigation between desktop and phone compositions. |
| 66 | **NEW** | 390px and <=720px rules explicitly protect narrow Android-class web widths. |
| 67 | **PARTIAL** | Responsive layouts avoid fixed viewport assumptions and message drafts survive interaction; physical mobile-keyboard behavior still requires real-device/browser QA. |
| 68 | **NEW** | Mobile bottom navigation/install surfaces use `env(safe-area-inset-*)`. |
| 69 | **GATE/PRINCIPLE** | Pull-to-refresh belongs to the native Expo phase and is not simulated on web. |
| 70 | **EXISTING** | Profile/group/event sharing surfaces already use native share/copy fallback patterns. |
| 71 | **EXISTING + NEW** | Core web aliases/deep-entry routes exist; `/plans` is now a native entry. Mobile handoff remains part of native link validation. |
| 72 | **GATE** | Universal Links/App Links require the signed native app/domain association and physical-device validation. |
| 73 | **PARTIAL** | Share links exist; QR rendering is not added via an unreviewed third-party tracking service or heavyweight dependency. |
| 74 | **PRINCIPLE + EXISTING** | Permissions Policy disables browser geolocation and Plans use general-area text; exact live location is not exposed. |
| 75 | **EXISTING + NEW COPY** | Plans/events persist `generalArea`; new Plans/privacy copy reinforces public/general locations rather than private addresses. |
| 76 | **PARTIAL** | Events already have calendar-grade start/end data; explicit device-calendar export remains a small future interaction because it belongs inside the event-detail component. |
| 77 | **EXISTING + NEW UI** | Incoming and outgoing hello/request views already exist; outgoing requests can now also be withdrawn from the web UI. |
| 78 | **NEW** | Discover Hide has a seven-second Undo window; backend ignore is committed only after the undo window or component cleanup. |
| 79 | **NEW** | Search, social-style/shared/saved filters, Hide and profile-tuning links give explicit recommendation controls. |
| 80 | **NEW** | “Why you’re seeing…” presents positive existing ranking reasons. |
| 81 | **NEW + EXISTING** | Recommendation explanations are surfaced while the underlying positive-reason contract remains transparent and privacy-safe. |
| 82 | **EXISTING** | Friendly profile-completion guidance exists without addictive streaks or social ranking. |
| 83 | **PRINCIPLE** | Aggressive daily-use streak mechanics are explicitly excluded from the product vision and remain absent. |
| 84 | **PARTIAL** | Discover remains the signed-in shell home while Plans/command navigation improve breadth. A combined home dashboard is not rushed in without usage evidence. |
| 85 | **EXISTING + NEW UI** | Progressive onboarding → interests/prompts/privacy → contextual Discover → structured hello already forms the first-value loop; the refresh strengthens the destination. |
| 86 | **NEW/PARTIAL** | Low-pressure discovery, real Plans and persisted social intent/expiring availability now form a shared connection model. Native UI/device delivery and pilot evidence remain separate gates. |
| 87 | **PRINCIPLE** | The product vision intentionally avoids cloning every Instagram/TikTok feature; the implementation adds connection utility rather than an engagement feed. |
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
