import { useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { Platform, Text, View } from 'react-native';
import { prepareAdSession, updateAdPrivacy } from './ads-session';
import { Banner, Button } from './ui';
import { useTheme } from './theme';

type AdSdk = typeof import('react-native-google-mobile-ads');

/** One optional placement in discovery. Never mounted in conversations or account flows. */
export function SponsoredBanner() {
  const { colors } = useTheme();
  const [sdk, setSdk] = useState<AdSdk | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const attempt = useRef(0);
  const extra = Constants.expoConfig?.extra;
  const enabled = !__DEV__ && Platform.OS === 'android' &&
    extra?.mobileAdsEnabled === true && extra?.mobileAdPreview !== true;
  const unitId = typeof extra?.admobBannerUnitId === 'string' ? extra.admobBannerUnitId : '';
  useEffect(() => () => { attempt.current++; }, []);
  if (!enabled || !/^ca-app-pub-[0-9]{16}\/[0-9]{10}$/.test(unitId)) return null;

  const run = async (privacy: boolean) => {
    if (pending.current) return;
    pending.current = true;
    const current = ++attempt.current;
    const isCurrent = () => attempt.current === current;
    setBusy(true);
    setError(null);
    setNotice(null);
    // Remove any existing banner before privacy changes or another consent attempt.
    setSdk(null);
    try {
      if (Constants.appOwnership === 'expo') throw new Error('Native app required');
      const ads = require('react-native-google-mobile-ads') as AdSdk;
      if (privacy) {
        await updateAdPrivacy(ads);
        if (isCurrent()) setNotice('Your advertising privacy choices are up to date.');
      } else {
        const session = await prepareAdSession(ads, isCurrent);
        if (isCurrent()) {
          if (session.ready) setSdk(ads);
          else setNotice('Sponsored content is unavailable with the current privacy settings.');
        }
      }
    } catch {
      if (isCurrent()) setError('Sponsored content is unavailable right now. You can keep using Sidle.');
    } finally {
      if (isCurrent()) {
        pending.current = false;
        setBusy(false);
      }
    }
  };

  return (
    <View style={{ marginVertical: 24, padding: 16, gap: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.line }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>Sponsored</Text>
      {sdk ? (
        <View style={{ alignItems: 'center', minHeight: 70 }}>
          <sdk.BannerAd
            unitId={unitId}
            size={sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={() => setError('No sponsored content is available right now.')}
            onAdLoaded={() => setError(null)}
          />
        </View>
      ) : (
        <>
          <Text style={{ color: colors.textMuted }}>
            Sponsored content helps support Sidle. Google processes device information to deliver ads.
            Your private conversations and profile details are not sent for ad targeting.
          </Text>
          <Button label={busy ? 'Please wait…' : 'Show sponsored content'} secondary disabled={busy} onPress={() => void run(false)} />
        </>
      )}
      {notice && <Text accessibilityLiveRegion="polite" style={{ color: colors.textMuted }}>{notice}</Text>}
      {error && <Banner tone="error">{error}</Banner>}
      <View style={{ gap: 12 }}>
        <Button label="Ad privacy choices" secondary disabled={busy} onPress={() => void run(true)} />
        {sdk && <Button label="Hide ad" secondary onPress={() => { attempt.current++; setSdk(null); setError(null); }} />}
      </View>
    </View>
  );
}
