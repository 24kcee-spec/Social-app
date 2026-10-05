import { createConnectionsClient, type ConnectionsClient } from "@sp/profile-client";
import { auth, config } from "./auth";

let client: ConnectionsClient | null = null;

export function getConnectionsClient(): ConnectionsClient {
  client ??= createConnectionsClient({ apiUrl: config.apiUrl, getAccessToken: () => auth.getAccessToken() });
  return client;
}
