import { createAuthClient, type AuthClient } from '@sp/auth-client';
import { clearChatStorage } from './chat-state';

let client: AuthClient | null = null;

export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** Browser-only singleton (uses localStorage + reads recovery links from the URL). */
export function getAuth(): AuthClient {
  client ??= createAuthClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    detectSessionInUrl: true,
    apiTimeoutMs: 60000,
  });
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    client.onAuthChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      clearChatStorage(sessionStorage);
      indexedDB.deleteDatabase('sidle-chat-outbox');
    });
  }
  return client;
}
let listening = false;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}
