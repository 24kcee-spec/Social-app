# Sidle — Superb Product Vision: 88 Recommendations

> Historical product direction captured on 24 October 2026.
> The later user request explicitly supersedes media/feed/monetization deferrals and makes low-pressure mode optional in Settings. See [current handover](PLATFORM_RELEASE_HANDOVER.md) and the updated implementation ledger.
>
> North star: **Sidle should help people find genuine connections and turn them into meaningful conversations, communities and plans — without becoming an attention-maximizing clone of Instagram or TikTok.**
>
> Brand promise: **Find your people. At your pace.**

This document records the 88 product, UX, platform, safety and engineering recommendations that define the next major evolution of Sidle. Items marked as “product principle” are intentional design constraints rather than features to blindly ship.

## A. Visual identity and responsive foundation

1. **Rebuild the visual system as one design system.** Standardize typography, spacing, radii, shadows, surfaces, buttons, inputs, dialogs, skeletons, avatars and motion instead of continuing isolated CSS patches.
2. **Give Sidle a recognizable visual personality.** Use calm, premium surfaces, strong photography/avatar presentation, memorable accent treatment, restrained gradients, polished dark mode and subtle motion.
3. **Make mobile navigation feel native.** Use a polished bottom navigation pattern on narrow screens, compact desktop navigation on wider screens, safe-area handling, badges and clear active states.
4. **Build true responsive composition.** Components should recompose by breakpoint rather than simply shrink; Messages, Discover, Profiles and Community should intentionally change layout across phone, tablet and desktop.
5. **Make Discover the app’s visual “wow” screen.** Prioritize people, recommendation context, communities and plans in a high-quality discovery experience.
6. **Add richer discovery controls.** Support interests, social style/intent, campus context, communities, new users and mutual-context filtering where data exists and privacy allows.
7. **Introduce a clear social-intent model.** Let people express what kind of connection or activity they are open to, such as study, coffee/chat, gaming, networking, sport or simply browsing.
8. **Support lightweight availability/status.** Allow temporary, user-controlled context such as “open to plans this weekend” without pretending to expose live presence.
9. **Make Plans a first-class concept.** Let people turn a connection into a study session, coffee, game, sport or other small plan with time/place/capacity and invitations.
10. **Improve community discovery.** Add categories, featured/recommended groups, upcoming activity and useful context before joining.

## B. First-run experience and profiles

11. **Make onboarding excellent.** Use progressive steps for interests, social preferences, profile basics, prompts and privacy, followed by immediate relevant discovery.
12. **Add friendly profile-completion guidance.** Encourage useful profile details without ranking people socially or pressuring them.
13. **Make profiles richer and more human.** Prioritize hero media, gallery, prompts, interests, communities, shared context and privacy-respecting public information.
14. **Improve prompt quality.** Prompts should naturally produce conversation starters rather than generic biography text.
15. **Show mutual context everywhere it helps.** Explain shared interests, community overlap and other safe reasons a person is being suggested.
16. **Make connection requests contextual.** Support an optional short note or preset opener when appropriate.
17. **Allow private connection organization.** Private labels such as friend, classmate, study, sport or networking can help users manage relationships without exposing labels publicly.
18. **Make messaging premium-feeling.** Excellent send/retry states, replies/reactions when supported, strong readability, media support when safe, and polished conversation navigation.
19. **Offer contextual conversation starters.** Shared interests/prompts can reduce the awkward first-message problem after a connection is accepted.
20. **Consider voice notes later.** Only add them once text messaging is reliable, moderated and polished.

## C. Activity, search and interaction quality

21. **Build a real in-app activity inbox.** Group connection, message, community, plan and security activity so users understand what needs attention.
22. **Create powerful global search.** Search people, communities, plans/events and conversations with clear category separation.
23. **Add a desktop command palette.** `Ctrl/Cmd + K` should provide fast navigation/search for power users.
24. **Upgrade every empty state.** Explain why the screen is empty and give the next useful action.
25. **Prefer skeleton loading to disruptive spinners.** Preserve layout and reduce perceived waiting.
26. **Add tasteful micro-interactions.** Use subtle hover, press, transition and success feedback without making Sidle noisy.
27. **Use optimistic UI carefully.** Connection actions, saves and messaging should feel immediate while retaining rollback/error recovery.
28. **Standardize transient feedback.** Use one consistent toast/notice pattern for saves, errors and retries.
29. **Standardize dialogs, menus and mobile sheets.** Interaction patterns should be consistent across features.
30. **Create central design tokens.** Colors, spacing, typography, radii, shadow/elevation, breakpoints and motion should be defined once.
31. **Use reusable component primitives.** Button, Input, Avatar, Badge, Card, Dialog/Sheet, Tabs, EmptyState, Skeleton, Toast, Menu, Tooltip, Switch and Select should share behavior and styling.
32. **Reduce excessive borders and nested boxes.** Use spacing, typography and restrained surfaces for hierarchy.
33. **Strengthen visual hierarchy.** Primary content/actions should read instantly; metadata should remain quiet.
34. **Make people visually dominant.** Avatars and profile media should have more visual importance than settings-style chrome.
35. **Make Discover/Profile photo-forward without becoming a feed clone.** Give enough visual context for confidence without turning Sidle into an influencer platform.

## D. Product identity and anti-addiction principles

36. **Do not build a TikTok-style endless feed.** Sidle should optimize for useful connections, not passive consumption.
37. **If an activity/home feed exists, keep it purposeful.** Favor plans, community updates and meaningful actions rather than vanity content loops.
38. **Do not center follower counts.** Connections, context and communities fit Sidle better than popularity metrics.
39. **Consider hiding public popularity metrics entirely.** This supports the “at your pace” promise and reduces social comparison.
40. **Add private saving/bookmarking.** Save communities, plans/events and possibly profiles for later without forcing an immediate connection action.

## E. Privacy, safety and trust

41. **Make privacy defaults a product feature.** Clearly explain discoverability, messaging and visibility boundaries during onboarding and settings.
42. **Support granular visibility where justified.** Future profile fields can have different audiences if the model remains understandable.
43. **Keep blocking/reporting easy to find.** Use consistent overflow actions on people, conversations and community content.
44. **Build a moderation/admin surface before scale requires it.** Reports, actions, audit history and community moderation need an accountable workflow.
45. **Use trust signals carefully.** Academic-email confirmation, account age and mutual context can help, but do not falsely imply identity verification.
46. **Design against abuse and spam.** Rate limits, anti-spam rules and clear UX must protect connection requests, messages and reporting.
47. **Degrade gracefully on bad networks.** Preserve useful cached content/drafts, show pending/retry states and avoid catastrophic screen failures.
48. **Add practical PWA/offline behavior.** Cache the shell where safe, preserve drafts and show a deliberate offline state.
49. **Improve install UX.** Offer a respectful “Install Sidle” affordance when the browser makes installation available.
50. **Design dark mode intentionally.** Surfaces, borders, text, images and elevation need dedicated dark-theme values.
51. **Keep appearance choices simple.** System/light/dark is sufficient initially; avoid distracting theme overload.
52. **Treat accessibility as component behavior.** Focus, keyboard controls, reduced motion, touch target size, screen-reader naming and contrast must be built in.

## F. Performance and media

53. **Improve perceived and actual performance.** Use route/component splitting, image optimization, caching and sensible prefetching.
54. **Protect the initial JavaScript budget.** Avoid large libraries when small focused implementations are enough.
55. **Process user images.** Resize/compress profile media and use thumbnails rather than serving unnecessarily large originals.
56. **Plan for image moderation as usage grows.** User-generated media needs a scalable safety path before large-scale launch.

## G. Analytics, operations and product learning

57. **Measure meaningful product outcomes.** Track signup/onboarding completion, first connection, first conversation, community participation, plan participation and retention rather than vanity page views.
58. **Create a product-health/admin dashboard.** Surface active users, connections, conversations, community activity, reports, API errors and delivery health for operators.
59. **Use feature flags.** Pilot new functionality safely without maintaining separate codebases.
60. **Add observability.** Client failures, API failures, slow operations, external-provider errors and release versions should be traceable without collecting unnecessary personal data.
61. **Add in-product feedback.** Give pilot users a simple way to report bugs or product feedback with useful technical context.
62. **Add a “What’s New” experience later.** Help beta users understand meaningful product changes without notification spam.
63. **Make policy/help surfaces feel like Sidle.** Privacy, terms, community guidance and safety information should be readable, branded and easy to reach.

## H. Desktop, tablet and native-quality interaction

64. **Make desktop genuinely useful.** Use available space for persistent navigation, split messaging and richer discovery rather than a stretched phone layout.
65. **Treat tablet as its own responsive target.** Two-pane layouts and touch-friendly controls should be deliberate.
66. **Test narrow Android-class widths.** The product must remain usable around 320–390px without horizontal scrolling or clipped controls.
67. **Handle virtual keyboards correctly.** Forms and message composers must remain visible and operable when the mobile keyboard opens.
68. **Respect safe areas/notches.** Especially important for the native Expo app and installed web app.
69. **Use pull-to-refresh on native where it adds value.** Discover, Connections, Notifications and Community are sensible candidates later.
70. **Support native sharing where useful.** Profiles, communities and plans/events should be shareable with safe links.
71. **Build excellent deep links.** Links should resolve to the exact people/community/plan/settings destination on web and native where access permits.
72. **Use Universal Links/App Links for native release.** Open the app when installed and gracefully fall back to web.
73. **Consider QR profile sharing.** “Scan my Sidle” is a strong real-world social interaction, especially for campus use.
74. **Treat proximity/location as high-risk context.** Never expose exact live location by default; use coarse, user-controlled context only when a feature truly needs it.
75. **Keep plan locations privacy-aware.** Prefer named public/campus venues and clear audience controls rather than private addresses.
76. **Allow calendar export later.** Plans/events can optionally integrate with device calendars once the core product is stable.

## I. Connections and recommendations

77. **Create a strong connection-request inbox.** Incoming, sent and relevant request state should be easy to understand with profile context.
78. **Support undo for low-risk accidental actions.** Dismiss/archive/remove-type actions benefit from a short recovery window where technically safe.
79. **Let people tune recommendations.** Hide/dismiss suggestions and use explicit preference feedback rather than silently optimizing engagement.
80. **Add “Why am I seeing this?”** Recommendation explanations build trust and reduce the feeling of opaque ranking.
81. **Keep ranking understandable.** Optimize for useful matches and user intent, not purely for time-on-app.
82. **Use only meaningful progress gamification.** Profile setup or joining a first community can be celebrated without turning Sidle into a streak machine.
83. **Do not use aggressive streaks.** Pressure-driven daily-use mechanics conflict with the Sidle promise.

## J. Home, differentiation and execution

84. **Evolve the long-term home screen.** Eventually combine relevant people, upcoming plans, community activity and important messages without building an endless feed.
85. **Design onboarding around first value.** The ideal loop is: join → choose interests/intent → see relevant people → connect → receive useful context → start a conversation.
86. **Define and protect a killer differentiator.** The strongest direction is **low-pressure, intent-based social discovery that turns into real plans and communities**.
87. **Stay intentionally smaller than Instagram/TikTok.** Sidle should win by helping people create real relationships, not by copying every social-media feature.
88. **Execute the redesign as one coordinated product pass.** Discover → Profile → Connections → Messages → Community → Settings should all use the same design system and product principles so Sidle feels like one coherent product.

---

## Implementation rule

These 88 items are not permission to manufacture fake readiness. Work should be split into:

- **Code-ready:** design system, responsive behavior, search/navigation, UX states, recommendation explanations, profile/community/message polish, PWA affordances, feedback surfaces, feature-flag scaffolding and analytics/observability hooks.
- **Schema/API-ready:** new persisted concepts only when existing models cannot represent them cleanly. Any migration must be additive, reviewed, RLS-aware and reversible through application behavior.
- **External-provider gates:** SMTP, paid Supabase security features, real push credentials, backups/PITR and third-party monitoring require actual provider access/configuration and must not be marked complete from source code alone.
- **Human/device gates:** physical-device testing, screen-reader testing, moderation staffing, real legal ownership/contact information and pilot operations require real-world evidence.

## Definition of “superb”

A feature does not count as complete because a screen exists. It should have: responsive layout, keyboard/touch accessibility, loading/empty/error/offline states, privacy-safe copy, useful analytics/observability hooks where justified, tests, and a clear fallback when an external dependency is unavailable.
