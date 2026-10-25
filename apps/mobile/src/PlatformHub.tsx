import { useState } from 'react';
import { Linking, Modal, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { config } from './auth';
import { Button, Banner } from './ui';
import { useTheme } from './theme';
const destinations = [
  ['Feed', '/feed'],
  ['Reels', '/reels'],
  ['Stories', '/stories'],
  ['Music', '/music'],
  ['Create', '/studio'],
  ['Activity', '/activity'],
  ['Search', '/search'],
  ['Calls', '/calls'],
  ['Live location', '/location'],
  ['Live video', '/live'],
  ['Billing & ads', '/billing'],
  ['Account preferences', '/settings'],
];
/** The first-party responsive platform is embedded without exposing native credentials to a bridge. */
export function PlatformHub() {
  const { colors } = useTheme();
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = new URL(config.webUrl).origin;
  const secure = origin.startsWith('https://');
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>Your Sidle</Text>
      <Text style={{ color: colors.textMuted }}>
        Moments, creativity and conversations in one place.
      </Text>
      {!secure && (
        <Banner tone="error">
          Configure PUBLIC_WEB_URL with your HTTPS deployment to open platform features.
        </Banner>
      )}
      <View style={{ gap: 10 }}>
        {destinations.map(([label, href]) => (
          <Button
            key={href}
            label={label!}
            secondary
            disabled={!secure}
            onPress={() => {
              setPath(href!);
              setError(null);
            }}
          />
        ))}
      </View>
      <Text style={{ color: colors.textMuted }}>
        These screens use the same account and database. The embedded browser keeps its own secure
        sign-in session. Calls, recording and location require device permission and support.
      </Text>
      <Modal visible={path !== null} animationType="slide" onRequestClose={() => setPath(null)}>
        <View style={{ flex: 1, paddingTop: 36, backgroundColor: colors.bg }}>
          <Button label="Close platform" secondary onPress={() => setPath(null)} />
          {error && <Banner tone="error">{error}</Banner>}
          {path && (
            <WebView
              source={{ uri: origin + path }}
              style={{ flex: 1 }}
              originWhitelist={[origin]}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              mixedContentMode="never"
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction
              geolocationEnabled
              onShouldStartLoadWithRequest={(request) => {
                if (request.url === 'about:blank') return true;
                try {
                  const url = new URL(request.url);
                  if (url.origin === origin) return true;
                  if (url.protocol === 'https:') void Linking.openURL(url.href);
                } catch {}
                return false;
              }}
              onError={() =>
                setError('Could not open the platform. Check your connection and reopen it.')
              }
              onHttpError={() => setError('The platform could not load this page. Try again.')}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
