import { createSafetyClient, type SafetyClient } from "@sp/profile-client";
import { getAuth } from "./auth";

let client: SafetyClient | null = null;

export function getSafetyClient(): SafetyClient {
  client ??= createSafetyClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}
