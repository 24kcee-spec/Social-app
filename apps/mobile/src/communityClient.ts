import { createCommunityClient, type CommunityClient } from "@sp/profile-client";
import { auth, config } from "./auth";

let client: CommunityClient | null = null;

export function getCommunityClient(): CommunityClient {
  client ??= createCommunityClient({ apiUrl: config.apiUrl, getAccessToken: () => auth.getAccessToken() });
  return client;
}
