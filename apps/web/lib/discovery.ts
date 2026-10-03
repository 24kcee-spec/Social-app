import { createDiscoveryClient, type DiscoveryClient } from "@sp/profile-client";
import { getAuth } from "./auth";

let client: DiscoveryClient | null = null;

export function getDiscoveryClient(): DiscoveryClient {
  client ??= createDiscoveryClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}
