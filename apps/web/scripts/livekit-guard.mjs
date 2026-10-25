/** Self-hosted service. Provider credentials are read only from its server environment. */
import { RoomServiceClient } from 'livekit-server-sdk';
const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY } =
  process.env;
if (
  !LIVEKIT_URL ||
  !LIVEKIT_API_KEY ||
  !LIVEKIT_API_SECRET ||
  !SUPABASE_URL ||
  !SUPABASE_SECRET_KEY
)
  throw new Error('LiveKit guard requires server configuration.');
const service = new RoomServiceClient(
  LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'),
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
);
async function access(input) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/sidle_live_access', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SECRET_KEY,
      authorization: 'Bearer ' + SUPABASE_SECRET_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Membership check unavailable.');
  return await response.json();
}
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
while (!stopping) {
  try {
    for (const room of await service.listRooms()) {
      if (!/^sidle-[0-9a-f-]{36}$/i.test(room.name)) continue;
      const id = room.name.slice(6);
      const status = await access({ room_id: id });
      if (!status.active) {
        await service.deleteRoom(room.name);
        continue;
      }
      for (const member of await service.listParticipants(room.name)) {
        let sessionId = '';
        try {
          sessionId = JSON.parse(member.metadata ?? '{}').sessionId ?? '';
        } catch {}
        const valid =
          /^[0-9a-f-]{36}$/i.test(member.identity) &&
          sessionId &&
          (await access({ room_id: id, member_id: member.identity, session_id: sessionId }))
            .allowed;
        if (!valid) await service.removeParticipant(room.name, member.identity);
      }
    }
    await access({ room_id: null, heartbeat: true });
    console.log(
      JSON.stringify({
        service: 'sidle-live-guard',
        status: 'ready',
        at: new Date().toISOString(),
      }),
    );
  } catch {
    console.error(
      JSON.stringify({
        service: 'sidle-live-guard',
        status: 'unavailable',
        at: new Date().toISOString(),
      }),
    );
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 30000));
}
