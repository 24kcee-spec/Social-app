# Sidle: free-first setup for Zimbabwe

Prepared 26 October 2026; updated to keep Vercel and build an APK directly. For a Zimbabwe-based owner with an Android test phone and **no owned domain**. The first monetization target is **earning revenue from ads shown in Sidle**. Account creation, sender/domain verification, payout verification and physical-device tests are still pending. This guide does not claim that any new provider account has been created or activated.

Use ongoing free plans rather than temporary credit trials. Provider terms and quotas can change. A free pilot can have good security and interactions, but these plans do not provide unlimited capacity, guaranteed uptime or a permanent price promise.

## 1. Choose the zero-monthly-fee path

| Purpose                                    | Choice                                                     | Actual limit / cost boundary                                                                                                                                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alternative commercial web hosting         | Netlify Free                                               | Commercial projects permitted. Current plan has 300 credits/month; production deployments use 15 credits each, and traffic/compute also consume credits. Hard cap means a service pause rather than automatic overage charges.  |
| API                                        | Existing Render Free service                               | Sleeps after 15 minutes without traffic; cold starts are expected. Shared free instance-hour and bandwidth limits apply. Do not create a separate free Render Postgres database: it expires after 30 days.                      |
| Auth/database/media                        | Existing Supabase Free project                             | Current allowance: 500 MB database, 1 GB file storage, 5 GB egress and 50,000 monthly active users. Idle projects may pause. Paid recovery features are not enabled.                                                            |
| Signup/reset email now                     | Dedicated free Gmail + app-password SMTP, small pilot only | No domain purchase needed. Google documents blocks beyond 500 emails/day; lower/anti-abuse limits can apply. Start Supabase Auth at 10 emails/hour. No transactional delivery SLA; app passwords can be unavailable or revoked. |
| Transactional email after getting a domain | Brevo Free                                                 | Up to 300 emails/day after account/sending approval. Use authenticated sender DNS; an owned domain is a separate prerequisite/cost.                                                                                             |
| Alternative email                          | Resend Free                                                | 3,000 emails/month, 100/day; also needs a verified sending domain for general delivery. Choose one provider, not both at once.                                                                                                  |
| Android builds                             | Expo/EAS Free                                              | Current allowance: 15 Android builds/month, low-priority queue. Wait for renewal if exhausted; do not upgrade automatically. APK distribution for testing does not require a Play Store account.                                |
| Android notifications                      | Firebase FCM + Expo push                                   | FCM and Expo's notification service have no sending charge. Keep Firebase on Spark; no Blaze upgrade is needed for this path.                                                                                                   |
| Web ad earnings                            | Google AdSense                                             | No signup fee; Zimbabwe is listed as available. Approval, eligible public content and a supported payout method are required. No earnings or approval guarantee.                                                                |
| Native ad earnings                         | Google AdMob, later                                        | Requires an SDK integration, supported published app listing, app-ads.txt verification and review. Sideloading an APK alone does not close this gate.                                                                           |
| Monitoring                                 | Existing GitHub production-health workflow                 | Public repository currently uses free hosted Actions. Enable your GitHub failure/email notifications. Hourly health checks do not make Render an always-on service.                                                             |
| Offsite backup                             | age encryption + your existing free storage                | Google accounts include 15 GB shared across Drive/Gmail/Photos. Store only encrypted archives offsite; monitor capacity and keep the recovery identity separately. Actual restoration must be tested.                           |
| In-app checkout                            | Keep disabled for a strict zero-fee launch                 | Stripe's current direct merchant list does not include Zimbabwe. Paynow is a possible separate Zimbabwe integration with transaction fees; it is not implemented by the existing Stripe code.                                   |

Google Play currently has a US$25 one-time registration fee. Apple's developer program is normally US$99/year, with limited eligibility-based waivers. Neither belongs in a strictly free launch. Android distribution rules continue to evolve; an internal test APK is not a guarantee of unrestricted public distribution forever.

## 2. Keep the existing Vercel host

The owner explicitly chose to keep Vercel. **No Netlify migration is active**, and the optional Netlify configuration has been removed. The APK connects to `https://social-platform-web-two.vercel.app` and the existing hosted API. See [the APK guide](android-preview.md) for the current build and email-activation instructions.

A shorter free `*.vercel.app` alias can be configured through the owning Vercel project's domain settings if the name is available. Codex needs a scoped Vercel connection/token to perform that account change; the current cloud environment has no Vercel token. No short alias has been reserved or activated.

A real customized `.com` generally requires annual registration **and renewal**. No enduring free `.com` has been obtained or promised. Keep using the existing free address until a real domain budget exists; no purchase is authorized now.

Vercel Hobby is personal/non-commercial. A preview APK with Google test IDs is not a live ad/revenue launch. Do not mark a Hobby deployment commercially approved or enable paid/live advertising integrations without resolving the actual hosting eligibility. The owner's current free-only instruction remains in force.

## 3. Set up email without a domain, then upgrade its reliability

The current simpler route needs only two secure bindings and `--provider gmail`; see the [APK/email guide](android-preview.md). The six-field manual configuration below remains supported.

### Free small-pilot path: a dedicated Gmail account

Personal Gmail SMTP is a way to test real signup/reset delivery without purchasing a domain. It is not equivalent to a production transactional-mail service: Google can block sending, limits can be lower for abuse/risk reasons, app-password availability varies, and no delivery SLA is provided. Do not promise a permanent free high-volume email service.

1. Create a **dedicated** Gmail account you control, with a short available name such as `sidle.accounts.zw` (availability is not guaranteed). Do not use a personal inbox containing unrelated private mail. Google can require account/phone verification.
2. Enable Google **2-Step Verification** at <https://myaccount.google.com/security>. Keep account recovery under your control.
3. Open <https://myaccount.google.com/apppasswords> and create an app password named `Sidle Supabase SMTP`. Use this generated 16-character password, never the Google account password. If App passwords is unavailable due to account/security policy, stop here rather than disabling security controls.
4. Save these values in the Codex cloud environment's secure variables/secrets UI. Replace the email with the account you actually created, and remove visual grouping spaces from the app password:

   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=YOUR_DEDICATED_ADDRESS@gmail.com
   SMTP_PASSWORD=YOUR_16_CHARACTER_GOOGLE_APP_PASSWORD
   SMTP_ADMIN_EMAIL=YOUR_DEDICATED_ADDRESS@gmail.com
   SMTP_SENDER_NAME=Sidle
   ```

5. `SMTP_USER` and `SMTP_ADMIN_EMAIL` must be the same Gmail address. Do not claim `noreply@sidle.com` or a Netlify/Vercel sender domain you do not own. A Google app password is sensitive mailbox access: keep it only in the secure server binding; no chat/source/mobile sharing.
6. With these bindings, Codex can configure Supabase directly using the already connected Supabase access:

   ```bash
   python scripts/configure-supabase-email.py
   python scripts/configure-supabase-email.py --apply
   ```

7. In Supabase **Authentication → Rate Limits**, start with **10 email messages/hour**, keep the resend cooldown, and monitor rejected/suspicious requests. SMTP configuration alone does not add CAPTCHA or stop all public signup abuse. Do not raise limits merely to bypass Gmail/provider restrictions.
8. Supply a controlled recipient address and consent for a few signup/reset tests. Verify actual inbox/spam arrival and link behavior. The Gmail sender address remains visible to recipients.
9. If Google blocks SMTP or delivery is unreliable, record the failure and use an approved sender/provider path. Do not mark delivery ready by turning off email confirmation. Changing the Google account password can revoke app passwords and requires rotating this binding.

This route starts a small pilot at zero monthly fee. For wider admission, an owned-domain transactional sender and measured delivery remain the stronger path below.

### Owned-domain path: Brevo Free transactional SMTP

1. Open <https://app.brevo.com/account/register> and create the free account with your real details. Verify your inbox and complete its account/transactional sending review.
2. In **Settings → Senders, domains & dedicated IPs**, add a sender domain you own and can edit. You cannot authenticate `gmail.com`, `yahoo.com`, or your provider-owned `vercel.app`/`netlify.app` parent domain as your own email domain.
3. Copy the exact DNS records Brevo generates into your domain's DNS panel. Values are unique to your account: do not use invented DKIM keys or example TXT records. Preserve existing working MX/SPF/DMARC records; do not create duplicate SPF or DMARC policies. Verify the records in Brevo after propagation.
4. Add a sender such as `noreply@YOUR_OWNED_DOMAIN` with display name `Sidle`. Use a monitored support/reply-to address separately.
5. Open **SMTP & API → SMTP**. Create an **SMTP key**. This is different from Brevo's HTTP API key. Save these bindings in the Codex cloud environment's secure variables/secrets UI:

   ```dotenv
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=465
   SMTP_USER=REPLACE_WITH_THE_SMTP_LOGIN_BREVO_SHOWS
   SMTP_PASSWORD=REPLACE_WITH_THE_SMTP_KEY_NOT_YOUR_ACCOUNT_PASSWORD
   SMTP_ADMIN_EMAIL=noreply@YOUR_OWNED_DOMAIN
   SMTP_SENDER_NAME=Sidle
   ```

6. Do not paste the SMTP key into chat, GitHub, the Netlify browser bundle or the phone. Supabase sends Auth email through this SMTP configuration; Render does not need outbound SMTP ports for these Auth messages.
7. Once the bindings are available, Codex can apply and read back the settings using existing Supabase access:

   ```bash
   python scripts/configure-supabase-email.py
   python scripts/configure-supabase-email.py --apply
   ```

8. Alternatively, paste the same SMTP fields into **Supabase → Authentication → Email → SMTP settings**, and keep **Confirm email enabled**. The label/location can vary with dashboard updates.
9. Disable click/link tracking for authentication messages where the provider offers it. Do not bulk-import contacts or send marketing messages while testing Auth.
10. Give a controlled test inbox address and authorize a few signup/reset messages. Verify inbox/spam arrival, correct domain and links, single-use/expired links, resend cooldown and account-existence privacy. Read-back of SMTP settings is not proof of delivery.

The owner has confirmed there is no domain. Brevo's authenticated-domain route therefore remains pending: it cannot be fully configured from a free mailbox or a `vercel.app` URL. A domain may need a purchase/renewal; Codex will not buy one under a zero-spend instruction. Avoid temporary email/free-domain schemes for account recovery.

For Resend instead, verify your domain there and use `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASSWORD=<Resend API key>`. Its onboarding sender is restricted testing, not a general production sender. A new provider/key should replace the chosen SMTP binding deliberately rather than being switched during live sends.

## 4. Earn from web ads first

1. Open <https://adsense.google.com/start/> using your own Google account. Set the payment country to **Zimbabwe** and use the real eligible payee's legal information. Do not use someone else's country/address to bypass payout requirements. AdSense normally requires an adult account holder.
2. Add the eligible public production site on the commercial-compatible host. If Google does not accept the hostname, supply an owned supported domain; do not claim ownership of the hosting provider's parent domain.
3. Google needs substantial original, policy-compliant public content to review. A login wall and empty social feed are insufficient launch evidence. Never publish private member profiles or conversations merely to pass ad review.
4. Publish accurate Privacy, Terms, Contact, community/content rules and reporting information. Finalize the real support address and moderation owner; template pages alone do not establish staffed support or legal approval.
5. When Google gives you a site-verification method, send Codex the public publisher identifier (`ca-pub-…`), site URL and exact **ads.txt** line Google supplies. Use the ownership **meta tag** method where available. The repository now supports the verification meta tag and `/ads.txt`; no publisher is configured by default. On the verified commercial-compatible host only, these public/server bindings activate verification:

   ```dotenv
   COMMERCIAL_DEPLOYMENT_APPROVED=true
   ADSENSE_VERIFICATION_ENABLED=true
   ADSENSE_PUBLISHER_ID=REPLACE_WITH_YOUR_ca-pub_AND_16_DIGITS
   ADSENSE_ADS_TXT=PASTE_THE_EXACT_SINGLE_GOOGLE_DIRECT_RECORD
   ENABLE_PAYMENTS=false
   ```

   Leave `ADSENSE_ADS_TXT` blank until Google supplies it; metadata verification does not require inventing a record. The publisher must match in both values. Disabled/unapproved hosts publish neither ownership metadata nor an authorized ads.txt record. No Google advertising JavaScript or ad slot is installed by these settings. Identifiers/records are public, not account passwords. Verify the deployed meta tag and file, then request Google's site review.

6. After approval, supply the approved ad-unit IDs. Codex then adds the approved script and a small, labeled placement in an eligible feed/public content view, with reserved space so the page does not jump. Start with a low ad density. Keep ads away from message bubbles, send buttons, sign-in/reset, settings, reporting and private conversations. Only mark the deployment commercially approved after the actual host/plan is verified; keep `ENABLE_PAYMENTS=false` while preparing ads. The hosting flag does not itself buy a plan or enable Google ads.
7. Set up Google's applicable privacy/consent controls before serving ads. For EEA/UK/Swiss traffic, use a Google-certified CMP where required; a home-made toggle or non-personalized ads alone does not automatically meet that requirement. Google's own available Privacy & messaging flow is the first option to evaluate.
8. Never click your own live ads or ask friends to click. Test with supported preview/test tooling. Google performs its own approval, identity/payment verification and invalid-traffic checks. Payouts depend on reaching its threshold and the payment methods actually offered to the Zimbabwe account; receiving-bank charges may apply.

Creating an AdSense account is free. Revenue is a share of advertiser spend; it is not a free ad budget for promoting Sidle and is not guaranteed. Free promotion can use consent-based campus/community partnerships and organic posts without purchasing ads. Promotional ad-credit trials are excluded from this plan.

The existing campaign/credit controls on `/billing` are Sidle's own advertising system, not Google AdSense/AdMob. Existing `ads.create`/`ads.serve` RPCs do not install a Google SDK. Do not grant fake paid credits or enable that system as a substitute for AdSense approval.

## 5. Build and test the Android app without store fees

Use the current web host until the replacement host passes. The proposed stable Android ID is `app.kcee24.sidle`; use the same ID in Firebase, Expo, signing and later store registration. It is a proposed identifier, not proof of a published app or domain ownership.

1. Create a free Expo account at <https://expo.dev/signup> and a Firebase project at <https://console.firebase.google.com/> on **Spark**. Do not upgrade to Blaze; FCM does not require it.
2. In Firebase, register the Android app with `app.kcee24.sidle`. Download its **client** `google-services.json`.
3. In the Expo project, upload that client file as a **file environment variable** named `ANDROID_GOOGLE_SERVICES_FILE` for `preview` and later `production`. The file path is provided by EAS at build time. `app.config.js` now supports this field and verifies its Android package. It rejects standard service-account private-key files.
4. In Firebase project settings → Service accounts, create the appropriate FCM v1 service-account key when needed, and upload it only to **Expo project → Credentials → Android → FCM V1**. Keep this server credential separate from `google-services.json`. Never place it in the APK, repository, app `extra`, or a chat message.
5. On your own computer with Node 22 and Git installed, open a terminal in the cloned repository:

   ```powershell
   git pull --ff-only
   npx --yes pnpm@9.15.4 install --frozen-lockfile
   cd apps/mobile
   npx --yes eas-cli@latest login
   npx --yes eas-cli@latest project:init
   ```

6. Copy the linked Expo project UUID. Merge these public values into the repository-root `.env` without overwriting other saved settings, and add the same values to the EAS **preview** environment:

   ```dotenv
   SUPABASE_URL=https://mdekznpqmadhhsmouuhx.supabase.co
   SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_EXISTING_PUBLISHABLE_KEY
   MOBILE_API_URL=https://social-app-bh1h.onrender.com
   PUBLIC_WEB_URL=https://social-platform-web-two.vercel.app
   EAS_PROJECT_ID=REPLACE_WITH_LINKED_EXPO_PROJECT_UUID
   ANDROID_PACKAGE=app.kcee24.sidle
   ```

7. `ANDROID_GOOGLE_SERVICES_FILE` is an EAS file binding; a local build instead needs the path to your client file, relative to `apps/mobile` or absolute. Private signing/provider files are Git ignored. Do not add `SUPABASE_SECRET_KEY`, database credentials, SMTP password or an FCM service-account key to mobile environment/public extras.
8. From `apps/mobile`, run the checked-in configuration guards and request one preview APK:

   ```powershell
   npx --yes pnpm@9.15.4 run config:check
   npx --yes eas-cli@latest build --platform android --profile preview
   ```

9. Install the resulting APK from the EAS link on your Android phone. Test two private accounts: sign-in/confirmation/reset, onboarding, session persistence, message mutations/retry/reconnect, keyboard/safe areas, permissions, foreground/background/closed notification delivery, token rotation, sign-out, revoked sessions and notification taps. The native rich-feature parity work remains distinct from provider setup.
10. Only after FCM/EAS credentials and the APK are ready, set `PUSH_PROVIDER=expo` on **Render's API environment**. If Expo enhanced push security is enabled, save its token as server-only `EXPO_ACCESS_TOKEN`. `EXPO_TOKEN` is the EAS CLI automation binding. Neither belongs in the client. Verify provider receipts and actual phone delivery before marking push ready.
11. Save the actual package and signing SHA-256 fingerprint as `ANDROID_PACKAGE` and `ANDROID_SIGNING_SHA256` on the web host. Confirm the deployed Android association document and installed cold/warm share links. Do not use placeholder signing fingerprints.

No Expo account/project, Firebase key, APK or physical push delivery has been created or verified by this guide. A free EAS quota is a build allowance, not a full native implementation or device test.

## 6. Native ad revenue comes after the APK works

AdMob registration is free, but live serving needs a supported published app, app review and developer-site/app-ads.txt verification. A sideload-only preview is not sufficient. Paid Google Play registration is excluded unless you later accept that fee. An alternative supported store can be considered only after checking its current fees, Zimbabwe seller eligibility and device reach; no alternative listing is claimed here.

The native AdMob SDK is now installed for the internal APK with Google sample/test identifiers and an opt-in test-ad preview. No live publisher units are requested. After an eligible account/listing exists, supply the public Android AdMob app ID, approved unit IDs and consent requirements. Implement and verify the live consent/placement path in a separate tested build; approval and earnings cannot be fabricated with test IDs.

## 7. Billing: distinguish no monthly fee from no transaction fee

Existing Sidle Checkout is Stripe-based and supports one-time support/ad-credit payments; it is not a completed Zimbabwe Paynow integration or a recurring-subscription system. Stripe's current direct merchant-country list does not include Zimbabwe. Do not register a false foreign merchant address.

For **strictly zero processing fees**, leave:

```dotenv
ENABLE_PAYMENTS=false
```

Keep `COMMERCIAL_DEPLOYMENT_APPROVED=false` until the actual host/plan has been verified for commercial use. Approving an eligible commercial host later does not require enabling payments or paying a subscription.

Advertising payouts can be received through Google's own payout process without enabling Sidle checkout. If you later accept transaction charges, create and verify your own Zimbabwe merchant account with an eligible provider such as Paynow, inspect its current fee/currency/payout terms, and save integration ID/key securely. Codex can implement and test that separate checkout, authoritative payment-status handling, webhooks, idempotency, refunds/reversals and accounting. Never credit wallets from a browser return URL or mark an unpaid/test transaction as real revenue.

There is no claim that ordinary card/mobile-money processing is free. Adding a Stripe API key does not resolve country eligibility, provider fees or hosting terms.

Calls/live broadcasting remain disabled for this zero-spend pilot. Reliable TURN relay and guarded live streaming require their own capacity, credentials and network/device validation; no unlimited, permanently free service has been provisioned. Neither is required to begin the web ads/account-email setup. Native feature parity, media inspection and staffed operational coverage also remain implementation/operational work rather than switches a provider key can complete.

## 8. Monitoring, backup and security without a paid upgrade

1. In GitHub repository **Actions**, confirm `production health` runs hourly and that your GitHub notification email receives failures. Use a controlled check to verify notifications; do not deliberately break production. The workflow already exists, but a staffed responder still needs a real owner.
2. Keep Supabase email confirmation, HTTPS, RLS and session checks enabled. Do not weaken these to avoid a provider plan requirement. Leaked-password protection and provider recovery features remain limited by the actual plan.
3. Use an authenticator on the owner's accounts and enable available free account MFA. App administrator MFA must only be required after administrator enrollment and recovery are tested.
4. On your own Windows computer, install age using the official package and create the recovery identity locally:

   ```powershell
   winget install --id FiloSottile.age --exact
   age-keygen -o "$env:USERPROFILE\Documents\sidle-recovery.agekey"
   age-keygen -y "$env:USERPROFILE\Documents\sidle-recovery.agekey"
   ```

5. Keep the `.agekey` private identity in a password manager/offline recovery location. Give Codex only the `age1…` **public recipient**, not that private file. Use a private backup directory outside the repository. Do not upload the recovery identity beside the archives.
6. With a verified PostgreSQL network route, current client tools and securely saved database credentials, the repository already supports:

   ```bash
   bash scripts/backup-platform.sh
   python scripts/backup-storage.py
   ```

   Required bindings: `BACKUP_AGE_RECIPIENT`, `BACKUP_DIRECTORY`, existing database/Supabase credentials and the correct database CA when needed. Direct database TCP access is not available in every cloud environment; an HTTPS management connection does not replace `pg_dump`. Do not bypass TLS or assume the scripts ran successfully here.

7. Copy encrypted database and Storage archives **and their checksums** to your own offsite storage. A manual upload needs no Drive integration credential; automation requires separately authorized storage access. Keep a small documented retention schedule within the free allowance, verify uploads, and record failures.
8. Restore to an isolated disposable provider-compatible target, check hashes, grants/RLS, Auth and Storage bytes, and measure the recovery time. `restore-scratch.sh` refuses the production/nonempty target. A file backup, provider flag or synthetic local test alone is not a successful production recovery drill.

## 9. Information/access needed to continue

Already confirmed: Zimbabwe, Android phone, **no owned domain**, priority = earn revenue from showing ads. Existing Supabase access is available; do not send its password again.

| Needed                                                                | Safe way to provide it                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedicated Gmail account + SMTP app password for the free pilot        | Six `SMTP_*` cloud secure bindings above. Keep Google account login/recovery and its password private.                                                                        |
| Owned domain/DNS and approved transactional sender, if later obtained | Brevo route above. Use scoped connections/tokens, not registrar passwords; no domain purchase is included now.                                                                |
| Controlled email test recipient                                       | Email address plus approval for a few tests; no inbox password required.                                                                                                      |
| Netlify account/project                                               | Connect GitHub/import the site, send its public URL, and save a deployment token securely if automation is desired.                                                           |
| Expo + Firebase                                                       | Expo project UUID, public Android client file through an EAS file variable, private FCM credential through EAS Credentials; secure `EXPO_TOKEN` for CLI automation if needed. |
| AdSense                                                               | Your own account, public site, publisher/verification ID and exact ads.txt entry first; ad-unit IDs after approval. Google handles payee/bank details directly.               |
| Recovery                                                              | Public age recipient and an authorized offsite destination; keep the private recovery identity yourself.                                                                      |
| Support/moderation                                                    | Real monitored support address and responsible owner.                                                                                                                         |

Do not paste secrets, government ID, bank details or recovery private keys into chat. Public project IDs, domain/URL and ad identifiers are sufficient for the initial coordination. Optional paid checkout remains disabled under the zero-spend instruction.

## Sources checked 26 October 2026

- [Vercel Hobby commercial-use restriction](https://vercel.com/docs/plans/hobby)
- [Netlify pricing and hard free-plan cap](https://www.netlify.com/pricing/) · [commercial use on Free](https://www.netlify.com/blog/introducing-netlify-free-plan/) · [Next.js adapter](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)
- [Render Free limitations](https://render.com/docs/free) · [Supabase pricing](https://supabase.com/pricing)
- [Brevo pricing](https://www.brevo.com/pricing/) · [SMTP settings/key](https://developers.brevo.com/docs/smtp-integration) · [domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Resend pricing](https://resend.com/pricing) · [SMTP](https://resend.com/docs/send-with-smtp)
- [Google app passwords](https://support.google.com/accounts/answer/185833?hl=en) · [Gmail limits](https://support.google.com/mail/answer/22839?hl=en) · [Gmail app-password access](https://support.google.com/mail/answer/7126229?hl=en) · [Supabase custom SMTP and rate limits](https://supabase.com/docs/guides/auth/auth-smtp)
- [Expo pricing](https://expo.dev/pricing) · [Expo push cost](https://docs.expo.dev/push-notifications/faq/) · [Firebase pricing/FCM](https://firebase.google.com/pricing)
- [AdSense availability](https://support.google.com/adsense/answer/13402307?hl=en) · [free participation](https://support.google.com/adsense/answer/9712?hl=en) · [consent requirements](https://support.google.com/adsense/answer/13554116?hl=en) · [AdMob app review](https://support.google.com/admob/answer/10564477?hl=en)
- [AdSense verification methods and metadata](https://support.google.com/adsense/answer/7584263?hl=en)
- [Stripe merchant countries](https://stripe.com/global) · [Paynow fees](https://www.paynow.co.zw/Home/Fees)
- [Google Play registration](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en) · [Apple enrollment fees](https://developer.apple.com/programs/enroll/) · [Google storage plans](https://one.google.com/about/plans)
