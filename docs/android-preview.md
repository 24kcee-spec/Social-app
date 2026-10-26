# Android APK, Google test ads and email activation

The current preview keeps Vercel and the existing API. No Netlify account or host migration is required for testing. Android can be built locally without an EAS subscription/account. The native Google Mobile Ads module is installed; internal previews deliberately use Google's official sample app and test-unit identifiers, with ad measurement initialization delayed. Owner app/banner IDs are saved separately for a future eligible release, whose live serving remains disabled.

In the preview APK, sign in, open **Your Sidle**, and choose **Show test ad**. Nothing in this preview requests a real publisher ad unit or earns revenue. The native module is loaded on demand so ordinary Expo Go development still works. Test-ad mode is rejected for the production EAS profile. The Expo native plugin supplies valid sample Android and iOS IDs even when the preview UI is off, preventing the SDK's missing-app-ID startup crash.

## Build locally

Prerequisites: Node 22+, Java 21, Android SDK/build tools and NDK for the checked-in Expo/React Native version, plus installed pnpm workspace dependencies. Supply only public client bindings to the native build: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `MOBILE_API_URL`, `PUBLIC_WEB_URL`, and `ANDROID_PACKAGE`. Keep server/private keys out of the APK. Android SDK downloads/builds do not require paid EAS credits.

From the repository root:

```bash
bash apps/mobile/scripts/build-preview-apk.sh
```

The default native ABI is **arm64-v8a**. This is a self-contained preview build with the JavaScript/Hermes bundle included; it does not use a developer's Metro server. Its native screens talk to the existing hosted API/Supabase, and embedded platform screens retain the current Vercel URL and separate browser sign-in session.

The local Expo template signing identity is for preview; it is not a backed-up production release identity. Validate package, SDK levels, release/non-debuggable state, bundled assets and APK signatures before distributing. A successful build does not prove launch, keyboard, permissions, push or ad loading on a real Android phone. Those checks require the installed APK/device.

## Activate free pilot email with two secure bindings

Create a dedicated Gmail account, enable Google 2-Step Verification, and generate an [app password](https://myaccount.google.com/apppasswords). Save **only these two values** in the cloud secure environment, not chat or source:

```dotenv
SMTP_USER=your-dedicated-address@gmail.com
SMTP_PASSWORD=the-google-app-password
```

Codex can then apply the preset directly to the already connected Supabase project:

```bash
python scripts/configure-supabase-email.py --provider gmail --apply
```

The preset selects `smtp.gmail.com:465`, forces the sender to match the Gmail account, uses `Sidle` as its display name, keeps email confirmation required and starts Auth at 10 emails/hour. It validates/normalizes the app password without printing it. It never uses a Google account password and never sends mail by itself. Send a few controlled signup/reset tests afterward and verify actual inbox/link behavior. Gmail's limits/account restrictions still apply; this is a small-pilot option, not a transactional-email SLA.

The app cannot send through an account that has not been created or whose credentials have not been saved. No SMTP account or inbox delivery is claimed activated by source code alone.

## Still needed for real ad earnings and phone alerts

- Follow [the AdMob account, free developer website and store-listing steps](earn-with-admob.md). The owner app/banner IDs are saved and the Discovery consent/privacy flow is implemented. Internal preview mode always keeps Google's sample Android app ID.
- Publisher/app review, an eligible public app listing, configured Google privacy messages, audience assessment and device testing. The preview uses only test IDs; the Google web AdSense preparation is separate.
- Firebase client configuration and Expo/FCM credentials for real notification delivery. Without them, the preview remains usable but phone-alert delivery is not activated.
- Stable backed-up production signing and appropriate commercial hosting approval before a revenue launch. Vercel Hobby's commercial restriction remains; no paid upgrade or live billing is enabled here.

App-store registration and payment-processing fees are not treated as free. No charge, fake ad revenue, fake paid credit or owner/payout verification is performed by this build.
