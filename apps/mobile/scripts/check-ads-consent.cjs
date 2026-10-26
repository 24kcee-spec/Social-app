const assert = require('node:assert/strict');

async function main() {
  const { prepareAdSession, updateAdPrivacy } = await import('../src/ads-session.ts');
  function fixture(canRequestAds = true) {
    const calls = [];
    const info = { canRequestAds, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
    const sdk = {
      AdsConsent: {
        gatherConsent: async () => { calls.push('consent'); return info; },
        requestInfoUpdate: async () => { calls.push('update'); return info; },
        showPrivacyOptionsForm: async () => { calls.push('privacy'); return { ...info, canRequestAds: false }; },
      },
      AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED' },
      MaxAdContentRating: { G: 'G' },
      default: () => ({
        setRequestConfiguration: async (config) => { calls.push('configure'); assert.equal(config.publisherPrivacyPersonalizationState, 'disabled'); assert.equal(config.maxAdContentRating, 'G'); },
        initialize: async () => { calls.push('initialize'); },
      }),
    };
    return { sdk, calls };
  }
  const allowed = fixture();
  assert.equal((await prepareAdSession(allowed.sdk, () => true)).ready, true);
  assert.deepEqual(allowed.calls, ['consent', 'configure', 'initialize']);
  const denied = fixture(false);
  assert.equal((await prepareAdSession(denied.sdk, () => true)).ready, false);
  assert.deepEqual(denied.calls, ['consent']);
  const stale = fixture();
  assert.equal((await prepareAdSession(stale.sdk, () => false)).ready, false);
  assert.deepEqual(stale.calls, ['consent']);
  const cancelled = fixture();
  let checks = 0;
  assert.equal((await prepareAdSession(cancelled.sdk, () => ++checks === 1)).ready, false);
  assert.deepEqual(cancelled.calls, ['consent', 'configure']);
  const failed = fixture();
  failed.sdk.AdsConsent.gatherConsent = async () => { throw new Error('provider unavailable'); };
  await assert.rejects(prepareAdSession(failed.sdk, () => true), /provider unavailable/);
  assert.deepEqual(failed.calls, []);
  const privacy = fixture();
  assert.equal((await updateAdPrivacy(privacy.sdk)).canRequestAds, false);
  assert.deepEqual(privacy.calls, ['update', 'privacy']);
  // A privacy visit must not initialize advertising when no form is required.
  const notRequired = fixture();
  notRequired.sdk.AdsConsent.requestInfoUpdate = async () => ({ canRequestAds: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
  assert.equal((await updateAdPrivacy(notRequired.sdk)).canRequestAds, false);
  assert.deepEqual(notRequired.calls, []);
  console.log('Ad consent checks passed (permission before initialization, failures, cancellation and privacy revocation).');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
