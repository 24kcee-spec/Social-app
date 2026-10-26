type AdSdk = typeof import('react-native-google-mobile-ads');

/** No SDK initialization until fresh UMP consent permits requests. No profile/message targeting. */
export async function prepareAdSession(sdk: AdSdk, isCurrent: () => boolean) {
  const consent = await sdk.AdsConsent.gatherConsent();
  if (!consent.canRequestAds || !isCurrent()) return { ...consent, ready: false };
  await sdk.default().setRequestConfiguration({
    maxAdContentRating: sdk.MaxAdContentRating.G,
    publisherPrivacyPersonalizationState: 'disabled',
  });
  if (!isCurrent()) return { ...consent, ready: false };
  await sdk.default().initialize();
  return { ...consent, ready: isCurrent() };
}

/** Caller removes the banner before opening options; this never initializes or loads an ad. */
export async function updateAdPrivacy(sdk: AdSdk) {
  const info = await sdk.AdsConsent.requestInfoUpdate();
  if (info.privacyOptionsRequirementStatus === sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED)
    return sdk.AdsConsent.showPrivacyOptionsForm();
  return info;
}
