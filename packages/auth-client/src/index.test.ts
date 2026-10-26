import { describe, expect, it } from 'vitest';
import { AuthClientError, createAuthClient, mapBackendError } from './index';

function backend(overrides: Partial<Parameters<typeof createAuthClient>[0]['backend']> = {}) {
  const session = { access_token: 'token-1' };
  return {
    signUp: async () => ({ data: { session }, error: null }),
    signInWithPassword: async () => ({ data: {}, error: null }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: {}, error: null }),
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    ...overrides,
  } as never;
}

describe('auth client', () => {
  it('requests an explicit email access link without creating an account', async () => {
    let received: unknown;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        signInWithOtp: async (args) => {
          received = args;
          return { data: {}, error: null };
        },
      }),
    });
    await auth.requestEmailAccessLink(
      '  Student@Example.com ',
      'https://app.example.com/?view=settings',
    );
    expect(received).toEqual({
      email: 'student@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://app.example.com/?view=settings',
      },
    });
  });
  it('keeps email-link account existence private but reports provider failures', async () => {
    const make = (error: { code?: string; status?: number }) =>
      createAuthClient({
        supabaseUrl: 'https://x.supabase.co',
        publishableKey: 'pk',
        apiUrl: 'http://api',
        backend: backend({ signInWithOtp: async () => ({ data: {}, error }) }),
      });
    await expect(
      make({ code: 'user_not_found', status: 404 }).requestEmailAccessLink(
        'a@example.com',
        'https://app.example.com',
      ),
    ).resolves.toBeUndefined();
    await expect(
      make({ status: 503 }).requestEmailAccessLink('a@example.com', 'https://app.example.com'),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });
  it('rejects invalid sign-up input', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
    });
    await expect(auth.signUp({ email: 'bad', password: 'short' })).rejects.toMatchObject({
      code: 'validation',
    });
  });
  it('normalises sign-up email and forwards optional display name', async () => {
    let got: unknown;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        signUp: async (args) => {
          got = args;
          return { data: { session: null }, error: null };
        },
      }),
    });
    expect(
      await auth.signUp(
        { email: '  A@Example.com ', password: 'password1', displayName: 'Kay' },
        'https://app.example.com',
      ),
    ).toBe('confirm_email');
    expect(got).toMatchObject({
      email: 'a@example.com',
      options: { data: { display_name: 'Kay' }, emailRedirectTo: 'https://app.example.com' },
    });
  });
  it('resends only signup confirmations and normalises the email', async () => {
    let received: unknown;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        resend: async (args) => {
          received = args;
          return { data: {}, error: null };
        },
      }),
    });
    await auth.resendConfirmation(' A@Example.com ', 'https://app.example.com');
    expect(received).toEqual({
      type: 'signup',
      email: 'a@example.com',
      options: { emailRedirectTo: 'https://app.example.com' },
    });
    await expect(auth.resendConfirmation('bad', 'https://app.example.com')).rejects.toMatchObject({
      code: 'validation',
    });
  });
  it('never reports a provider or configuration failure as a successful email', async () => {
    for (const error of [
      { status: 400, code: 'email_address_not_authorized' },
      { status: 404 },
      { status: 503 },
      { status: 429 },
    ]) {
      const fail = async () => ({ data: null, error });
      const auth = createAuthClient({
        supabaseUrl: 'https://x.supabase.co',
        publishableKey: 'pk',
        apiUrl: 'http://api',
        backend: backend({ resend: fail, resetPasswordForEmail: fail, signInWithOtp: fail }),
      });
      await expect(
        auth.resendConfirmation('a@example.com', 'https://app.example.com'),
      ).rejects.toBeInstanceOf(AuthClientError);
      await expect(
        auth.requestPasswordReset('a@example.com', 'https://app.example.com/reset'),
      ).rejects.toBeInstanceOf(AuthClientError);
      await expect(
        auth.requestEmailAccessLink('a@example.com', 'https://app.example.com'),
      ).rejects.toBeInstanceOf(AuthClientError);
    }
  });
  it('resend keeps unknown accounts private and fails safely without provider support', async () => {
    const config = {
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
    };
    const auth = createAuthClient({
      ...config,
      backend: backend({
        resend: async () => ({ data: null, error: { code: 'user_not_found', status: 404 } }),
      }),
    });
    await expect(
      auth.resendConfirmation('a@example.com', 'https://app.example.com'),
    ).resolves.toBeUndefined();
    await expect(
      createAuthClient({ ...config, backend: backend() }).resendConfirmation(
        'a@example.com',
        'https://app.example.com',
      ),
    ).rejects.toMatchObject({ code: 'service_unavailable' });
  });
  it('maps common backend errors', () => {
    expect(mapBackendError({ status: 429 }).code).toBe('rate_limited');
    expect(mapBackendError({ code: 'invalid_credentials' }).code).toBe('invalid_credentials');
    expect(mapBackendError({ code: 'email_exists' }).code).toBe('already_registered');
    expect(mapBackendError({ status: 503 }).code).toBe('service_unavailable');
    expect(mapBackendError({}).code).toBe('unknown');
  });
  it('uses local sign-out scope', async () => {
    let scope: string | undefined;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        signOut: async (args) => {
          scope = args?.scope;
          return { error: null };
        },
      }),
    });
    await auth.signOut();
    expect(scope).toBe('local');
  });
  it('does not reveal password-reset account existence', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        resetPasswordForEmail: async () => ({
          data: null,
          error: { code: 'user_not_found', status: 404 },
        }),
      }),
    });
    await expect(
      auth.requestPasswordReset('nobody@example.com', 'http://localhost:3000/reset'),
    ).resolves.toBeUndefined();
  });
  it('validates and submits a new password', async () => {
    let password = '';
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        updateUser: async (args) => {
          password = args.password;
          return { data: {}, error: null };
        },
      }),
    });
    await expect(auth.setNewPassword('short')).rejects.toBeInstanceOf(AuthClientError);
    await auth.setNewPassword('long-enough');
    expect(password).toBe('long-enough');
  });
  it('fetches me with the bearer token', async () => {
    let headers: HeadersInit | undefined;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
      fetchImpl: async (_u, init) => {
        headers = init?.headers;
        return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
      },
    });
    await auth.fetchMe();
    expect(headers).toMatchObject({ authorization: 'Bearer token-1' });
  });
  it('returns the access token to shared feature clients', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
    });
    await expect(auth.getAccessToken()).resolves.toBe('token-1');
  });
  it('posts JSON through the shared API request helper', async () => {
    let body = '';
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
      fetchImpl: async (_u, init) => {
        body = String(init?.body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    await expect(auth.apiRequest('/test', { method: 'PUT', body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });
    expect(body).toBe(JSON.stringify({ a: 1 }));
  });
  it('maps api 401 to unauthorized', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 401 }),
    });
    await expect(auth.fetchMe()).rejects.toMatchObject({ code: 'unauthorized' });
  });
  it('maps network failures to service_unavailable', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
      fetchImpl: async () => {
        throw new Error('down');
      },
    });
    await expect(auth.fetchMe()).rejects.toMatchObject({ code: 'service_unavailable' });
  });
  it('aborts a stalled API request and reports service_unavailable', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      apiTimeoutMs: 5,
      backend: backend(),
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new Error('aborted'));
            return;
          }
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });
    await expect(auth.fetchMe()).rejects.toMatchObject({ code: 'service_unavailable' });
  });
  it('does not treat generic 404 reset errors as account enumeration', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        resetPasswordForEmail: async () => ({
          data: null,
          error: { status: 400, message: 'email not found' },
        }),
      }),
    });
    await expect(
      auth.requestPasswordReset('nobody@example.com', 'http://localhost:3000/reset'),
    ).resolves.toBeUndefined();
  });
  it('does not report a secret key anywhere in the shared client config', () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
    });
    expect(Object.keys(auth)).not.toContain('secretKey');
  });
  it('unsubscribes auth listeners', () => {
    let called = false;
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({
        onAuthStateChange: () => ({
          data: {
            subscription: {
              unsubscribe() {
                called = true;
              },
            },
          },
        }),
      }),
    });
    const off = auth.onAuthChange(() => {});
    off();
    expect(called).toBe(true);
  });
  it('keeps missing sessions as a controlled auth error', async () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend({ getSession: async () => ({ data: { session: null }, error: null }) }),
    });
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: 'not_signed_in' });
  });
  it('returns the underlying Supabase client for shared storage use', () => {
    const auth = createAuthClient({
      supabaseUrl: 'https://x.supabase.co',
      publishableKey: 'pk',
      apiUrl: 'http://api',
      backend: backend(),
    });
    expect(auth.getSupabaseClient()).toBeDefined();
  });
});
