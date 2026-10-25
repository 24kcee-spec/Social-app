'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { webFeatureFlags } from '../lib/feature-flags';
import { trackProductEvent } from '../lib/product-telemetry';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type CommandItem = {
  label: string;
  hint: string;
  icon: string;
  href: string;
  keywords: string;
};

const COMMANDS: CommandItem[] = [
  {
    label: 'Global search',
    hint: 'Search people, communities and Plans',
    icon: '⌕',
    href: '/search',
    keywords: 'find global search',
  },
  ...[
    ['Feed', '/feed'],
    ['Reels', '/reels'],
    ['Stories', '/stories'],
    ['Music', '/music'],
    ['Create', '/studio'],
    ['Activity', '/activity'],
    ['Calls', '/calls'],
    ['Live location', '/location'],
    ['Live video', '/live'],
    ['Billing & ads', '/billing'],
  ].map(([label, href]) => ({
    label: label!,
    href: href!,
    hint: 'Open ' + label,
    icon: '◇',
    keywords: label!,
  })),
  {
    label: 'Discover',
    hint: 'People and introductions',
    icon: '✦',
    href: '/discover',
    keywords: 'people find recommendations interests',
  },
  {
    label: 'Connections',
    hint: 'Requests and people you know',
    icon: '🤝',
    href: '/connections',
    keywords: 'friends requests contacts',
  },
  {
    label: 'Messages',
    hint: 'Your conversations',
    icon: '💬',
    href: '/messages',
    keywords: 'chat conversation inbox',
  },
  {
    label: 'Plans & communities',
    hint: 'Groups, activities and upcoming plans',
    icon: '◌',
    href: '/community',
    keywords: 'plans events groups activities community',
  },
  {
    label: 'My profile',
    hint: 'Preview what others can see',
    icon: '☺',
    href: '/profile',
    keywords: 'profile photos prompts interests',
  },
  {
    label: 'Settings',
    hint: 'Privacy, account and notifications',
    icon: '⚙',
    href: '/settings',
    keywords: 'privacy account security notifications theme',
  },
  {
    label: 'Help & safety',
    hint: 'Boundaries, reporting and support guidance',
    icon: '◇',
    href: '/help',
    keywords: 'help safety report block support',
  },
  {
    label: 'Moderation',
    hint: 'Admin-only report review',
    icon: '▣',
    href: '/admin',
    keywords: 'admin moderation reports safety',
  },
];

const DISMISSED_INSTALL_KEY = 'sidle-install-prompt-dismissed-v1';

export function ProductExperience() {
  const [appMounted, setAppMounted] = useState(false);
  const [online, setOnline] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setAppMounted(Boolean(document.querySelector('.app-wrapper')));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => {
      const next = navigator.onLine;
      setOnline(next);
      if (!next) trackProductEvent('offline_seen');
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!(location.protocol === 'https:' || location.hostname === 'localhost')) return;
    const register = () =>
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    if (!webFeatureFlags.pwaInstallPrompt) return;
    try {
      setInstallDismissed(window.localStorage.getItem(DISMISSED_INSTALL_KEY) === '1');
    } catch {
      setInstallDismissed(false);
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      trackProductEvent('pwa_install_prompted');
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!webFeatureFlags.commandPalette) return;
    const onKey = (event: KeyboardEvent) => {
      if (!appMounted) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => {
          const next = !value;
          if (next) trackProductEvent('command_palette_opened');
          return next;
        });
      }
      if (event.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [appMounted]);

  useEffect(() => {
    if (!paletteOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previous;
      setQuery('');
    };
  }, [paletteOpen]);

  const visibleCommands = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((item) =>
      `${item.label} ${item.hint} ${item.keywords}`.toLocaleLowerCase().includes(needle),
    );
  }, [query]);

  if (!appMounted) return null;

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    trackProductEvent(
      result.outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed',
    );
    setInstallPrompt(null);
    if (result.outcome === 'dismissed') dismissInstall();
  }

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_INSTALL_KEY, '1');
    } catch {
      // Dismissal remains valid for this render even if storage is unavailable.
    }
  }

  return (
    <>
      {!online && (
        <div className="sidle-offline-bar" role="status" aria-live="polite">
          <span aria-hidden="true">◌</span>
          <span>
            You’re offline. Existing screens may remain visible; actions will reconnect when your
            network returns.
          </span>
        </div>
      )}

      {webFeatureFlags.commandPalette && (
        <button
          type="button"
          className="sidle-command-trigger"
          onClick={() => {
            setPaletteOpen(true);
            trackProductEvent('command_palette_opened');
          }}
          aria-haspopup="dialog"
        >
          Search Sidle <kbd>⌘K</kbd>
        </button>
      )}

      {paletteOpen && (
        <div
          className="sidle-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaletteOpen(false);
          }}
        >
          <section
            className="sidle-command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search Sidle"
          >
            <label className="sidle-sr-only" htmlFor="sidle-command-search">
              Search Sidle destinations
            </label>
            <input
              ref={searchRef}
              id="sidle-command-search"
              className="sidle-command-search"
              type="search"
              placeholder="Where do you want to go?"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            <div className="sidle-command-list">
              {visibleCommands.length ? (
                visibleCommands.map((item) => (
                  <a
                    className="sidle-command-item"
                    href={item.href}
                    key={item.href}
                    onClick={() => {
                      trackProductEvent('command_destination_opened', { destination: item.href });
                      setPaletteOpen(false);
                    }}
                  >
                    <span className="sidle-command-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>
                      <span className="sidle-command-label">{item.label}</span>
                      <span className="sidle-command-hint">{item.hint}</span>
                    </span>
                    <span className="sidle-command-arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                ))
              ) : (
                <div className="empty-state-card" style={{ boxShadow: 'none', padding: 26 }}>
                  <strong>No matching destination</strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    Try people, messages, plans, privacy or help.
                  </p>
                </div>
              )}
            </div>
            <div className="sidle-command-footer">
              <span>Navigate without digging through menus.</span>
              <span>Esc to close</span>
            </div>
          </section>
        </div>
      )}

      {webFeatureFlags.pwaInstallPrompt && installPrompt && !installDismissed && (
        <aside className="sidle-install-card" aria-label="Install Sidle">
          <strong>Keep Sidle close</strong>
          <p>
            Install the web app for a cleaner launch experience. This does not enable extra
            permissions by itself.
          </p>
          <div className="sidle-install-actions">
            <button type="button" onClick={() => void install()}>
              Install Sidle
            </button>
            <button type="button" className="secondary" onClick={dismissInstall}>
              Not now
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
