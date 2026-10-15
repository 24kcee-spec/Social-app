import { createSafetyClient, type SafetyClient } from "@sp/profile-client";
import { auth, config } from "./auth";

let client: SafetyClient | null = null;

export function getSafetyClient(): SafetyClient {
  client ??= createSafetyClient({
    apiUrl: config.apiUrl,
    getAccessToken: () => auth.getAccessToken(),
  });
  return client;
}

export type { SafetyClient };
