'use client';

import { SOCIAL_INTENTS, type Availability, type SocialContext } from '@sp/profile-client';
import { useEffect, useState } from 'react';
import { getProductClient } from '../lib/product';
import { errorMessage } from '../lib/auth';

export const INTENT_LABELS = {
  study: 'Study',
  coffee_chat: 'Coffee & chat',
  gaming: 'Gaming',
  networking: 'Networking',
  sport: 'Sport',
  just_browsing: 'Just browsing',
};
export const AVAILABILITY_LABELS = {
  open_to_plans: 'Open to plans',
  study_together: 'Open to studying together',
  coffee_chat: 'Open to coffee & chat',
};

export function SocialContextEditor() {
  const [context, setContext] = useState<SocialContext | null>(null);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  async function load() {
    setError(null);
    try {
      setContext(await getProductClient().getContext());
      setDirty(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="card" aria-labelledby="social-context-title" style={{ marginBottom: 24 }}>
      <h2 id="social-context-title">What are you open to?</h2>
      <p className="muted">
        Choose up to three interests in connecting. Availability is temporary and never means you
        are online.
      </p>
      {error && (
        <p role="alert" className="notice err">
          {error}{' '}
          <button className="link" onClick={() => void load()}>
            Reload saved choices
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="notice ok">
          {notice}
        </p>
      )}
      {!context ? (
        <p>{error ? 'Your choices could not be loaded.' : 'Loading your choices…'}</p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              const saved = await getProductClient().setContext({
                ...context,
                durationHours: hours,
              });
              setContext(saved);
              setDirty(false);
              setNotice('Your choices are saved to your Sidle account.');
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>Open to (up to three)</legend>
            <div className="filter-chips">
              {SOCIAL_INTENTS.map((intent) => (
                <label key={intent} className="chip-btn">
                  <input
                    type="checkbox"
                    checked={context.intents.includes(intent)}
                    disabled={!context.intents.includes(intent) && context.intents.length >= 3}
                    onChange={(event) => {
                      setContext({
                        ...context,
                        intents: event.target.checked
                          ? [...context.intents, intent]
                          : context.intents.filter((item) => item !== intent),
                      });
                      setDirty(true);
                      setNotice(null);
                    }}
                  />{' '}
                  {INTENT_LABELS[intent]}
                </label>
              ))}
            </div>
            <div className="settings-help-grid">
              <label>
                Temporary availability
                <select
                  value={context.availability ?? ''}
                  onChange={(event) => {
                    setContext({
                      ...context,
                      availability: (event.target.value || null) as Availability | null,
                    });
                    setDirty(true);
                    setNotice(null);
                  }}
                >
                  <option value="">No availability shared</option>
                  {Object.entries(AVAILABILITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expires after
                <select
                  value={hours}
                  disabled={!context.availability}
                  onChange={(event) => {
                    setHours(Number(event.target.value));
                    setDirty(true);
                    setNotice(null);
                  }}
                >
                  <option value={1}>1 hour</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                </select>
              </label>
              <label>
                Share these choices with
                <select
                  value={context.audience}
                  onChange={(event) => {
                    setContext({
                      ...context,
                      audience: event.target.value as SocialContext['audience'],
                    });
                    setDirty(true);
                    setNotice(null);
                  }}
                >
                  <option value="connections">My connections</option>
                  <option value="discoverable">People who can discover me</option>
                </select>
              </label>
            </div>
            {context.expiresAt && !dirty && (
              <p className="muted">
                Saved availability ends {new Date(context.expiresAt).toLocaleString()}.
              </p>
            )}
            <p className="muted">
              Your profile visibility and blocks always apply. Clearing availability removes it
              immediately after saving.
            </p>
            <button disabled={!dirty || busy} type="submit">
              {busy ? 'Saving…' : 'Save connection choices'}
            </button>
            {dirty && (
              <button type="button" className="secondary" onClick={() => void load()}>
                Discard changes
              </button>
            )}
          </fieldset>
        </form>
      )}
    </section>
  );
}
