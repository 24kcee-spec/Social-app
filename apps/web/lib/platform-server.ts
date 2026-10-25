import { createHmac, timingSafeEqual } from 'node:crypto';

export class HttpFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const base = () => {
  const value = process.env.SUPABASE_URL;
  if (!value) throw new HttpFailure(503, 'Supabase is not configured.');
  return value.replace(/\/+$/, '');
};
export async function platformUser(request: Request) {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new HttpFailure(401, 'Sign in to continue.');
  const headers = {
    apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? '',
    authorization: `Bearer ${token}`,
  };
  const response = await fetch(base() + '/auth/v1/user', {
    headers,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new HttpFailure(401, 'Your session has expired.');
  const user = (await response.json()) as { id: string; email?: string };
  const check = await fetch(base() + '/rest/v1/rpc/sidle_platform', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'usage', input: {} }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!check.ok) throw new HttpFailure(403, 'This Sidle session is unavailable.');
  const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
    session_id?: string;
  };
  return { ...user, token, sessionId: claims.session_id ?? '' };
}
export async function serverRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new HttpFailure(503, 'Server integration is not configured.');
  const response = await fetch(base() + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new HttpFailure(503, 'The server could not reconcile this operation.');
  return (await response.json()) as T;
}
export function providerCapabilities() {
  const commercial = process.env.COMMERCIAL_DEPLOYMENT_APPROVED === 'true';
  return {
    payments:
      commercial &&
      process.env.ENABLE_PAYMENTS === 'true' &&
      !!process.env.STRIPE_SECRET_KEY &&
      !!process.env.STRIPE_WEBHOOK_SECRET &&
      !!process.env.SUPABASE_SECRET_KEY,
    supportPayment: !!process.env.STRIPE_PRICE_SUPPORT,
    adCreditPayment: !!process.env.STRIPE_PRICE_AD_CREDIT,
    calls:
      (!!process.env.TURN_SHARED_SECRET && !!process.env.TURN_URLS) ||
      process.env.CALL_ICE_MODE === 'direct',
    relay: !!process.env.TURN_SHARED_SECRET && !!process.env.TURN_URLS,
    videoProcessing: process.env.MEDIA_PROCESSOR === 'selfhosted',
    live:
      process.env.LIVEKIT_GUARD_ENABLED === 'true' &&
      !!process.env.SUPABASE_SECRET_KEY &&
      !!process.env.LIVEKIT_URL &&
      !!process.env.LIVEKIT_API_KEY &&
      !!process.env.LIVEKIT_API_SECRET,
    smtp: !!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY,
    supportContact: process.env.PUBLIC_SUPPORT_CONTACT ?? null,
    commercialApproval: commercial,
  };
}
export function iceConfiguration(
  userId: string,
  now = Date.now(),
): { iceServers: RTCIceServer[]; relay: boolean } {
  const urls = (process.env.TURN_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (process.env.TURN_SHARED_SECRET && urls.length) {
    const username = `${Math.floor(now / 1000) + 3600}:${userId}`;
    return {
      iceServers: [
        {
          urls,
          username,
          credential: createHmac('sha1', process.env.TURN_SHARED_SECRET)
            .update(username)
            .digest('base64'),
        },
      ],
      relay: true,
    };
  }
  if (process.env.CALL_ICE_MODE === 'direct')
    return {
      iceServers: [{ urls: process.env.STUN_URL ?? 'stun:stun.l.google.com:19302' }],
      relay: false,
    };
  throw new HttpFailure(
    503,
    'Calling needs a configured TURN relay or explicitly enabled direct mode.',
  );
}
export function verifyStripeSignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
    return false;
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.' + raw)
    .digest();
  return parts
    .filter(([key]) => key === 'v1')
    .some(([, value]) => {
      if (!value || !/^[a-f0-9]{64}$/i.test(value)) return false;
      const supplied = Buffer.from(value, 'hex');
      return supplied.length === expected.length && timingSafeEqual(supplied, expected);
    });
}
export async function stripeRequest<T>(
  path: string,
  fields?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new HttpFailure(503, 'Payments are not configured.');
  const response = await fetch('https://api.stripe.com/v1' + path, {
    method: fields ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${secret}`,
      ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      ...(process.env.STRIPE_API_VERSION
        ? { 'stripe-version': process.env.STRIPE_API_VERSION }
        : {}),
    },
    ...(fields ? { body: fields.toString() } : {}),
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new HttpFailure(502, 'The payment provider could not complete this request.');
  return (await response.json()) as T;
}
export function safeWebOrigin() {
  const url = new URL(process.env.PUBLIC_WEB_URL ?? 'https://social-platform-web-two.vercel.app');
  if (url.protocol !== 'https:' && url.hostname !== 'localhost')
    throw new HttpFailure(503, 'Configure a secure public web URL.');
  return url.origin;
}
export function apiFailure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof HttpFailure ? error.message : 'This service is temporarily unavailable.',
    },
    {
      status: error instanceof HttpFailure ? error.status : 503,
      headers: { 'cache-control': 'private, no-store' },
    },
  );
}
