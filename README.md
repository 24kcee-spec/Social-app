Installable Sidle Android preview (arm64-v8a, Android 7.0/API 24 or later).

- Self-contained JavaScript/Hermes bundle; no developer Metro server required.
- Existing Vercel web host, hosted API and Supabase project; latest native rich messaging included.
- Native Google Mobile Ads SDK with official Google test app/unit IDs. Sign in, open Your Sidle, and choose Show test ad. Test ads do not earn revenue; live publisher/consent/review setup is still required.
- Dedicated preview signing certificate verified. This is an internal preview, not a Play Store production release. Physical-device launch/ad/network/permission testing has not been completed in this cloud environment.
- Email sending still needs the owner's saved SMTP credentials; no inbox delivery is claimed. The repository supports `python scripts/configure-supabase-email.py --provider gmail --apply` with secure SMTP_USER and SMTP_PASSWORD bindings.
- Real phone push still needs Firebase/Expo credentials and device verification.

SHA-256 checksums and the build report accompany the APK. Private signing credentials are not included in this public release.
