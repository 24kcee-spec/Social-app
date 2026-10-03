import { createDiscoveryClient, type DiscoveryClient } from "@sp/profile-client";
import { auth, config } from "./auth";

let client: DiscoveryClient | null = null;

export function getDiscoveryClient(): DiscoveryClient {
  client ??= createDiscoveryClient({ apiUrl: config.apiUrl, getAccessToken: () => auth.getAccessToken() });
  return client;
}
