import { afterEach, describe, expect, it, vi } from 'vitest';
import { adsenseVerification } from '../lib/adsense-verification';
import { GET } from '../app/ads.txt/route';

const account = {
  COMMERCIAL_DEPLOYMENT_APPROVED: 'true',
  ADSENSE_VERIFICATION_ENABLED: 'true',
  ADSENSE_PUBLISHER_ID: 'ca-pub-1234567890123456',
  ADSENSE_ADS_TXT: 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0',
};

afterEach(() => vi.unstubAllEnvs());

describe('AdSense verification without ad serving', () => {
  it('requires explicit verification and commercial-host approval', () => {
    expect(adsenseVerification({ ...account, COMMERCIAL_DEPLOYMENT_APPROVED: 'false' })).toBeNull();
    expect(adsenseVerification({ ...account, ADSENSE_VERIFICATION_ENABLED: undefined })).toBeNull();
    expect(adsenseVerification({})).toBeNull();
  });

  it('permits ownership metadata before an ads.txt record is supplied', () => {
    expect(adsenseVerification({ ...account, ADSENSE_ADS_TXT: '' })).toEqual({
      publisherId: account.ADSENSE_PUBLISHER_ID,
      adsTxt: null,
    });
  });

  it('rejects a different publisher and additional injected ads.txt records', () => {
    for (const record of [
      account.ADSENSE_ADS_TXT.replace('pub-1234567890123456', 'pub-9999999999999999'),
      account.ADSENSE_ADS_TXT + '\nother.example, publisher, DIRECT, other',
    ])
      expect(() => adsenseVerification({ ...account, ADSENSE_ADS_TXT: record })).toThrow(
        'single Google DIRECT record',
      );
  });

  it('rejects invalid publisher IDs before publishing ownership metadata', () => {
    for (const publisher of ['pub-1234567890123456', 'ca-pub-123', '<script>'])
      expect(() => adsenseVerification({ ...account, ADSENSE_PUBLISHER_ID: publisher })).toThrow(
        'valid ADSENSE_PUBLISHER_ID',
      );
  });

  it('does not advertise an account on a disabled host', async () => {
    for (const [name, value] of Object.entries(account)) vi.stubEnv(name, value);
    vi.stubEnv('COMMERCIAL_DEPLOYMENT_APPROVED', 'false');
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('pub-');
  });

  it('serves only the matching authorized account as plain text', async () => {
    for (const [name, value] of Object.entries(account)) vi.stubEnv(name, value);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe(account.ADSENSE_ADS_TXT + '\n');
  });
});
