import { useState } from 'react';
import Constants from 'expo-constants';
import { Text, View } from 'react-native';
import { Banner, Button } from './ui';
import { useTheme } from './theme';

type AdSdk = typeof import('react-native-google-mobile-ads');

/** Internal APK only. Real publisher units are never requested by this preview. */
export function AdPreview() {
  const { colors } = useTheme();
  const [sdk, setSdk] = useState<AdSdk | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const enabled = Constants.expoConfig?.extra?.mobileAdPreview === true;
  if (!enabled) return null;

  const preview = async () => {
    if (busy || sdk) return;
    setBusy(true);
    setError(null);
    try {
      if (Constants.appOwnership === 'expo') throw new Error('Installed APK required');
      // Keep Expo Go and normal builds working: load the native module on demand.
      const ads = require('react-native-google-mobile-ads') as AdSdk;
      await ads.default().initialize();
      setSdk(ads);
    } catch {
      setError('The ad preview could not start. Use the installed APK and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{ gap: 10, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 16 }}
    >
      <Text style={{ color: colors.text, fontWeight: '700' }}>Test sponsored placement</Text>
      <Text style={{ color: colors.textMuted }}>
        This APK includes Google test ads. They do not earn money. Showing the preview connects to
        Google; nothing is requested until you choose to show it.
      </Text>
      {!sdk && (
        <Button
          label={busy ? 'Loading preview…' : 'Show test ad'}
          disabled={busy}
          secondary
          onPress={() => void preview()}
        />
      )}
      {error && <Banner tone="error">{error}</Banner>}
      {sdk && (
        <View style={{ alignItems: 'center', minHeight: 60 }}>
          <sdk.BannerAd
            unitId={sdk.TestIds.BANNER}
            size={sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdLoaded={() => {
              setLoaded(true);
              setError(null);
            }}
            onAdFailedToLoad={() =>
              setError('The test ad could not load. Check your connection and reopen this screen.')
            }
          />
          {loaded && <Text style={{ color: colors.textMuted }}>Google test ad loaded</Text>}
        </View>
      )}
    </View>
  );
}
