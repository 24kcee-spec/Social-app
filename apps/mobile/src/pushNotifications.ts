import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { PushPlatform } from "@sp/types";
import { getMessagingClient } from "./messagingClient";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const TOKEN_STORAGE_KEY = "@social/push-token";
export type PushPermissionStatus = "granted" | "undetermined" | "denied" | "unsupported";
export type PushRegistrationResult = "registered" | "permission-required" | "denied" | "unsupported";

type NativePushPlatform = Extract<PushPlatform, "android" | "ios">;

function nativePlatform(): NativePushPlatform | null {
  return Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    description: "New direct messages and connection requests",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#635BFF",
  });
}

async function registerWithGrantedPermission(platform: NativePushPlatform): Promise<void> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("Push notifications need the Expo project ID. Link the app with EAS and rebuild it first.");
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await getMessagingClient().registerPushToken(platform, token);
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!nativePlatform()) return "unsupported";
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted || permissions.status === "granted") return "granted";
  return permissions.canAskAgain ? "undetermined" : "denied";
}

/** Called from the user's Notifications settings screen; does not prompt on app launch. */
export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  const platform = nativePlatform();
  if (!platform) return "unsupported";

  await ensureAndroidChannel();
  let permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.status !== "granted") {
    permissions = await Notifications.requestPermissionsAsync();
  }
  if (!permissions.granted && permissions.status !== "granted") {
    return permissions.canAskAgain ? "permission-required" : "denied";
  }

  await registerWithGrantedPermission(platform);
  return "registered";
}

/** Re-registers an already-authorized device on sign-in/token refresh without showing a new prompt. */
export async function syncPushTokenIfPermitted(): Promise<void> {
  const platform = nativePlatform();
  if (!platform) return;
  await ensureAndroidChannel();
  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.status !== "granted") return;
  await registerWithGrantedPermission(platform);
}

/** Remove the API registration before sign-out so the signed-out account no longer targets this device. */
export async function unregisterRegisteredPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;
  await getMessagingClient().removePushToken(token);
  await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
}
