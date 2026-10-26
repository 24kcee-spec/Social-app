import { expect, it, vi } from 'vitest';
import type { SqlRunner } from '../src/migrate';
import { createPushQueueDetector } from '../src/messaging/queue';

it('does not query at construction and discovers an additive migration later', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ installed: false }] })
    .mockResolvedValueOnce({ rows: [{ installed: true }] });
  const detect = createPushQueueDetector({ query } as unknown as SqlRunner);
  expect(query).not.toHaveBeenCalled();
  expect(await detect()).toBe(false);
  expect(await detect()).toBe(true);
  expect(await detect()).toBe(true);
  expect(query).toHaveBeenCalledTimes(2);
});
it('does not cache an unavailable database as a missing queue', async () => {
  const query = vi
    .fn()
    .mockRejectedValueOnce(new Error('temporarily unavailable'))
    .mockResolvedValueOnce({ rows: [{ installed: true }] });
  const detect = createPushQueueDetector({ query } as unknown as SqlRunner);
  await expect(detect()).rejects.toThrow('temporarily unavailable');
  expect(await detect()).toBe(true);
});
