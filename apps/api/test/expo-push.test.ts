import { describe, expect, it, vi } from 'vitest';
import { createExpoPushSender, GENERIC_PUSH } from '../src/messaging/notify';
import { createReceiptWorker } from '../src/messaging/receipts';
import type { SqlRunner } from '../src/migrate';

const payload = {
  ...GENERIC_PUSH,
  data: { type: 'message' as const, conversationId: 'conversation', messageId: 'message' },
};
const token = { platform: 'android' as const, token: 'ExpoPushToken[token_123]' };
describe('Expo push transport', () => {
  it('checks tickets, stores receipt pointers and removes rejected device tokens', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { status: 'ok', id: 'ticket-1' },
              { status: 'error', details: { error: 'DeviceNotRegistered' } },
            ],
          }),
        ),
    );
    const onTicket = vi.fn(async () => {}),
      onUnregistered = vi.fn(async () => {});
    await createExpoPushSender({ fetchImpl, onTicket, onUnregistered }).send(
      [token, { ...token, token: 'ExpoPushToken[old_token]' }],
      payload,
    );
    expect(onTicket).toHaveBeenCalledWith('ticket-1', token.token);
    expect(onUnregistered).toHaveBeenCalledWith('ExpoPushToken[old_token]');
    const messages = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(messages[0]).toMatchObject({ title: 'New message', body: 'Open the app to read it' });
  });
  it('does not silently accept HTTP failure or retry an ambiguous send', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }));
    await expect(createExpoPushSender({ fetchImpl }).send([token], payload)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('batches at 100 and never sends unsupported raw device tokens to Expo', async () => {
    const batchSizes: number[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const messages = JSON.parse(init?.body as string) as unknown[];
      batchSizes.push(messages.length);
      return new Response(
        JSON.stringify({ data: messages.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) }),
      );
    });
    await createExpoPushSender({ fetchImpl }).send(
      [
        ...Array.from({ length: 201 }, (_, i) => ({
          ...token,
          token: `ExpoPushToken[token_${i}]`,
        })),
        { ...token, token: 'raw-fcm-token' },
      ],
      payload,
    );
    expect(batchSizes).toEqual([100, 100, 1]);
  });
});

it('receipt processing removes devices rejected later by FCM/APNs and records the outcome', async () => {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith('select') ? [{ ticket_id: 'ticket-1', token: token.token }] : [],
  }));
  const fetchImpl = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: { 'ticket-1': { status: 'error', details: { error: 'DeviceNotRegistered' } } },
        }),
      ),
  );
  await createReceiptWorker({ query } as unknown as SqlRunner, { fetchImpl })();
  expect(query).toHaveBeenCalledWith('delete from device_push_tokens where token = $1', [
    token.token,
  ]);
  expect(
    query.mock.calls.some((call) =>
      (call as unknown as [string, unknown[]])[1]?.includes('unregistered'),
    ),
  ).toBe(true);
});
