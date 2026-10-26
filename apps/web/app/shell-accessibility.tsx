'use client';

import { useEffect, useState } from 'react';

const NAV_EVENT = 'sidle:navigation';
const DEFAULT_TITLE = 'Sidle — People. Moments. Possibilities.';

function navigationLabel() {
  const params = new URLSearchParams(window.location.search);
  const routeNames: Record<string, string> = {
    feed: 'Feed',
    discover: 'Discover',
    connections: 'Connections',
    messages: 'Messages',
    plans: 'Plans',
    profile: 'Profile',
    settings: 'Settings',
    activity: 'Activity',
    search: 'Search',
    studio: 'Create',
    reels: 'Reels',
    stories: 'Stories',
    music: 'Music',
    calls: 'Calls',
    location: 'Location',
    live: 'Live',
    billing: 'Billing',
    help: 'Help & safety',
    privacy: 'Privacy',
    'community-guidelines': 'Community guidelines',
    'whats-new': 'What’s new',
    reset: 'Password recovery',
    offline: 'Offline',
    u: 'Member profile',
    post: 'Post',
  };
  const route = window.location.pathname.split('/')[1] ?? '';
  if (routeNames[route]) return routeNames[route];
  const view = params.get('view');
  if (view === 'settings') return 'Settings';
  if (view === 'notifications') return 'Notification settings';
  if (view === 'profile-preview') return 'Profile';

  const section = params.get('section');
  if (section === 'profile-details') return 'Profile editor';
  if (section === 'privacy-settings') return 'Privacy and safety settings';
  if (section === 'account-sessions') return 'Account and security settings';
  if (section === 'account-data') return 'Account data settings';

  const tab = params.get('tab') ?? 'feed';
  return tab === 'feed'
    ? 'Feed'
    : tab === 'connections'
      ? 'Connections'
      : tab === 'messages'
        ? 'Messages'
        : tab === 'community'
          ? 'Community'
          : tab === 'profile'
            ? 'Profile'
            : 'Discover';
}

function syncDocumentTitle() {
  const label = navigationLabel();
  document.title = label === 'Feed' ? DEFAULT_TITLE : `${label} · Sidle`;
}

function focusNavigationTarget() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const section = params.get('section');
      const sectionTarget = section ? document.getElementById(section) : null;
      const target = sectionTarget ?? document.getElementById('main');
      if (target instanceof HTMLElement) target.focus({ preventScroll: Boolean(sectionTarget) });
    });
  });
}

export function ShellAccessibility() {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let semanticFrame = 0;
    const scheduleSemantics = () => {
      cancelAnimationFrame(semanticFrame);
      semanticFrame = requestAnimationFrame(syncDocumentTitle);
    };

    scheduleSemantics();
    syncDocumentTitle();
    const observer = new MutationObserver(() => {
      scheduleSemantics();
      syncDocumentTitle();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    const announceNavigation = () => {
      scheduleSemantics();
      syncDocumentTitle();
      focusNavigationTarget();
      requestAnimationFrame(() => setAnnouncement(`${navigationLabel()} opened`));
    };
    const announceOffline = () =>
      setAnnouncement(
        'Browser is offline. Existing content may remain visible, but new actions need an internet connection.',
      );
    const announceOnline = () => setAnnouncement('Browser connection restored.');

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    const patchedPushState: History['pushState'] = function (...args) {
      originalPushState.apply(window.history, args);
      window.dispatchEvent(new Event(NAV_EVENT));
    };
    const patchedReplaceState: History['replaceState'] = function (...args) {
      originalReplaceState.apply(window.history, args);
      window.dispatchEvent(new Event(NAV_EVENT));
    };

    window.history.pushState = patchedPushState;
    window.history.replaceState = patchedReplaceState;
    window.addEventListener(NAV_EVENT, announceNavigation);
    window.addEventListener('popstate', announceNavigation);
    window.addEventListener('offline', announceOffline);
    window.addEventListener('online', announceOnline);

    return () => {
      cancelAnimationFrame(semanticFrame);
      observer.disconnect();
      window.removeEventListener(NAV_EVENT, announceNavigation);
      window.removeEventListener('popstate', announceNavigation);
      window.removeEventListener('offline', announceOffline);
      window.removeEventListener('online', announceOnline);
      if (window.history.pushState === patchedPushState)
        window.history.pushState = originalPushState;
      if (window.history.replaceState === patchedReplaceState)
        window.history.replaceState = originalReplaceState;
    };
  }, []);

  return (
    <div className="sidle-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
