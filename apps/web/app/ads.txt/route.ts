import { adsenseVerification } from '../../lib/adsense-verification';

export const dynamic = 'force-dynamic';

export async function GET() {
  const record = adsenseVerification(process.env)?.adsTxt;
  return new Response(record ?? 'Advertising authorization is not configured.\n', {
    status: record ? 200 : 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': record ? 'public, max-age=3600' : 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
