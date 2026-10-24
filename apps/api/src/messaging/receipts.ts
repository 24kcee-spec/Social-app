import type { SqlRunner } from '../migrate';

/** Receipts report acceptance by FCM/APNs, not that a person saw an alert. */
export function createReceiptWorker(
  db: SqlRunner,
  options: { fetchImpl?: typeof fetch; accessToken?: string } = {},
) {
  return async () => {
    await db.query(
      "update push_delivery_receipts set checked_at = now(), outcome = 'expired' where checked_at is null and created_at < now() - interval '24 hours'",
    );
    const { rows } = await db.query<{ ticket_id: string; token: string }>(
      'select ticket_id, token from push_delivery_receipts where checked_at is null and next_attempt_at <= now() order by created_at limit 100',
    );
    if (rows.length) {
      const response = await (options.fetchImpl ?? fetch)(
        'https://exp.host/--/api/v2/push/getReceipts',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
          },
          body: JSON.stringify({ ids: rows.map((r) => r.ticket_id) }),
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Push receipt request failed');
      const result = (await response.json()) as {
        data?: Record<string, { status: string; details?: { error?: string } }>;
      };
      if (!result.data || typeof result.data !== 'object')
        throw new Error('Invalid push receipt response');
      for (const row of rows) {
        const receipt = result.data[row.ticket_id];
        if (!receipt) {
          await db.query(
            "update push_delivery_receipts set next_attempt_at = now() + interval '5 minutes' where ticket_id = $1",
            [row.ticket_id],
          );
          continue;
        }
        const unregistered =
          receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered';
        if (unregistered)
          await db.query('delete from device_push_tokens where token = $1', [row.token]);
        await db.query(
          'update push_delivery_receipts set checked_at = now(), outcome = $2 where ticket_id = $1',
          [
            row.ticket_id,
            unregistered ? 'unregistered' : receipt.status === 'ok' ? 'accepted' : 'provider_error',
          ],
        );
      }
    }
    await db.query(
      "delete from push_delivery_receipts where checked_at < now() - interval '7 days'",
    );
  };
}
