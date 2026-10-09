import { createCommunityClient, type CommunityClient } from "@sp/profile-client";
import { getAuth } from "./auth";

let client: CommunityClient | null = null;

export function getCommunityClient(): CommunityClient {
  client ??= createCommunityClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}
