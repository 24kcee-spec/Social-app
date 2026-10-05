import { createConnectionsClient, type ConnectionsClient } from "@sp/profile-client";
import { getAuth } from "./auth";

let client: ConnectionsClient | null = null;

export function getConnectionsClient(): ConnectionsClient {
  client ??= createConnectionsClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}
