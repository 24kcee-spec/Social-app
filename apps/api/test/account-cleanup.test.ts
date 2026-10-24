import { describe, expect, it, vi } from 'vitest';
import { createAccountCleanupWorker } from '../src/safety/cleanup';
import type { SqlRunner } from '../src/migrate';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(responses: Response[]) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.startsWith('select') ? [{ user_id: userId }] : [],
  }));
  const fetchImpl = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  });
  const worker = createAccountCleanupWorker({ query, exec: vi.fn() } as unknown as SqlRunner, {
    supabaseUrl: 'https://test.supabase.co',
    secretKey: 'test-server-key',
    fetchImpl: fetchImpl as typeof fetch,
  });
  return { query, fetchImpl, worker };
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('durable Storage/Auth erasure', () => {
  it('deletes scoped media, re-lists at offset zero, then deletes Auth; 404 is idempotent', async () => {
    const f = fixture([
      response([{ name: 'photo.jpg', id: 'file' }]),
      response([]),
      response([]),
      response({}, 404),
    ]);
    await f.worker();
    expect(f.fetchImpl).toHaveBeenCalledTimes(4);
    expect(
      JSON.parse((f.fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string),
    ).toEqual({ prefixes: [`${userId}/photo.jpg`] });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('completed_at = now()'))).toBe(true);
  });
  it('keeps a retryable job and never deletes Auth after storage failure', async () => {
    const f = fixture([response({}, 503)]);
    await f.worker();
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('next_attempt_at = now()'))).toBe(true);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('completed_at = now()'))).toBe(false);
  });
  it("does not follow a path outside the deleted user's storage prefix", async () => {
    const f = fixture([response([{ name: '../other.jpg', id: 'file' }])]);
    await f.worker();
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.some(([sql]) => sql.includes('completed_at = now()'))).toBe(false);
  });
});
