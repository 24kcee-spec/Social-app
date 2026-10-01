import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAuthClient } from "@sp/auth-client";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const config = {
  supabaseUrl: extra.supabaseUrl ?? "",
  publishableKey: extra.supabasePublishableKey ?? "",
  apiUrl: extra.apiUrl ?? "http://localhost:4000",
  webUrl: extra.webUrl ?? "http://localhost:3000",
};

export const isConfigured = Boolean(config.supabaseUrl && config.publishableKey);

/** Sessions persist in AsyncStorage so the user stays signed in between launches. */
export const auth = createAuthClient({
  supabaseUrl: config.supabaseUrl || "https://not-configured.invalid",
  publishableKey: config.publishableKey || "not-configured",
  apiUrl: config.apiUrl,
  storage: AsyncStorage,
  detectSessionInUrl: false,
});

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
