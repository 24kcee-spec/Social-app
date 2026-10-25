'use client';
import { useCallback, useEffect, useState } from 'react';
import { PlatformShell } from '../../platform-shell';
import { SocialMedia } from '../../social-media';
import type { SocialAsset } from '@sp/profile-client';
import { getPlatformClient } from '../../../lib/platform';
import { errorMessage } from '../../../lib/auth';
interface Report {
  id: string;
  reason: string;
  details: string;
  status: string;
  postId: string;
}
interface Ad {
  id: string;
  title: string;
  body: string;
  targetUrl: string;
  status: string;
  advertiser: string;
}
interface Asset extends SocialAsset {
  status: string;
  userId: string;
}
export default function PlatformAdmin() {
  return (
    <PlatformShell
      title="Platform operations"
      description="Server-enforced administrator access to content review and platform allowances."
    >
      <Operations />
    </PlatformShell>
  );
}
function Operations() {
  const [commercial, setCommercial] = useState(false);
  useEffect(() => {
    void fetch('/api/platform/capabilities')
      .then((r) => r.json())
      .then((cap) => setCommercial(cap.commercialApproval === true))
      .catch(() => undefined);
  }, []);
  const [reports, setReports] = useState<Report[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [analytics, setAnalytics] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const p = getPlatformClient();
    const [r, a, d, u, c] = await Promise.all([
      p.call<Report[]>('admin.reports'),
      p.call<Asset[]>('admin.assets'),
      p.call<Ad[]>('admin.ads'),
      p.call<Record<string, unknown>>('admin.usage'),
      p.call('admin.analytics'),
    ]);
    setReports(r);
    setAssets(a);
    setAds(d);
    setUsage(u);
    setAnalytics(c);
  }, []);
  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err)));
  }, [load]);
  async function act(action: string, input: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await getPlatformClient().call(action, input);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      <div className="card-actions">
        <a className="secondary" href="/admin">
          Account & community moderation
        </a>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void load().catch((err) => setError(errorMessage(err)))}
        >
          Refresh
        </button>
      </div>
      {usage && (
        <section className="settings-panel">
          <h2>Capacity & upload controls</h2>
          <pre className="usage-json">{JSON.stringify(usage, null, 2)}</pre>
          <div className="card-actions">
            <button
              disabled={busy}
              onClick={() => void act('admin.settings', { uploadsEnabled: false })}
            >
              Pause uploads
            </button>
            <button
              disabled={busy}
              onClick={() => void act('admin.settings', { uploadsEnabled: true })}
            >
              Enable uploads
            </button>
            <button
              disabled={busy}
              onClick={() => void act('admin.settings', { mediaReviewRequired: true })}
            >
              Require media review
            </button>
            <button
              disabled={busy}
              onClick={() => void act('admin.settings', { mediaReviewRequired: false })}
            >
              Use post-publication review
            </button>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act('admin.settings', { adminMfaRequired: usage.adminMfaRequired !== true })
            }
          >
            {usage.adminMfaRequired
              ? 'Disable platform admin MFA requirement'
              : 'Require verified MFA for platform admin'}
          </button>
          <p>
            Verify an authenticator in Settings before changing the MFA requirement. Legacy API
            admin routes have a separate ADMIN_MFA_REQUIRED server setting.
          </p>
          <button
            className="secondary"
            disabled={busy || !commercial}
            onClick={() =>
              void act('admin.settings', { advertisingEnabled: usage.advertisingEnabled !== true })
            }
          >
            {usage.advertisingEnabled
              ? 'Pause advertising delivery'
              : 'Enable funded advertising delivery'}
          </button>
          <p>Advertising delivery defaults off and requires eligible commercial hosting.</p>
          <p>
            Account and global storage reservations are enforced in the database. Hosting provider
            bandwidth limits still apply.
          </p>
        </section>
      )}
      <section className="settings-panel">
        <h2>Content reports</h2>
        {reports.length ? (
          reports.map((report) => (
            <article className="settings-panel" key={report.id}>
              <p>
                {report.reason} · {report.status}
              </p>
              <p>{report.details}</p>
              <a href={`/post/${report.postId}`}>View post</a>
              <div className="card-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void act('admin.report.resolve', {
                      id: report.id,
                      status: 'resolved',
                      removePost: true,
                    })
                  }
                >
                  Remove post & resolve
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act('admin.report.resolve', { id: report.id, status: 'dismissed' })
                  }
                >
                  Dismiss report
                </button>
              </div>
            </article>
          ))
        ) : (
          <p>No content reports.</p>
        )}
      </section>
      <section className="settings-panel">
        <h2>Media review</h2>
        {assets.map((asset) => (
          <article className="settings-panel" key={asset.id}>
            <p>
              {asset.kind} · {asset.status} · {asset.sizeBytes} bytes
            </p>
            <SocialMedia asset={asset} />
            <div className="card-actions">
              <button
                disabled={busy}
                onClick={() => void act('admin.asset.review', { id: asset.id, status: 'ready' })}
              >
                Approve media
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  void act('admin.asset.review', { id: asset.id, status: 'quarantined' })
                }
              >
                Quarantine media
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="settings-panel">
        <h2>Advertising review</h2>
        {ads.map((ad) => (
          <article className="settings-panel" key={ad.id}>
            <h3>{ad.title}</h3>
            <p>{ad.body}</p>
            <p>
              {ad.advertiser} · {ad.status}
            </p>
            <a href={ad.targetUrl} target="_blank" rel="noopener noreferrer">
              Inspect destination ↗
            </a>
            <div className="card-actions">
              {['approved', 'rejected', 'paused'].map((status) => (
                <button
                  className="secondary"
                  disabled={busy}
                  key={status}
                  onClick={() => void act('admin.ad.review', { id: ad.id, status })}
                >
                  {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="settings-panel">
        <h2>Opt-in product counters</h2>
        <pre className="usage-json">{JSON.stringify(analytics, null, 2)}</pre>
        <p>
          Only opted-in, bounded event counters are retained. No message bodies or location
          coordinates are collected by these counters.
        </p>
      </section>
    </div>
  );
}
