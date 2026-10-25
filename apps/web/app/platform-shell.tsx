'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getPlatformClient } from '../lib/platform';
import { getAuth, errorMessage, isConfigured } from '../lib/auth';

const links = [
  ['/feed', 'Feed'],
  ['/discover', 'Discover'],
  ['/connections', 'Connections'],
  ['/messages', 'Messages'],
  ['/reels', 'Reels'],
  ['/stories', 'Stories'],
  ['/music', 'Music'],
  ['/plans', 'Plans'],
  ['/activity', 'Activity'],
  ['/calls', 'Calls'],
  ['/location', 'Location'],
  ['/live', 'Live'],
  ['/studio', 'Create'],
  ['/search', 'Search'],
  ['/profile', 'Profile'],
];
export function PlatformShell({
  title,
  description,
  children,
  publicPage = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  publicPage?: boolean;
}) {
  const [ready, setReady] = useState(publicPage);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    let active = true;
    if (publicPage) return;
    if (!isConfigured()) {
      setSignedOut(true);
      return;
    }
    void getAuth()
      .isSignedIn()
      .then(async (yes) => {
        if (!yes) {
          if (active) setSignedOut(true);
          return;
        }
        await getAuth().fetchMe();
        if (active) {
          setReady(true);
          void getPlatformClient()
            .call('telemetry', { event: 'app_open' })
            .catch(() => undefined);
        }
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [publicPage]);
  return (
    <main id="main" tabIndex={-1} className="platform-page">
      <header className="platform-header">
        <a className="platform-wordmark" href="/feed">
          sidle<span>People. Moments. Possibilities.</span>
        </a>
        <div className="platform-header-actions">
          <a href="/studio" className="secondary compact">
            ＋ Create
          </a>
          <a href="/settings" className="secondary compact">
            Settings
          </a>
        </div>
      </header>
      <nav className="platform-navigation" aria-label="Sidle destinations">
        {links.map(([href, label]) => (
          <a key={href} href={href}>
            {label}
          </a>
        ))}
      </nav>
      <div className="platform-page-heading">
        <div>
          <span className="eyebrow">SIDLE</span>
          <h1>{title}</h1>
          {description && <p className="muted">{description}</p>}
        </div>
      </div>
      {signedOut ? (
        <section className="empty-state-card">
          <h2>Join the conversation</h2>
          <p>Sign in to publish, follow people and explore Sidle.</p>
          <a
            className="secondary"
            href={`/?next=${encodeURIComponent(typeof window === 'undefined' ? '/feed' : window.location.pathname)}`}
          >
            Sign in or create an account
          </a>
        </section>
      ) : error ? (
        <section className="notice err" role="alert">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try again</button>
        </section>
      ) : !ready ? (
        <section className="empty-state-card" aria-busy="true">
          <p>Opening your account… The service may take a moment to wake.</p>
        </section>
      ) : (
        children
      )}
      <footer className="platform-footer">
        <a href="/help">Help & feedback</a>
        <a href="/privacy">Privacy</a>
        <a href="/community-guidelines">Community rules</a>
        <a href="/billing">Billing & ads</a>
      </footer>
    </main>
  );
}
