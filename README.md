# Sidle universal Android preview — 27 October 2026

Version 0.0.3 / Android code 3. Package app.kcee24.sidle. Android 7+ (API 24+).

Contains armeabi-v7a, arm64-v8a, x86 and x86_64 native runtimes. This corrects INSTALL_FAILED_NO_MATCHING_ABIS from the previous ARM64-only APK. The build verifies all requested native runtimes and actual ELF architecture headers. Same dedicated preview signer as earlier Sidle APKs, with bundled JavaScript and real public API/Supabase endpoints. No Metro server required.

Source: 8565aa0d9dbb1a146e9343c43c9a2ca80a100a6c, merged through PR #34 in 24kcee-spec/Social-app.

This is a test-ad preview. Live publisher requests remain disabled. Physical installation/launch on the owner's phone is not claimed by build or signature checks. Native ads, push delivery, store review, privacy/audience requirements and commercial hosting remain separate release gates.

No signing private keys or server/SMTP credentials are included. Verify the SHA-256 checksum before installation. Install/update over USB with:

```powershell
adb -d install -r "$env:USERPROFILE\Downloads\Sidle-preview-universal.apk"
```
