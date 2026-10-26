# Earn from Android ads without a monthly subscription

AdMob registration is free. Google pays for eligible real ad traffic after account/app approval, verification and the applicable payout threshold; test ads earn nothing. Revenue depends on real usage and advertiser demand. Neither an APK nor this setup guarantees approval or income.

Current state: Sidle's APK includes the Google Mobile Ads SDK and opt-in Google test banners. Source now accepts an owner's Android AdMob app ID and can prepare a matching developer website/app-ads.txt. Live ad units, consent handling, store approval and payouts are **not activated**. Gmail SMTP is configured separately and does not generate ad revenue.

## 1. Create your AdMob account

1. Open <https://admob.google.com/home/> and sign up with your own Google account.
2. Use your real eligible payee details and **Zimbabwe** as your payment country. Confirm country/account eligibility in Google's signup flow; never select another country to bypass eligibility. If an AdSense account already exists, use the appropriate existing linked account instead of creating a duplicate.
3. Complete Google's requested account checks. Enter identity, tax, address and bank information **directly in Google**, not chat or GitHub. Payment methods, payout thresholds, timing and possible bank fees must be checked in your account; account registration being free does not mean an instant or fee-free withdrawal.
4. In **Apps → Add app**, select **Android**, mark it **not listed in a supported store yet**, and name it **Sidle**. Do not claim a store listing that does not exist. Sidle's Android package is `app.kcee24.sidle`.
5. In the app, create one **Banner** ad unit named **Sidle discovery banner**. Keep frequency low; no ads in private messages, sign-in/reset, reporting, settings or beside send buttons.
6. Copy the Android **app ID** from App settings (`ca-app-pub-…~…`), the **banner unit ID** (`ca-app-pub-…/…`), the **publisher ID** from account settings (`pub-…`) and the exact **app-ads.txt** authorization row from AdMob. These identifiers are public, not account passwords.

Save the following public values in the cloud environment when you have them. Replace every placeholder with your account's real value:

```dotenv
ADMOB_ANDROID_APP_ID=ca-app-pub-YOUR_16_DIGIT_PUBLISHER~YOUR_10_DIGIT_APP
ADMOB_PUBLISHER_ID=pub-YOUR_16_DIGIT_PUBLISHER
ADMOB_APP_ADS_TXT=google.com, pub-YOUR_16_DIGIT_PUBLISHER, DIRECT, f08c47fec0942fa0
```

Supply the banner unit ID for the later live-placement implementation. Saving the app ID alone does not enable live ad requests. Internal preview mode continues to use Google's sample app ID even when an owner app ID exists. Build configuration rejects ad-unit IDs accidentally supplied as app IDs.

## 2. Use a free developer website for app-ads.txt

Google explicitly supports Firebase Hosting for this purpose. Use **Firebase Hosting on the Spark plan**, not the separate Firebase App Hosting product, a Blaze upgrade, a trial credit or a paid domain. Spark has no payment-method requirement and has fixed free quotas. Its assigned `PROJECT_ID.web.app` address avoids a domain purchase; the ID must be available.

1. Open <https://console.firebase.google.com/>, create or select a project, and keep it on **Spark**. Google Analytics is optional for this static site.
2. Once the three public bindings above are available, run from the Sidle repository root:

   ```bash
   python scripts/prepare-admob-site.py --output ../sidle-admob-site
   ```

   The command creates a new directory with a Sidle landing page, your matching `/app-ads.txt` and a Hosting-only `firebase.json`. It does not deploy, enable billing or publish server/SMTP credentials. It refuses to overwrite an existing output directory or mix different publisher accounts.

3. From a terminal on your own computer, authenticate to your Google account and deploy the generated directory:

   ```bash
   cd ../sidle-admob-site
   npx --yes firebase-tools@latest login
   npx --yes firebase-tools@latest deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
   ```

4. Verify `https://YOUR_FIREBASE_PROJECT_ID.web.app/app-ads.txt` returns your exact row. Set `https://YOUR_FIREBASE_PROJECT_ID.web.app` as the developer website in the eventual supported store listing, then request/check crawling in AdMob. The site must be public and discoverable from that listing.

This hosts only the developer website; Sidle's web app stays at its current Vercel address. **Vercel Hobby remains limited to noncommercial personal use.** The developer website does not make that web deployment eligible for monetization. Verify/change the app's actual hosting arrangement before a commercial launch; no paid upgrade or Netlify migration is performed here.

## 3. Obtain a supported store listing without assuming a free Google Play account

AdMob's supported third-party Android stores currently include Samsung Galaxy Store, OPPO App Market, VIVO App Store, Xiaomi GetApps and Amazon Appstore. A store appearing in this list does not establish that its seller program or devices are available to you.

**Samsung Galaxy Store is a candidate with no sign-up or annual publishing fee**, according to Samsung's FAQ. Start at <https://seller.samsungapps.com/>. Samsung currently requires seller registration and commercial seller approval to distribute apps, with identity/business/bank checks as applicable. Check Zimbabwe eligibility and the requirements offered to your account before relying on this route. No Samsung eligibility, account, listing or approval has been verified for the owner here.

Use the same stable `app.kcee24.sidle` package. Prepare the reviewed release APK, production signing backup, icon, screenshots, accurate privacy policy, age/content and ads disclosures, reviewer access and moderation/contact information. Sidle's current `/privacy` page is a product overview and explicitly says it is not a formal legal privacy notice; the owner-approved notice and real support contact remain necessary before submitting a monetized release. The existing preview APK is for device testing; it is not an approved store release. Link the actual public supported-store listing in AdMob to start app readiness review. Google Play's registration fee is excluded from this zero-upfront-fee plan.

## 4. Activate earnings only after these inputs exist

Codex can finish a live banner placement after the real public identifiers, eligible listing, appropriate hosting and owner/account requirements are available. That build needs Google's consent flow and privacy-options access where required, audience/age handling, no request before consent eligibility, development test-device safeguards, limited placements away from private conversation controls, and physical Android testing. Non-personalized ads alone do not replace required consent. No ad unit is connected to the current APK by this preparation.

Never click your own live ads or ask others to click. Use test ads during development and device QA. Users installing and enjoying Sidle can create eligible impressions; revenue and payout timing remain subject to Google's rules and real demand.

## References checked 26 October 2026

- [Supported store setup](https://support.google.com/admob/answer/10037806?hl=en) · [App readiness review](https://support.google.com/admob/answer/10564477?hl=en)
- [Google app-ads.txt setup and Firebase Hosting option](https://support.google.com/admob/answer/9363762?hl=en) · [Android developer guide](https://developers.google.com/admob/android/app-ads)
- [Firebase Spark pricing](https://firebase.google.com/pricing)
- [Samsung publishing-fee FAQ](https://developer.samsung.com/galaxy-store/faq.html) · [Current seller approval requirements](https://developer.samsung.com/galaxy-store/overview.html)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
