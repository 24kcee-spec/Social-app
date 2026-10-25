import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { HttpFailure, providerCapabilities, serverRpc } from './platform-server';
export async function liveGrant(
  user: { id: string; token: string; sessionId: string },
  id: string,
) {
  if (!providerCapabilities().live)
    throw new HttpFailure(503, 'Live broadcasting requires a configured LiveKit server.');
  const response = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/sidle_platform', {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
      authorization: `Bearer ${user.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'live.join', input: { id } }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpFailure(403, 'This live room is unavailable.');
  const access = await serverRpc<{ allowed: boolean; guardReady: boolean }>('sidle_live_access', {
    room_id: id,
    member_id: user.id,
    session_id: user.sessionId,
  });
  if (!access.allowed || !access.guardReady)
    throw new HttpFailure(
      503,
      'Live access checks are unavailable. Start the membership guard before enabling broadcasts.',
    );
  const room = (await response.json()) as { owner: boolean };
  const name = 'sidle-' + id;
  const url = process.env.LIVEKIT_URL!;
  if (room.owner) {
    const client = new RoomServiceClient(
      url.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    await client.createRoom({
      name,
      emptyTimeout: 60,
      maxParticipants: Math.max(
        2,
        Math.min(100, Number(process.env.LIVEKIT_MAX_PARTICIPANTS) || 25),
      ),
    });
  }
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: user.id,
    ttl: '60s',
    metadata: JSON.stringify({ sessionId: user.sessionId }),
  });
  token.addGrant({
    room: name,
    roomJoin: true,
    canPublish: room.owner,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return { url, token: await token.toJwt(), owner: room.owner };
}
export async function endLiveRoom(id: string) {
  if (providerCapabilities().live) {
    const client = new RoomServiceClient(
      process.env.LIVEKIT_URL!.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
    );
    await client.deleteRoom('sidle-' + id);
  }
}
