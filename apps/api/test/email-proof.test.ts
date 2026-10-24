import { describe, expect, it, vi } from 'vitest';
import { createEmailProofReader, EmailProofUnavailable } from '../src/profile/email-proof';

const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = {
  id: uid,
  email: 'Student@students.nust.ac.zw',
  email_confirmed_at: '2026-10-24T10:00:00Z',
};
const reader = (body: unknown, status = 200) =>
  createEmailProofReader({
    supabaseUrl: 'https://test.supabase.co',
    publishableKey: 'public-test-key',
    fetchImpl: vi.fn(async () => new Response(JSON.stringify(body), { status })) as typeof fetch,
  });

describe('server-verified academic email ownership', () => {
  it('requires a confirmed current email for the authenticated account', async () => {
    expect(await reader(user)('token', uid)).toBe('student@students.nust.ac.zw');
    expect(await reader({ ...user, email_confirmed_at: null })('token', uid)).toBeNull();
    expect(await reader({ ...user, id: 'other' })('token', uid)).toBeNull();
    expect(await reader({ ...user, email_confirmed_at: 'invalid' })('token', uid)).toBeNull();
  });
  it('does not trust user-editable confirmation metadata', async () => {
    expect(
      await reader({ ...user, email_confirmed_at: null, user_metadata: { email_verified: true } })(
        'token',
        uid,
      ),
    ).toBeNull();
  });
  it('fails closed for provider errors and missing configuration', async () => {
    await expect(reader({}, 503)('token', uid)).rejects.toBeInstanceOf(EmailProofUnavailable);
    expect(await reader({}, 401)('token', uid)).toBeNull();
    await expect(
      createEmailProofReader({ supabaseUrl: 'https://test.supabase.co' })('token', uid),
    ).rejects.toBeInstanceOf(EmailProofUnavailable);
  });
});
