import { describe, it, expect, vi } from 'vitest';
import { createPlatformClient } from './platform';
function setup() {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
  const getAccessToken = vi.fn(async () => 'jwt-one');
  return {
    fetchImpl,
    getAccessToken,
    client: createPlatformClient({
      supabaseUrl: 'https://project.supabase.co/',
      publishableKey: 'public-key',
      getAccessToken,
      fetchImpl,
    }),
  };
}
describe('social platform transport', () => {
  it('uses current-session authorization, private caching and redirect refusal', async () => {
    const { client, fetchImpl } = setup();
    await client.listPosts({ kind: 'reel', scope: 'following' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/sidle_platform',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          apikey: 'public-key',
          authorization: 'Bearer jwt-one',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action: 'posts.list', input: { kind: 'reel', scope: 'following' } }),
      }),
    );
  });
  it('refreshes authorization and refuses signed-out requests before network access', async () => {
    const { client, fetchImpl, getAccessToken } = setup();
    getAccessToken.mockResolvedValueOnce('jwt-two');
    await client.usage();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer jwt-two',
    });
    getAccessToken.mockResolvedValueOnce('');
    await expect(client.usage()).rejects.toMatchObject({ code: 'signed_out', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('keeps mutation IDs and explicit location recipients intact', async () => {
    const { client, fetchImpl } = setup();
    await client.sendRichMessage({
      clientId: 'stable',
      conversationId: 'conversation',
      body: 'Test',
      replyTo: 'earlier',
      assetId: 'asset',
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      action: 'messages.send',
      input: {
        clientId: 'stable',
        conversationId: 'conversation',
        body: 'Test',
        replyTo: 'earlier',
        assetId: 'asset',
      },
    });
    fetchImpl.mockResolvedValueOnce(new Response('{}'));
    await client.startLocation({
      latitude: 1,
      longitude: 2,
      accuracy: 5,
      minutes: 15,
      recipients: ['selected'],
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).input.recipients).toEqual([
      'selected',
    ]);
  });
  it.each(['42501', '54000', '23505', '22023', 'XX000'])(
    'sanitizes SQL/provider errors (%s)',
    async (code) => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValueOnce(
        new Response(JSON.stringify({ code, message: 'private database details' }), {
          status: 400,
        }),
      );
      await expect(client.usage()).rejects.not.toThrow('private database details');
    },
  );
  it('reports ambiguous network writes without silently retrying', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockRejectedValueOnce(new Error('offline'));
    await expect(
      client.createPost({ clientId: 'stable', body: 'Test', audience: 'public', kind: 'post' }),
    ).rejects.toThrow('not been confirmed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('bounds message detail lookups', async () => {
    const { client, fetchImpl } = setup();
    await client.getMessageDetails(Array.from({ length: 110 }, (_, index) => String(index)));
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).input.ids).toHaveLength(100);
  });
});
