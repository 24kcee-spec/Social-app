# Mobile

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

### Push-notification credentials and behavior
- The Expo project needs valid Android FCM v1 credentials and iOS APNs credentials for the platforms you will test. Configure these with Expo/EAS credentials; do not commit credential JSON or private keys.
- The mobile app only asks for notification permission when the user taps **Enable phone alerts** in Settings. When permission is already granted, app sign-in quietly re-registers the current Expo push token with the API. Signing out removes that token registration first.
- The API sends generic push previews for direct messages and new connection requests. It checks Expo HTTP responses and per-device tickets, retries transient HTTP 429/5xx responses, and removes tokens Expo reports as `DeviceNotRegistered`. Successful tickets mean accepted by Expo, not proof of delivery.
- Optionally set `EXPO_ACCESS_TOKEN` as a **server-only API environment variable** when Expo Push Security is enabled. Never add it to mobile/EAS client variables or the repository. Configure real credentials and verify delivery on physical devices before announcing push as live.

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
