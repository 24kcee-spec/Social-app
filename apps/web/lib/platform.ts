import { createPlatformClient } from '@sp/profile-client';
import { getAuth } from './auth';

let client: ReturnType<typeof createPlatformClient> | undefined;
export function getPlatformClient() {
  return (client ??= createPlatformClient({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    getAccessToken: () => getAuth().getAccessToken(),
  }));
}
export async function mediaUrl(path: string, seconds = 60) {
  const { data, error } = await getAuth()
    .getSupabaseClient()
    .storage.from('sidle-social-media')
    .createSignedUrl(path, seconds);
  if (error || !data?.signedUrl)
    throw new Error('This media is unavailable or its audience has changed.');
  return data.signedUrl;
}
