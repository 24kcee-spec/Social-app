'use client';
import { useEffect, useRef } from 'react';
import { AccountMenu } from './account-menu';
import { UiIcon } from './ui-icon';

export const primaryDestinations = [
  { key: 'feed', href: '/feed', label: 'Feed', icon: 'feed' },
  { key: 'discover', href: '/discover', label: 'Discover', icon: 'compass' },
  { key: 'messages', href: '/messages', label: 'Messages', icon: 'chat' },
  { key: 'community', href: '/plans', label: 'Plans', icon: 'calendar' },
  { key: 'profile', href: '/profile', label: 'Profile', icon: 'user' },
] as const;
const moreDestinations = [
  ['/connections', 'Connections'],
  ['/activity', 'Activity'],
  ['/search', 'Search'],
  ['/studio', 'Create'],
  ['/reels', 'Reels'],
  ['/stories', 'Stories'],
  ['/music', 'Music'],
  ['/calls', 'Calls'],
  ['/location', 'Location'],
  ['/live', 'Live'],
  ['/billing', 'Billing'],
  ['/settings', 'Settings'],
  ['/help', 'Help'],
] as const;

export function AppHeader({
  active,
  displayName,
  email,
  unread = 0,
  pending = 0,
  onNavigate,
  onSignOut,
}: {
  active?: string;
  displayName?: string;
  email?: string | null;
  unread?: number;
  pending?: number;
  onNavigate?: (href: string) => void;
  onSignOut?: () => void;
}) {
  const more = useRef<HTMLDetailsElement>(null);
  const moreActive = Boolean(active && !primaryDestinations.some((item) => item.key === active));
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (more.current && !more.current.contains(event.target as Node)) more.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const navigate = (href: string) => {
    if (more.current) more.current.open = false;
    if (onNavigate) onNavigate(href);
    else window.location.assign(href);
  };
  return (
    <header className="app-header shared-app-header">
      <div className="app-header-inner">
        <a
          className="brand-group brand-home-button"
          href="/feed"
          aria-label="Go to Feed"
          onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              navigate('/feed');
            }
          }}
        >
          <img className="sidle-mark sidle-mark-header" src="/brand/sidle-mark.svg" alt="" />
          <span className="brand-text-wrap">
            <strong className="brand-title sidle-wordmark">sidle</strong>
            <span className="brand-tagline">People. Moments. Possibilities.</span>
          </span>
        </a>
        <nav className="nav-pill-bar" aria-label="Main Navigation">
          {primaryDestinations.map((item) => (
            <a
              key={item.key}
              href={item.href}
              data-destination={item.key}
              className={`nav-pill-btn ${active === item.key ? 'active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
              onClick={(event) => {
                if (onNavigate) {
                  event.preventDefault();
                  navigate(item.href);
                }
              }}
            >
              <span className="navigation-icon">
                <UiIcon name={item.icon} />
              </span>
              <span className="navigation-label">{item.label}</span>
              {item.key === 'messages' && unread > 0 && (
                <span className="nav-badge" aria-label={`${unread} unread messages`}>
                  {unread}
                </span>
              )}
            </a>
          ))}
          <details
            className="navigation-more"
            ref={more}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && more.current) {
                more.current.open = false;
                more.current.querySelector('summary')?.focus();
              }
            }}
          >
            <summary
              className={`nav-pill-btn ${moreActive ? 'active' : ''}`}
              aria-current={moreActive ? 'page' : undefined}
              aria-label={pending ? `More, ${pending} pending requests` : 'More destinations'}
            >
              <span className="navigation-icon">
                <UiIcon name="more" />
              </span>
              <span className="navigation-label">More</span>
              {pending > 0 && <span className="nav-badge">{pending}</span>}
            </summary>
            <div className="navigation-more-panel">
              {moreDestinations.map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  aria-current={href.slice(1) === active ? 'page' : undefined}
                  onClick={(event) => {
                    if (onNavigate) {
                      event.preventDefault();
                      navigate(href);
                    }
                  }}
                >
                  {label}
                  {href === '/connections' && pending > 0 ? ` (${pending})` : ''}
                </a>
              ))}
            </div>
          </details>
        </nav>
        <div className="user-bar">
          {displayName ? (
            <AccountMenu
              displayName={displayName}
              email={email ?? null}
              onViewProfile={() => navigate('/profile')}
              onEditProfile={() => navigate('/profile/edit')}
              onOpenSettings={() => navigate('/settings')}
              onSignOut={onSignOut ?? (() => navigate('/'))}
            />
          ) : (
            <a className="secondary compact" href="/">
              Sign in
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
