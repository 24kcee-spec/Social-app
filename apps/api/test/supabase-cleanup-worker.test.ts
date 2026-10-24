import { describe, expect, it, vi } from 'vitest';
import { createCleanupHandler } from '../../../supabase/functions/sidle-account-cleanup/core';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = () => new Request('https://test.invalid/worker', { method: 'POST', headers: { authorization: 'Bearer worker-test-token' } });
describe('Supabase scheduled account cleanup', () => {
  it('rejects unauthenticated requests before any provider access', async () => {
    const fetchImpl = vi.fn();
    const handler = createCleanupHandler({ projectUrl: 'https://test.supabase.co', serviceKey: 'server-test-key', workerToken: 'worker-test-token', fetchImpl });
    expect((await handler(new Request('https://test.invalid', { method: 'POST' }))).status).toBe(401);
    expect((await handler(new Request('https://test.invalid', { method: 'POST', headers: { authorization: 'worker-test-token' } }))).status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('clears scoped storage before Auth, then marks the queued job complete', async () => {
    const calls: { path: string; body?: unknown }[] = [];
    const responses = [new Response(JSON.stringify([{ user_id: id, attempts: 0 }])), new Response('[]'), new Response(null, { status: 204 }), new Response(null, { status: 204 })];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ path: String(url), body: init?.body ? JSON.parse(init.body as string) : undefined }); return responses.shift()!; });
    const response = await createCleanupHandler({ projectUrl: 'https://test.supabase.co', serviceKey: 'server-test-key', workerToken: 'worker-test-token', fetchImpl })(request());
    expect(await response.json()).toEqual({ completed: 1, failed: 0 });
    expect(calls[1]?.body).toMatchObject({ prefix: `${id}/` });
    expect(calls[2]?.path).toContain(`/auth/v1/admin/users/${id}`);
    expect(calls[3]?.body).toMatchObject({ attempts: 1, completed_at: expect.any(String) });
  });
  it('retains a retryable job and never deletes Auth after a storage failure', async () => {
    const urls: string[] = [];
    const responses = [new Response(JSON.stringify([{ user_id: id, attempts: 0 }])), new Response('{}', { status: 503 }), new Response(null, { status: 204 })];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return responses.shift()!; });
    const response = await createCleanupHandler({ projectUrl: 'https://test.supabase.co', serviceKey: 'server-test-key', workerToken: 'worker-test-token', fetchImpl })(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ completed: 0, failed: 1 });
    expect(urls.some((url) => url.includes('/auth/v1/admin/users/'))).toBe(false);
  });
  it('rejects storage paths that could escape the removed account prefix', async () => {
    const urls: string[] = [];
    const responses = [new Response(JSON.stringify([{ user_id: id, attempts: 0 }])), new Response(JSON.stringify([{ id: 'object', name: '../other-account.jpg' }])), new Response(null, { status: 204 })];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => { urls.push(String(url)); return responses.shift()!; });
    const response = await createCleanupHandler({ projectUrl: 'https://test.supabase.co', serviceKey: 'server-test-key', workerToken: 'worker-test-token', fetchImpl })(request());
    expect(response.status).toBe(503);
    expect(urls.some((url) => url.includes('/auth/v1/admin/users/'))).toBe(false);
  });
});
