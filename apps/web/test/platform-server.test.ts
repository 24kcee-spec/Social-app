import { createHmac } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  iceConfiguration,
  providerCapabilities,
  verifyStripeSignature,
  safeWebOrigin,
  HttpFailure,
  apiFailure,
  platformUser,
} from '../lib/platform-server';
import { calendarFile } from '../lib/calendar';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('server provider boundaries', () => {
  it('rejects unavailable services and never enables payments from a browser flag', () => {
    for (const name of [
      'TURN_SHARED_SECRET',
      'TURN_URLS',
      'CALL_ICE_MODE',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'ENABLE_PAYMENTS',
      'COMMERCIAL_DEPLOYMENT_APPROVED',
    ])
      vi.stubEnv(name, '');
    expect(providerCapabilities().payments).toBe(false);
    expect(() => iceConfiguration('member')).toThrow(HttpFailure);
    vi.stubEnv('STRIPE_SECRET_KEY', 'test');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'test');
    vi.stubEnv('ENABLE_PAYMENTS', 'true');
    expect(providerCapabilities().payments).toBe(false);
  });
  it('mints scoped, expiring coturn credentials without sending the relay secret', () => {
    vi.stubEnv('TURN_SHARED_SECRET', 'test-shared-secret');
    vi.stubEnv('TURN_URLS', 'turn:relay.example:3478,turns:relay.example:5349');
    const result = iceConfiguration('member', 1700000000000);
    expect(result.relay).toBe(true);
    const ice = result.iceServers[0]!;
    expect(ice.username).toBe('1700003600:member');
    expect(ice.credential).toBe(
      createHmac('sha1', 'test-shared-secret').update(ice.username!).digest('base64'),
    );
    expect(JSON.stringify(result)).not.toContain('test-shared-secret');
  });
  it('checks raw webhook bytes, freshness and every v1 candidate', () => {
    const raw = '{"id":"evt-test"}';
    const stamp = '1700000000';
    const signature = createHmac('sha256', 'webhook-secret')
      .update(stamp + '.' + raw)
      .digest('hex');
    expect(
      verifyStripeSignature(
        raw,
        `t=${stamp},v1=invalid,v1=${signature}`,
        'webhook-secret',
        1700000000000,
      ),
    ).toBe(true);
    expect(
      verifyStripeSignature(
        raw + ' ',
        `t=${stamp},v1=${signature}`,
        'webhook-secret',
        1700000000000,
      ),
    ).toBe(false);
    expect(
      verifyStripeSignature(raw, `t=${stamp},v1=${signature}`, 'webhook-secret', 1700000360000),
    ).toBe(false);
    expect(verifyStripeSignature(raw, 't=NaN,v1=a', 'webhook-secret')).toBe(false);
  });
  it('rejects missing authorization before provider calls and sanitizes unexpected errors', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(platformUser(new Request('https://app.example'))).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).not.toHaveBeenCalled();
    const response = apiFailure(new Error('secret database credential'));
    expect(await response.text()).not.toContain('credential');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('uses configured HTTPS return origins', () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://app.example/settings');
    expect(safeWebOrigin()).toBe('https://app.example');
    vi.stubEnv('PUBLIC_WEB_URL', 'http://untrusted.example');
    expect(() => safeWebOrigin()).toThrow();
  });
});
it('exports UTC calendar events with escaped values and UTF-8 byte folding', () => {
  const output = calendarFile(
    {
      id: 'test',
      title: 'Hello, world;\nBEGIN:VTODO',
      description: 'é'.repeat(70),
      generalArea: 'Public venue',
      startsAt: '2026-10-25T08:00:00+02:00',
      endsAt: '2026-10-25T09:00:00+02:00',
    },
    'https://app.example',
    new Date('2026-10-24T00:00:00Z'),
  );
  expect(output).toContain('DTSTART:20261025T060000Z');
  expect(output).toContain('SUMMARY:Hello\\, world\\;\\nBEGIN:VTODO');
  expect(output.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
    true,
  );
  expect(output).not.toContain('\r\nBEGIN:VTODO');
});
