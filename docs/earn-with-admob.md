# Earn from Android ads without a monthly subscription

AdMob registration is free. Google pays for eligible real ad traffic after account/app approval, verification and the applicable payout threshold; test ads earn nothing. Revenue depends on real usage and advertiser demand. Neither an APK nor this setup guarantees approval or income.

Current state: the owner's screenshot supplied the Android app and banner IDs, now saved as public configuration in `apps/mobile/admob.config.json`. A Discovery banner, Google UMP consent-before-initialization flow, non-personalized requests, general-rated content limit and privacy-options entry point are implemented. Live serving remains **off**: hosting eligibility, Google review, audience/privacy-message setup and physical-device checks are still open. Internal preview APKs use Google sample/test IDs. Gmail SMTP is configured separately and does not generate ad revenue.

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

The provided screenshot's app and banner IDs are already saved; do not re-enter them unless changing accounts. Environment overrides remain available as `ADMOB_ANDROID_APP_ID` and `ADMOB_ANDROID_BANNER_ID`. Saving IDs alone does not enable live requests. Internal preview mode continues to use Google's sample app ID even when an owner app ID exists. Build configuration rejects ad-unit IDs supplied as app IDs and mismatched publishers in a live build.

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

## 4. Finish Google's consent configuration and release checks

In AdMob, open **Privacy & messaging**, select Sidle and configure/publish the Google consent messages required for the regions where the app will operate. Use the real published privacy notice. Complete the target-audience/age assessment and account/store disclosures; the content-rating limit in code is not age verification or a child-directed declaration.

The implemented Discovery placement is optional: **Show sponsored content** gathers fresh Google UMP consent before initializing ads. A failure or `canRequestAds=false` leaves the banner off. **Ad privacy choices** removes the banner before reopening the relevant form, and does not initialize ads by itself. Leaving the screen during consent prevents a later ad request. No messages, profile data, location or user identifier are supplied as ad targeting. Non-personalized requests still require the applicable consent and disclosures.

After account/app review, actual commercial hosting eligibility, audience/privacy configuration and device tests are complete, a release operator can set:

```dotenv
MOBILE_ADS_ENABLED=true
COMMERCIAL_DEPLOYMENT_APPROVED=true
MOBILE_ADS_PREVIEW=false
```

These flags do not certify Google approval or purchase an eligible hosting plan. Build guards reject live ads in internal previews, development runtime never renders a live placement, and only Android's stable `app.kcee24.sidle` package is supported. Real-device consent/privacy changes, no-fill/failure behavior, layout and ad loading still need verification. No live serving or income is claimed by source tests or a test APK.

Never click your own live ads or ask others to click. Use test ads during development and device QA. Users installing and enjoying Sidle can create eligible impressions; revenue and payout timing remain subject to Google's rules and real demand.

## References checked 26 October 2026

- [Supported store setup](https://support.google.com/admob/answer/10037806?hl=en) · [App readiness review](https://support.google.com/admob/answer/10564477?hl=en)
- [Google app-ads.txt setup and Firebase Hosting option](https://support.google.com/admob/answer/9363762?hl=en) · [Android developer guide](https://developers.google.com/admob/android/app-ads)
- [Firebase Spark pricing](https://firebase.google.com/pricing)
- [Samsung publishing-fee FAQ](https://developer.samsung.com/galaxy-store/faq.html) · [Current seller approval requirements](https://developer.samsung.com/galaxy-store/overview.html)
- [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby)
