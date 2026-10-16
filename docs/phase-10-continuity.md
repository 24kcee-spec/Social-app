# Phase 10 — Sharing, Deep Links & Cross-Device Continuity

## 1. Architectural Overview

Phase 10 provides a privacy-first, cross-device sharing and deep-linking system across the Next.js web application and Expo/React Native mobile application.

### Key Capabilities
1. **Native Web Share & Clipboard Fallback**: Uses `navigator.share` on supported platforms (mobile browsers, desktop Safari) with instant clipboard fallback and accessible toast/modal feedback.
2. **Privacy-Preserving Public Previews**: Public share endpoints (`/api/share/:targetType/:id` and `/share/:targetType/:id`) return only approved public-facing preview fields (e.g., group title, capacity, general area; event date/location; verified profile display name and public bio snippet). Private messages, direct connections, session identifiers, and sensitive credentials are never exposed.
3. **Android App Links & Universal Links**: Configured intent filters for Android (`socialapp://` and `https://social-app.local/share`) and Universal Link associated domains for iOS.
4. **Cross-Device Continuity & Redirect Preservation**: Validated internal destinations (`validateSafeRedirect`) preserve user target screens through login/onboarding flows without open-redirect vulnerabilities.
5. **Cold-Start & Warm-Start Handling**: Mobile app parses incoming URLs on startup (`Linking.getInitialURL`) and during active execution (`Linking.addEventListener`), routing seamlessly to community groups, events, or discovery.

---

## 2. Supported Share Types & Authorization Matrix

| Target Type | Supported | Target Visibility | Unauthenticated Preview | Authenticated Actions |
|-------------|-----------|-------------------|-------------------------|-----------------------|
| `profile`   | Yes       | Public / Campus   | Display name, verification badge, bio snippet | Send connection request, start conversation |
| `group`     | Yes       | Public / Community| Name, general area, member count / capacity | Join group, view threads, chat |
| `event`     | Yes       | Public / Group    | Title, group host, start time, general area | RSVP, add to schedule, view attendees |
| `message`   | **No**    | Strictly Private  | Forbidden (HTTP 403 / Omit) | Private direct messaging only |
| `request`   | **No**    | Strictly Private  | Forbidden (HTTP 403 / Omit) | User connection queue only |

---

## 3. Deep Linking & App Link Specification

### URL Scheme
- Custom Scheme: `socialapp://share/:targetType/:id`
- Universal / App Link: `https://social-app.local/share/:targetType/:id`

### Android App Links Configuration
- Host: `social-app.local` (configurable via `APP_DOMAIN`)
- Path Prefix: `/share`
- Target Package: `app.social.dev`
- Digital Asset Links: `/.well-known/assetlinks.json`

### Release Keystore Fingerprint Setup
When building the production Android APK/AAB with EAS Build or local keystore:
1. Extract the SHA-256 fingerprint:
   ```bash
   keytool -list -v -keystore <release.keystore> -alias <key-alias>
   ```
2. Replace the SHA256 placeholder in `apps/web/app/.well-known/assetlinks.json`:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "app.social.dev",
         "sha256_cert_fingerprints": [
           "RELEASE_SIGNING_SHA256_FINGERPRINT_HERE"
         ]
       }
     }
   ]
   ```

---

## 4. Verification & Test Evidence

All monorepo packages and applications pass verification:
- **`@sp/api`**: 23 test suites, 264 passed tests (including `share-routes.test.ts`, rate limits, CORS, safety).
- **`@sp/profile-client`**: 9 test suites, 58 passed tests (including `share.test.ts` URL parsing and deep link builders).
- **`@sp/validation`**: 27 passed tests.
- **`@sp/auth-client`**: 16 passed tests.
- **`@sp/config`**: 7 passed tests.
- **`@sp/design-tokens`**: WCAG contrast checks passed.
- **Total Test Count**: 374 passed tests across 36 files.
- **`pnpm verify`**: 100% green.
