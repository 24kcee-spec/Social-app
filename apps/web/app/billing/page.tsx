'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { getAuth, errorMessage } from '../../lib/auth';
import { uploadSocialMedia } from '../../lib/media-upload';
interface Summary {
  balance: number;
  debt: number;
  payments: {
    id: string;
    purpose: string;
    amount: number;
    currency: string;
    status: string;
    createdAt: string;
  }[];
}
interface Campaign {
  id: string;
  title: string;
  status: string;
  budget: number;
  spent: number;
  targetUrl: string;
}
export default function BillingPage() {
  return (
    <PlatformShell
      title="Billing & advertising"
      description="Optional support payments and clearly labelled sponsored posts."
    >
      <Billing />
    </PlatformShell>
  );
}
function Billing() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [cap, setCap] = useState<{
    payments: boolean;
    supportPayment: boolean;
    adCreditPayment: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [budget, setBudget] = useState(100);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const checkoutId = useRef(crypto.randomUUID());
  const assetRef = useRef<{ file: File; id: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        getPlatformClient().call<Summary>('billing.summary'),
        getPlatformClient().call<Campaign[]>('ads.mine'),
        fetch('/api/platform/capabilities', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setSummary(a);
      setCampaigns(b);
      setCap(c);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function provider(operation: 'checkout' | 'portal', purpose?: string) {
    const token = await getAuth().getAccessToken();
    const response = await fetch('/api/platform/' + operation, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ purpose, requestId: checkoutId.current }),
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Payment service unavailable.');
    window.location.assign(data.url);
  }
  return (
    <div className="platform-split">
      <div>
        <section className="settings-panel">
          <h2>Your ad wallet</h2>
          <p className="profile-stat">
            {summary?.balance ?? '—'} <small>click credits</small>
          </p>
          {!!summary?.debt && (
            <p role="alert">
              Refund reconciliation requires {summary.debt} additional credits. Delivery is paused.
            </p>
          )}
          <p>
            One credit pays for one unique member click per campaign per day. No precise-location,
            profile-text or message targeting is used. Credits have no cash withdrawal value.
          </p>
          {cap && !cap.payments && (
            <p className="provider-status">
              Payments are not available yet. You will see the price and currency before confirming
              any future purchase.
            </p>
          )}
          <div className="card-actions">
            <button
              disabled={busy || !cap?.payments || !cap.adCreditPayment}
              onClick={() => void action(() => provider('checkout', 'ad_credit'))}
            >
              Buy ad credits
            </button>
            <button
              className="secondary"
              disabled={busy || !cap?.payments || !cap.supportPayment}
              onClick={() => void action(() => provider('checkout', 'support'))}
            >
              Support Sidle
            </button>
            <button
              className="secondary"
              disabled={busy || !cap?.payments}
              onClick={() => void action(() => provider('portal'))}
            >
              Payment account
            </button>
          </div>
          <p className="muted">
            The provider displays the configured price and currency before confirmation. A
            successful redirect alone never grants credits.
          </p>
        </section>
        <section className="settings-panel">
          <h2>Payment history</h2>
          {summary?.payments.length ? (
            summary.payments.map((p) => (
              <p key={p.id}>
                {p.purpose.replaceAll('_', ' ')} · {p.currency.toUpperCase()}{' '}
                {(p.amount / 100).toFixed(2)} · {p.status} ·{' '}
                {new Date(p.createdAt).toLocaleDateString()}
              </p>
            ))
          ) : (
            <p>No recorded payments.</p>
          )}
        </section>
      </div>
      <div>
        <section className="settings-panel">
          <h2>Create a campaign</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                let assetId: string | undefined;
                if (file) {
                  if (assetRef.current?.file === file) assetId = assetRef.current.id;
                  else {
                    const asset = await uploadSocialMedia(file, {
                      rights: 'permission',
                      onProgress: setNotice,
                    });
                    assetRef.current = { file, id: asset.id };
                    assetId = asset.id;
                  }
                }
                await getPlatformClient().call('ads.create', {
                  title,
                  body,
                  targetUrl: url,
                  budget,
                  assetId,
                });
                setTitle('');
                setBody('');
                setUrl('');
                setFile(null);
                setNotice(
                  'Submitted for administrator review. Delivery also requires a funded wallet.',
                );
              });
            }}
          >
            <label>
              Title
              <input
                required
                minLength={2}
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            <label>
              Destination URL
              <input
                type="url"
                required
                pattern="https://.*"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label>
              Maximum click credits
              <input
                type="number"
                min={1}
                max={100000}
                required
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
              />
            </label>
            <label>
              Optional image you have permission to use
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              <input type="checkbox" required /> I can advertise this content and destination, and
              accept moderation.
            </label>
            <button disabled={busy}>Submit for review</button>
          </form>
          {notice && <p role="status">{notice}</p>}
        </section>
        <section className="settings-panel">
          <h2>Your campaigns</h2>
          {campaigns.map((c) => (
            <article className="call-person" key={c.id}>
              <div>
                <strong>{c.title}</strong>
                <p>
                  {c.status} · {c.spent}/{c.budget} click credits
                </p>
              </div>
              {c.status !== 'paused' && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(() => getPlatformClient().call('ads.pause', { id: c.id }))
                  }
                >
                  Pause
                </button>
              )}
            </article>
          ))}
          {!campaigns.length && <p>No campaigns yet.</p>}
        </section>
      </div>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
    </div>
  );
}
