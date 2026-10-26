import { createPlatformClient, type PlatformClient } from '@sp/profile-client';
import { auth, config } from './auth';

let client: PlatformClient | null = null;

/**
 * Session-scoped access to Sidle's first-party product RPCs.
 * Only the public Supabase URL/key and the current member JWT are used here.
 */
export function getPlatformClient(): PlatformClient {
  client ??= createPlatformClient({
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.publishableKey,
    getAccessToken: () => auth.getAccessToken(),
  });
  return client;
}
