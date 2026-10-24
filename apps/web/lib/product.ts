import { createProductClient } from '@sp/profile-client';
import { getAuth } from './auth';

let client: ReturnType<typeof createProductClient> | undefined;
export function getProductClient() {
  return (client ??= createProductClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    getAccessToken: () => getAuth().getAccessToken(),
  }));
}
