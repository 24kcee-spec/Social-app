import { describe, expect, it, vi } from 'vitest';
import { createProductClient } from './product';

function setup() {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response('[]', { status: 200 }));
  const getAccessToken = vi.fn(async () => 'user-jwt');
  const client = createProductClient({
    supabaseUrl: 'https://project.supabase.co/',
    publishableKey: 'public-key',
    getAccessToken,
    fetchImpl,
  });
  return { client, fetchImpl, getAccessToken };
}
describe('Supabase product client', () => {
  it('uses only current-session authorization, avoids caches and rejects credential redirects', async () => {
    const { client, fetchImpl } = setup();
    await client.setSaved('person-id', true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/sidle_save_introduction',
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'error',
        headers: {
          apikey: 'public-key',
          authorization: 'Bearer user-jwt',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ target_id: 'person-id', saved: true }),
      }),
    );
  });
  it('refreshes the token on every call and refuses signed-out calls', async () => {
    const { client, fetchImpl, getAccessToken } = setup();
    await client.listSaved();
    getAccessToken.mockResolvedValueOnce('new-jwt');
    await client.listSaved();
    expect(fetchImpl.mock.calls[1]![1]!.headers).toMatchObject({ authorization: 'Bearer new-jwt' });
    getAccessToken.mockResolvedValueOnce('');
    await expect(client.listSaved()).rejects.toThrow('Sign in');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('batches and deduplicates people IDs without exceeding the RPC bound', async () => {
    const { client, fetchImpl } = setup();
    await client.getPeopleContext([...Array.from({ length: 101 }, (_, i) => String(i)), '0']);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).user_ids.length),
    ).toEqual([50, 50, 1]);
  });
  it('keeps the supplied feedback retry ID intact', async () => {
    const { client, fetchImpl } = setup();
    await client.submitFeedback('stable-retry-id', 'bug', 'A reproducible bug');
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body))).toEqual({
      client_id: 'stable-retry-id',
      category: 'bug',
      body: 'A reproducible bug',
    });
  });
  it.each(['42501', '22023', '54000', 'XX000'])(
    'returns a usable error without disclosing SQL/provider internals (%s)',
    async (code) => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValueOnce(
        new Response(JSON.stringify({ code, message: 'private provider internals' }), {
          status: 400,
        }),
      );
      await expect(client.getContext()).rejects.not.toThrow('private provider internals');
    },
  );
  it('reports an unconfirmed write on network failure', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockRejectedValueOnce(new Error('Network offline'));
    await expect(client.setSaved('target', true)).rejects.toThrow('not been confirmed');
  });
});
