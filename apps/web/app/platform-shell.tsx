'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getPlatformClient } from '../lib/platform';
import { getAuth, errorMessage, isConfigured } from '../lib/auth';
import { getProfileClient } from '../lib/profile';
import { getMessagingClient } from '../lib/messaging';
import { AppHeader } from './app-header';
import { useInboxCounts } from '../lib/use-inbox-counts';

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
  const [identity, setIdentity] = useState<{ displayName: string; email: string | null } | null>(
    null,
  );
  const [activeDestination, setActiveDestination] = useState('');
  const [ready, setReady] = useState(publicPage);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  useEffect(() => {
    let active = true;
    const path = window.location.pathname.split('/')[1] ?? '';
    setActiveDestination(path === 'plans' ? 'community' : path);
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
        const user = await getAuth().fetchMe();
        if (active) setIdentity({ displayName: 'Member', email: user.email });
        void getProfileClient()
          .getProfile()
          .then((profile) => {
            if (active) setIdentity({ displayName: profile.displayName, email: user.email });
          })
          .catch(() => undefined);
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
  const counts = useInboxCounts(ready && !publicPage);
  return (
    <div className="app-wrapper">
      <AppHeader
        active={activeDestination}
        displayName={identity?.displayName}
        email={identity?.email}
        unread={counts.unread}
        pending={counts.pending}
        onSignOut={() => {
          void getAuth()
            .signOut()
            .then(() => window.location.assign('/'));
        }}
      />
      <main id="main" tabIndex={-1} className="platform-page">
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
    </div>
  );
}
