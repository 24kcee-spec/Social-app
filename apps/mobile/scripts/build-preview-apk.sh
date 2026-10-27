#!/usr/bin/env bash
# Self-contained Android preview; no EAS account, Metro server, or live ad account.
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
: "${ANDROID_HOME:?Install Android SDK and set ANDROID_HOME}"
: "${SUPABASE_URL:?Configure the public Supabase project URL}"
: "${SUPABASE_PUBLISHABLE_KEY:?Configure the public Supabase publishable key}"
export CI=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 MOBILE_ADS_PREVIEW=true MOBILE_ADS_ENABLED=false
export ANDROID_PACKAGE="${ANDROID_PACKAGE:-app.kcee24.sidle}"
export MOBILE_API_URL="${MOBILE_API_URL:-https://social-app-bh1h.onrender.com}"
export PUBLIC_WEB_URL="${PUBLIC_WEB_URL:-https://social-platform-web-two.vercel.app}"
export ANDROID_ABIS="${ANDROID_ABIS:-armeabi-v7a,arm64-v8a,x86,x86_64}"
if [[ "${EAS_BUILD_PROFILE:-}" == production ]]; then
  printf 'Use an internal preview environment, not the production EAS profile.\n' >&2
  exit 1
fi
npx --yes pnpm@9.15.4 exec expo prebuild --platform android --no-install
cd android
./gradlew :app:assembleRelease "-PreactNativeArchitectures=$ANDROID_ABIS" --no-daemon --max-workers=3 --console=plain
python3 ../../../scripts/verify-preview-apk.py app/build/outputs/apk/release/app-release.apk --abis "$ANDROID_ABIS"
printf 'Bundled preview APK: %s\n' "$PWD/app/build/outputs/apk/release/app-release.apk"
printf 'This local template signing identity is for preview only. Keep a separate backed-up release key for production.\n'
