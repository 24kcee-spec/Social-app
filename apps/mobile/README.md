# Mobile

For the current **local APK + Google test-ad module** path, keeping the existing Vercel host, see [Android preview and two-binding email activation](../../docs/android-preview.md). EAS is optional for this preview build.

This package is the Expo React Native client for the app.

## Purpose

- Cross-platform mobile app experience
- Connects to the same shared packages as the web frontend
- Includes image upload / picker capabilities and local storage support

## Key scripts

```bash
pnpm --filter @sp/mobile start
pnpm --filter @sp/mobile android
pnpm --filter @sp/mobile ios
pnpm --filter @sp/mobile typecheck
pnpm --filter @sp/mobile run config:check
```

## Android builds with EAS

The checked-in `eas.json` defines an **internal preview APK** and a separate **production** profile. A preview APK is for test devices; it is not a Play Store release. The app is not considered launch-ready merely because an APK builds.

### One-time EAS setup

1. Create/sign in to an Expo account, then from this directory run:
   ```bash
   pnpm dlx eas-cli login
   pnpm dlx eas-cli project:init
   ```
2. Link the generated EAS project to this app. Ensure the EAS project ID is saved under `expo.extra.eas.projectId` in `app.config.js` if the CLI asks you to add it manually.
3. In the Expo project dashboard, create these variables for the **preview** environment: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MOBILE_API_URL`, and `PUBLIC_WEB_URL`. Use real reachable service URLs; API, Supabase and web URLs must use HTTPS. The publishable key is safe for a client app; **never set `SUPABASE_SECRET_KEY` or a service-role key in the mobile project.**
4. Create the same four variables for the **production** environment. Before a production Android build, also set `ANDROID_PACKAGE` to the final stable Android application ID (reverse-domain format, not a `.dev`, `.local`, or `.test` ID). Do not choose a final ID casually: it identifies the app for future updates.

The remote build deliberately fails if the required public service configuration is missing, uses HTTP/local addresses, or production lacks a stable Android application ID. Local Expo development can still use the root `.env` and its development defaults.

### Build and install the preview APK

From `apps/mobile/`:

```bash
pnpm dlx eas-cli build --platform android --profile preview
```

Follow EAS prompts to create Android signing credentials if asked. When the build finishes, open its EAS install link on the Android test phone and install the APK. The phone must have network access to the configured API and Supabase project.

### Physical-device smoke test

Use dedicated test accounts and run the repeatable cases in `docs/phase1-live-gate.md`. At minimum verify on the installed APK:

- Cold start, sign up/sign in, onboarding, sign out, and restart/session persistence.
- Profile/photo picker permission, upload, remove, and retry after a network failure.
- Discover a second test account, send/accept a connection request, then message both directions.
- Unread counts/read receipts; briefly disconnect and reconnect the network and confirm messages resync without duplicates.
- Group join, event RSVP/cancellation, and group/event chat where the live backend supports them.
- Block/report behavior and denied/empty/error states.

Record failures with the Android version, device model, app build URL/commit, and steps to reproduce. Do not use real personal data in test accounts. The backend live gate, database migration review, production database TLS verification and moderation/support readiness remain release gates. Only make a production AAB after the stable Android ID and live gates are approved.

## Main structure

```text
apps/mobile/
├── src/
│   ├── components/
│   ├── theme/
│   ├── App.tsx
│   ├── Community.tsx
│   ├── Connections.tsx
│   ├── Discover.tsx
│   ├── Messages.tsx
│   ├── SayHi.tsx
│   ├── auth.ts
│   ├── communityClient.ts
│   ├── connectionClient.ts
│   ├── discovery.ts
│   ├── messagingClient.ts
│   ├── profile.ts
│   └── ...
├── App.tsx
├── app.config.js
├── eas.json
├── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

This app uses the workspace packages:

- `@sp/auth-client`
- `@sp/profile-client`
- `@sp/types`
- `@sp/validation`

It also includes Expo and React Native packages for mobile behavior, image handling, and async storage.

## Local run

```bash
pnpm install
pnpm --filter @sp/mobile start
```

## Notes

The structure mirrors the web app’s social flows:

- community
- discover
- messages
- profile and connections
- say-hi interactions

### Native link configuration update (24 October 2026)

Set `EAS_PROJECT_ID` to the linked Expo project's UUID in preview/production. App/Universal Link hosts now come from `PUBLIC_WEB_URL`; there is no `.local` release host. On the web deployment configure `ANDROID_PACKAGE` and comma-separated `ANDROID_SIGNING_SHA256` certificates from the actual EAS/Play signing identity. For iOS set `APPLE_TEAM_ID` and `IOS_BUNDLE_IDENTIFIER` on web and keep the native bundle identifier aligned. Missing release identities publish empty association documents, not development certificates or placeholder team IDs. Test installed cold/warm share links against those exact deployed documents. Remote build and physical-device validation still require the actual Expo project and device; no APK is claimed built here.

### Phone-alert verification

The installed build includes `expo-notifications`; rebuild the APK after pulling this change. Configure the linked Expo project's FCM v1/APNs credentials, apply migration 0013, and set server `PUSH_PROVIDER=expo` (optionally server-only `EXPO_ACCESS_TOKEN` if Expo enhanced push security is enabled). Enable alerts from mobile Settings → Notifications on a physical device. Confirm two-account message delivery with the app foreground/background/closed, notification taps, preference-off behavior, token rotation, sign-out and session revocation. The API stores and checks Expo ticket receipts; monitor `push_delivery_receipts.outcome` for provider errors/expired receipts. No live push or APK build has been verified in this cloud machine. Connection-request and browser push are not implemented; their preferences do not imply delivery. Direct-message photos are not supported; the former pretend attachment control has been removed.

Android FCM also needs the Firebase **client** `google-services.json` matching `ANDROID_PACKAGE`. Supply its path with `ANDROID_GOOGLE_SERVICES_FILE` (an EAS file variable for remote builds; a path relative to `apps/mobile` or absolute locally). Config loading rejects a mismatched package, unreadable/malformed JSON and standard service-account private keys. The **server** FCM v1 service-account key belongs in EAS Credentials, never the APK or this variable. See the [free-first provider guide](../../docs/free-first-launch-setup.md) for the ordered Zimbabwe/Android setup.

## Expanded platform release

The Profile tab now reads as a profile with explicit editing. Low-pressure introductions live in Settings. Explore opens the first-party responsive media, activity, search, location, calls, live and billing screens in a WebView with its own sign-in session; native tokens are never passed through a JavaScript bridge. HTTPS configuration is required. New media/permission declarations are code-ready, but a signed APK/iOS build, physical-device permission/media/cellular tests and provider delivery remain unverified. See [release handover](../../Documents/PLATFORM_RELEASE_HANDOVER.md).
