'use client';
import { useEffect, useState } from 'react';
import type { MemberPreferences, ProfileDetails } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { getConnectionsClient } from '../lib/connections';
import { getAuth, errorMessage } from '../lib/auth';
import { SocialContextEditor } from './social-context';

export function MemberSettings() {
  const [lowPressure, setLowPressure] = useState(false);
  const [prefs, setPrefs] = useState<MemberPreferences | null>(null);
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      getConnectionsClient().getSettings(),
      getPlatformClient().getPreferences(),
      getPlatformClient().getProfile(),
    ])
      .then(([settings, preferences, profile]) => {
        setLowPressure(settings.lowPressureMode);
        setPrefs(preferences);
        setDetails(profile);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice('Settings saved.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="connection-settings" aria-labelledby="connection-preferences-title">
        <h2 id="connection-preferences-title">Connection preferences</h2>
        <label className="switch-row">
          <div>
            <strong>Low-pressure mode</strong>
            <p className="muted">
              Optional: allow structured conversation starters instead of unrestricted introduction
              text. This changes how people can first contact you.
            </p>
          </div>
          <input
            type="checkbox"
            checked={lowPressure}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.checked;
              void act(async () => {
                const saved = await getConnectionsClient().setLowPressure(next);
                setLowPressure(saved.lowPressureMode);
              });
            }}
          />
        </label>
        {prefs && (
          <>
            <label className="switch-row">
              <div>
                <strong>Share read receipts</strong>
                <p className="muted">
                  Let conversation partners receive future read status. Turning this off also
                  restricts direct and live watermark reads. Previously received status cannot be
                  recalled.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.readReceipts}
                disabled={busy}
                onChange={(event) => {
                  const readReceipts = event.target.checked;
                  void act(async () =>
                    setPrefs(await getPlatformClient().setPreferences({ readReceipts })),
                  );
                }}
              />
            </label>
            <label className="switch-row">
              <div>
                <strong>Share limited product counters</strong>
                <p className="muted">
                  Opt in to bounded account-level activity counters. Message bodies, precise
                  locations and profile text are excluded.
                </p>
              </div>
              <input
                type="checkbox"
                checked={prefs.analyticsConsent}
                disabled={busy}
                onChange={(event) => {
                  const analyticsConsent = event.target.checked;
                  void act(async () =>
                    setPrefs(await getPlatformClient().setPreferences({ analyticsConsent })),
                  );
                }}
              />
            </label>
            <div className="settings-help-grid">
              <label>
                Quiet hours start (UTC)
                <select
                  value={prefs.quietHoursStart ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    const quietHoursStart =
                      event.target.value === '' ? null : Number(event.target.value);
                    void act(async () =>
                      setPrefs(await getPlatformClient().setPreferences({ quietHoursStart })),
                    );
                  }}
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option value={hour} key={hour}>
                      {String(hour).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quiet hours end (UTC)
                <select
                  value={prefs.quietHoursEnd ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    const quietHoursEnd =
                      event.target.value === '' ? null : Number(event.target.value);
                    void act(async () =>
                      setPrefs(await getPlatformClient().setPreferences({ quietHoursEnd })),
                    );
                  }}
                >
                  <option value="">Off</option>
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option value={hour} key={hour}>
                      {String(hour).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="muted">
              Quiet hours use UTC and suppress configured message push delivery. In-app activity
              remains visible. Device/provider delivery still requires configuration.
            </p>
          </>
        )}
        <div className="card-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const data = await getPlatformClient().exportAccount();
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                );
                const link = document.createElement('a');
                link.href = url;
                link.download = 'sidle-account-export.json';
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Download my account data
          </button>
          <a className="secondary" href="/settings/media">
            Manage uploaded media
          </a>
          <a className="secondary" href="/calls">
            Calling
          </a>
          <a className="secondary" href="/location">
            Live location
          </a>
        </div>
        {error && (
          <p role="alert" className="notice err">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice ok">
            {notice}
          </p>
        )}
      </section>
      {prefs && prefs.mutedUsers.length > 0 && (
        <section className="settings-panel">
          <h2>Muted accounts</h2>
          <p>
            Muted members are hidden from your feed and configured message push. Muting does not
            block direct messages.
          </p>
          {prefs.mutedUsers.map((id) => (
            <div className="call-person" key={id}>
              <a href={`/u/${id}`}>View muted member</a>
              <button
                className="secondary compact"
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setPrefs(
                      await getPlatformClient().setPreferences({
                        mutedUsers: prefs.mutedUsers.filter((value) => value !== id),
                      }),
                    ),
                  )
                }
              >
                Unmute
              </button>
            </div>
          ))}
        </section>
      )}
      <SocialContextEditor />
      {details && (
        <section className="settings-panel">
          <h2>Profile details</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => setDetails(await getPlatformClient().setProfile(details)));
            }}
          >
            <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
              <div className="settings-help-grid">
                {(['handle', 'pronouns', 'campus', 'course', 'year', 'website'] as const).map(
                  (field) => (
                    <label key={field}>
                      {field[0]!.toUpperCase() + field.slice(1)}
                      <input
                        type={field === 'website' ? 'url' : 'text'}
                        value={details[field] ?? ''}
                        maxLength={
                          field === 'handle'
                            ? 24
                            : field === 'website'
                              ? 500
                              : field === 'pronouns'
                                ? 40
                                : field === 'year'
                                  ? 30
                                  : 100
                        }
                        onChange={(event) =>
                          setDetails({ ...details, [field]: event.target.value })
                        }
                      />
                    </label>
                  ),
                )}
              </div>
              <label>
                Who can see these optional details?
                <select
                  value={details.audience ?? 'connections'}
                  onChange={(event) =>
                    setDetails({
                      ...details,
                      audience: event.target.value as ProfileDetails['audience'],
                    })
                  }
                >
                  <option value="public">People who can view my profile</option>
                  <option value="connections">Connections</option>
                  <option value="private">Only me</option>
                </select>
              </label>
              <p className="muted">
                Handles are public within eligible profile views. Keep private addresses and
                sensitive personal details out of your profile.
              </p>
              <button>Save profile details</button>
            </fieldset>
          </form>
        </section>
      )}
      <section className="settings-panel">
        <h2>Security</h2>
        <p>
          Manage authenticator verification for this account. Administrators should enroll before
          enforcing MFA for privileged operations.
        </p>
        <MfaSettings />
      </section>
    </>
  );
}
function MfaSettings() {
  const [verified, setVerified] = useState<string | null>(null);
  useEffect(() => {
    void getAuth()
      .getSupabaseClient()
      .auth.mfa.listFactors()
      .then(({ data }) =>
        setVerified(data?.totp.find((factor) => factor.status === 'verified')?.id ?? null),
      );
  }, []);
  const [qr, setQr] = useState<string | null>(null);
  const [factor, setFactor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {qr && (
        <img src={qr} alt="Scan this authenticator enrollment QR code" width={200} height={200} />
      )}
      <div className="card-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const { data, error } = await getAuth()
                .getSupabaseClient()
                .auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sidle authenticator' });
              if (error) throw error;
              setQr(data.totp.qr_code);
              setFactor(data.id);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Set up authenticator
        </button>
        {verified && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              setFactor(verified);
              setQr(null);
            }}
          >
            Verify existing authenticator
          </button>
        )}
        {factor && (
          <>
            <label>
              Six-digit code
              <input
                inputMode="numeric"
                value={code}
                maxLength={6}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <button
              disabled={busy || code.length !== 6}
              onClick={async () => {
                setBusy(true);
                try {
                  const { error } = await getAuth()
                    .getSupabaseClient()
                    .auth.mfa.challengeAndVerify({ factorId: factor, code });
                  if (error) throw error;
                  setQr(null);
                  setNotice('Authenticator verified.');
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Verify authenticator
            </button>
          </>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
