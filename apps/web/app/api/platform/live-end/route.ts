import { platformUser, apiFailure, HttpFailure } from '../../../../lib/platform-server';
import { endLiveRoom } from '../../../../lib/live-server';
export async function POST(request: Request) {
  try {
    const user = await platformUser(request);
    const { id } = await request.json();
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpFailure(400, 'Invalid room.');
    const response = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/sidle_platform', {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
        authorization: `Bearer ${user.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ action: 'live.end', input: { id } }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || !data.ended) throw new HttpFailure(403, 'This broadcast is unavailable.');
    await endLiveRoom(id);
    return Response.json({ ended: true }, { headers: { 'cache-control': 'private,no-store' } });
  } catch (error) {
    return apiFailure(error);
  }
}
