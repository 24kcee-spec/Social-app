import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createMessagingClient } from '@sp/profile-client';
import { auth, config } from './auth';

const key = (userId: string) => `sidle-push:${userId}`;
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Serialize rotation/opt-in/sign-out so a late refresh cannot restore a removed token.
let pending: Promise<unknown> = Promise.resolve();
function deviceOperation<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work);
  pending = result.catch(() => undefined);
  return result;
}
async function boundClient(userId: string) {
  const { data } = await auth.getSupabaseClient().auth.getSession();
  if (!data.session || data.session.user.id !== userId)
    throw new Error('Sign in again before changing phone alerts.');
  const token = data.session.access_token;
  return createMessagingClient({ apiUrl: config.apiUrl, getAccessToken: async () => token });
}

export function enableDevicePush(userId: string, askPermission = true) {
  return deviceOperation(async () => {
    if (!askPermission && !(await AsyncStorage.getItem(key(userId)))) return;
    const client = await boundClient(userId);
    if (Platform.OS !== 'android' && Platform.OS !== 'ios')
      throw new Error('Phone alerts require an installed Android/iOS build.');
    if (Constants.appOwnership === 'expo')
      throw new Error('Phone alerts require the installed EAS build, not Expo Go.');
    const delivery = await client.getNotificationDelivery();
    if (delivery.provider !== 'expo')
      throw new Error('Phone alerts are not enabled on this server yet.');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) throw new Error('This build is not linked to an Expo project.');
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && askPermission)
      permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) throw new Error('Phone alerts are off in device settings.');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const previous = await AsyncStorage.getItem(key(userId));
    if (previous && previous !== token) await client.removePushToken(previous);
    await client.registerPushToken(Platform.OS, token);
    await AsyncStorage.setItem(key(userId), token);
  });
}

export function disableDevicePush(userId: string) {
  return deviceOperation(async () => {
    const token = await AsyncStorage.getItem(key(userId));
    if (token) await (await boundClient(userId)).removePushToken(token);
    await AsyncStorage.removeItem(key(userId));
  });
}

export function startPushLifecycle(userId: string) {
  let active = true;
  const refresh = async () => {
    if (active && (await AsyncStorage.getItem(key(userId)))) await enableDevicePush(userId, false);
  };
  void refresh().catch(() => undefined);
  const subscription = Notifications.addPushTokenListener(() => {
    void refresh().catch(() => undefined);
  });
  return () => {
    active = false;
    subscription.remove();
  };
}

export function subscribeToMessageAlerts(open: (conversationId: string) => void) {
  let active = true;
  const seen = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response || seen.has(response.notification.request.identifier)) return;
    seen.add(response.notification.request.identifier);
    const data = response.notification.request.content.data;
    if (
      data?.type === 'message' &&
      typeof data.conversationId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.conversationId)
    )
      open(data.conversationId);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  void Notifications.getLastNotificationResponseAsync()
    .then(handle)
    .catch(() => undefined);
  return () => {
    active = false;
    subscription.remove();
  };
}
