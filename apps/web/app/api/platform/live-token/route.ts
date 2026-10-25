import { platformUser, apiFailure, HttpFailure } from '../../../../lib/platform-server';
import { liveGrant } from '../../../../lib/live-server';
export async function POST(request: Request) {
  try {
    const user = await platformUser(request);
    const input = await request.json();
    if (!/^[0-9a-f-]{36}$/i.test(input.id)) throw new HttpFailure(400, 'Invalid room.');
    return Response.json(await liveGrant(user, input.id), {
      headers: { 'cache-control': 'private,no-store' },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
