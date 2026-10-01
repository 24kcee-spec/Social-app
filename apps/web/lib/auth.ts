import { createAuthClient, type AuthClient } from "@sp/auth-client";

let client: AuthClient | null = null;

export function isConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Browser-only singleton (uses localStorage + reads recovery links from the URL). */
export function getAuth(): AuthClient {
  client ??= createAuthClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    detectSessionInUrl: true,
  });
  return client;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}
