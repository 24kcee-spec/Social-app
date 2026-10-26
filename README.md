# Sidle AdMob integration preview — 26 October 2026

Self-contained Android arm64 APK, version 0.0.2 / code 2, Android 7+. Same dedicated preview signer as the earlier APK. Source: commit 91114dad3454411e3f84242d4040b9b1ce2ead95, merged by PR #33 in 24kcee-spec/Social-app.

This APK uses Google sample/test IDs only and earns no revenue. Sign in → Your Sidle → Show test ad. The real owner app/banner IDs and the future Discovery consent/privacy implementation are saved in source, with live serving disabled. Tests and a signed build do not establish physical-phone behavior or Google approval.

The developer-site ZIP contains a static Firebase Hosting-only website and the standard Google DIRECT app-ads.txt row derived from the provided publisher ID. Compare that row with your AdMob console before publishing. Use Firebase Spark (free quotas, no payment method required); instructions are inside the ZIP. No site has been deployed and no paid plan has been enabled.

Store review, appropriate hosting, published privacy/consent messages, audience assessment, owner/payment verification and physical-device tests remain open. Signing private keys and server/SMTP credentials are not included. Verify the checksums before installing or publishing.
