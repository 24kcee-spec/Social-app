'use client';

import type { Interest, Profile, PromptDefinition, SocialStyle } from '@sp/types';
import type { OnboardingInput } from '@sp/validation';
import { AuthClientError, type DeviceSession, type Me } from '@sp/auth-client';
import { type ProfileClient, parseShareUrl, validateSafeRedirect } from '@sp/profile-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { UiIcon } from './ui-icon';
import { IcebreakerEditor } from './icebreaker-editor';
import { errorMessage, getAuth, isConfigured } from '../lib/auth';
import { Connections } from './connections';
import { Discover } from './discover';
import { Community } from './community';
import { Messages } from './messages';
import { getMessagingClient } from '../lib/messaging';
import { getSafetyClient } from '../lib/safety';
import {
  deleteProfileImage,
  downloadProfileImage,
  getProfileClient,
  getSignedMediaUrl,
  uploadProfileImage,
} from '../lib/profile';
import { AccountMenu } from './account-menu';

import { SettingsOverview, type ThemePreference } from './settings-overview';
import { NotificationSettingsPage } from './notification-settings';
import { PrivacySettings } from './privacy-settings';
import { ProfileDashboard } from './profile-dashboard';
import { SocialFeed } from './social-feed';

const PhotoEditor = dynamic(() => import('./photo-editor'), { ssr: false });

const SOCIAL_STYLE_LABELS: Record<SocialStyle, string> = {
  small_group: 'Small groups',
  one_to_one: 'One-to-one',
  text_first: 'Text-first',
  voice_first: 'Voice-first',
  low_pressure: 'Low pressure',
};

const PRIVACY_OPTIONS = {
  messagePermission: ['everyone', 'connections', 'nobody'] as const,
  visibility: ['public', 'connections', 'private'] as const,
};

type Mode = 'signin' | 'signup' | 'forgot';
const APP_TABS = ['feed', 'discover', 'connections', 'messages', 'community', 'profile'] as const;
type AppTab = (typeof APP_TABS)[number];
type ShellView = 'app' | 'settings' | 'viewProfile' | 'notifications';
type AppNavigation = { shellView: ShellView; tab: AppTab; focusSection: string | null };
const PROFILE_EDITOR_SECTIONS = [
  'profile-details',
  'privacy-settings',
  'account-sessions',
  'account-data',
] as const;

function isAppTab(value: string | null): value is AppTab {
  return APP_TABS.some((tab) => tab === value);
}

function readAppNavigation(search: string): AppNavigation {
  const params = new URLSearchParams(search);
  const requestedTab = params.get('tab');
  const tab: AppTab = isAppTab(requestedTab) ? requestedTab : 'feed';
  const view = params.get('view');

  if (view === 'settings') return { shellView: 'settings', tab, focusSection: null };
  if (view === 'notifications') return { shellView: 'notifications', tab, focusSection: null };
  if (view === 'profile-preview') return { shellView: 'viewProfile', tab, focusSection: null };

  const requestedSection = params.get('section');
  if (
    requestedSection &&
    PROFILE_EDITOR_SECTIONS.includes(requestedSection as (typeof PROFILE_EDITOR_SECTIONS)[number])
  ) {
    return { shellView: 'app', tab: 'profile', focusSection: requestedSection };
  }
  return { shellView: 'app', tab, focusSection: null };
}

function navigationHref(currentHref: string, navigation: AppNavigation): string {
  const url = new URL(currentHref);
  url.searchParams.delete('view');
  url.searchParams.delete('tab');
  url.searchParams.delete('section');
  url.searchParams.delete('next');

  if (navigation.shellView === 'settings') url.searchParams.set('view', 'settings');
  if (navigation.shellView === 'notifications') url.searchParams.set('view', 'notifications');
  if (navigation.shellView === 'viewProfile') url.searchParams.set('view', 'profile-preview');
  if (navigation.tab !== 'feed') url.searchParams.set('tab', navigation.tab);
  if (
    navigation.focusSection &&
    PROFILE_EDITOR_SECTIONS.includes(
      navigation.focusSection as (typeof PROFILE_EDITOR_SECTIONS)[number],
    )
  ) {
    url.searchParams.set('section', navigation.focusSection);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'signedIn'; me: Me; sessions: DeviceSession[] }
  | { kind: 'error'; message: string };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const auth = getAuth();
      if (!(await auth.isSignedIn())) return setPhase({ kind: 'signedOut' });
      // The account record is essential; session inventory is secondary. Render the app
      // as soon as /me succeeds, then fill in the session list without blocking the shell.
      const me = await auth.fetchMe();
      setPhase({ kind: 'signedIn', me, sessions: [] });
      void auth
        .listSessions()
        .then((sessions) => {
          setPhase((current) =>
            current.kind === 'signedIn' && current.me.id === me.id
              ? { ...current, sessions }
              : current,
          );
        })
        .catch((sessionsError: unknown) => {
          // A temporarily unavailable session inventory must not hide the user's account.
          // An invalid/revoked token is different: return them to the signed-out screen.
          if (
            sessionsError instanceof AuthClientError &&
            (sessionsError.code === 'unauthorized' || sessionsError.code === 'not_signed_in')
          ) {
            void auth.signOut().catch(() => undefined);
            setPhase((current) =>
              current.kind === 'signedIn' && current.me.id === me.id
                ? { kind: 'signedOut' }
                : current,
            );
          }
        });
    } catch (err) {
      if (
        err instanceof AuthClientError &&
        (err.code === 'unauthorized' || err.code === 'not_signed_in')
      ) {
        await getAuth()
          .signOut()
          .catch(() => undefined);
        return setPhase({ kind: 'signedOut' });
      }
      setPhase({ kind: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured()) {
      return setPhase({ kind: 'signedOut' });
    }
    void load();
    return getAuth().onAuthChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'PASSWORD_RECOVERY'].includes(event)) void load();
    });
  }, [load]);

  if (phase.kind === 'loading') {
    return (
      <div className="auth-wrapper">
        <div className="auth-card-editorial" style={{ textAlign: 'center' }}>
          <img className="sidle-mark sidle-mark-loading" src="/brand/sidle-mark.svg" alt="Sidle" />
          <h2>Loading your space…</h2>
          <p className="muted">Retrieving your account details.</p>
        </div>
      </div>
    );
  }

  if (phase.kind === 'signedOut') {
    return <AuthForm />;
  }

  if (phase.kind === 'error') {
    return (
      <div className="auth-wrapper">
        <div className="auth-card-editorial">
          <div className="auth-brand-badge">Connection problem</div>
          <h2>We couldn’t load your account</h2>
          <p className="muted" role="alert">
            {phase.message}
          </p>
          <p className="muted">
            Check your connection and try again. If this keeps happening, the API service may be
            temporarily unavailable.
          </p>
          <button
            className="auth-submit-btn"
            onClick={() => {
              setPhase({ kind: 'loading' });
              void load();
            }}
          >
            Try again
          </button>
          <button
            className="auth-submit-btn secondary"
            onClick={() => {
              void getAuth()
                .signOut()
                .catch(() => undefined);
              setPhase({ kind: 'signedOut' });
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return <Account me={phase.me} sessions={phase.sessions} reload={load} />;
}

/* ==========================================================================
   Redesigned Authentication Screen (Scope C1 - B)
   ========================================================================== */

function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setNotice(null);

    try {
      const auth = getAuth();
      if (mode === 'signin') {
        await auth.signIn({ email, password });
      } else if (mode === 'signup') {
        const r = await auth.signUp({
          email,
          password,
          displayName: displayName.trim() || undefined,
        });
        if (r === 'confirm_email') {
          setNotice('Check your email and click the confirmation link, then sign in.');
        }
      } else {
        await auth.requestPasswordReset(email, `${window.location.origin}/reset`);
        setNotice('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof AuthClientError) {
        setFields(err.fieldErrors);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card-editorial">
        <header>
          <div className="auth-brand-badge">SIDLE · CAMPUS CONNECTION</div>
          <h1>
            {mode === 'signin'
              ? 'Welcome back'
              : mode === 'signup'
                ? 'Join the community'
                : 'Reset your password'}
          </h1>
          <p className="muted">
            {mode === 'signin'
              ? 'Sign in to your people, conversations and community.'
              : mode === 'signup'
                ? 'Share moments, find your community and make things happen.'
                : "Enter your email address and we'll send a secure password reset link."}
          </p>
        </header>

        <div className="auth-nav-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-nav-btn ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => {
              setMode('signin');
              setError(null);
              setNotice(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-nav-btn ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => {
              setMode('signup');
              setError(null);
              setNotice(null);
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === 'signup' && (
            <Field
              label="Display name"
              id="name"
              value={displayName}
              setValue={setDisplayName}
              error={fields.displayName}
              autoComplete="nickname"
              placeholder="e.g. Maya Lin"
            />
          )}

          <Field
            label="Email address"
            id="email"
            type="email"
            value={email}
            setValue={setEmail}
            error={fields.email}
            autoComplete="email"
            placeholder="you@example.com"
          />

          {mode !== 'forgot' && (
            <Field
              label="Password"
              id="password"
              type="password"
              value={password}
              setValue={setPassword}
              error={fields.password}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          )}

          {error && (
            <div className="notice err" role="alert" style={{ marginTop: 14 }}>
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="notice ok" role="status" style={{ marginTop: 14 }}>
              <span>{notice}</span>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'signin'
                ? 'Sign in to account'
                : mode === 'signup'
                  ? 'Create your account'
                  : 'Send reset link'}
          </button>

          <div className="auth-footer-links">
            {mode === 'signin' ? (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('forgot');
                  setError(null);
                  setNotice(null);
                }}
              >
                Forgot your password?
              </button>
            ) : (
              <button
                type="button"
                className="link"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setNotice(null);
                }}
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  setValue,
  error,
  type = 'text',
  autoComplete,
  placeholder,
  maxLength,
}: {
  label: string;
  id: string;
  value: string;
  setValue: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p className="err" id={`${id}-err`} role="alert" style={{ margin: '4px 0 0' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
   Redesigned Application Shell (Scope C1 - A)
   ========================================================================== */

function Account({
  me,
  sessions,
  reload,
}: {
  me: Me;
  sessions: DeviceSession[];
  reload: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [prompts, setPrompts] = useState<PromptDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AppTab>('feed');
  const [shellView, setShellView] = useState<ShellView>('app');
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const lastAppNavigation = useRef<AppNavigation>({
    shellView: 'app',
    tab: 'discover',
    focusSection: null,
  });
  const currentNavigationRef = useRef<AppNavigation>({
    shellView: 'app',
    tab: 'discover',
    focusSection: null,
  });
  const currentHrefRef = useRef('');
  const profileEditorDirtyRef = useRef(false);
  const profileEditorBusyRef = useRef(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');

  const setProfileDirty = useCallback((dirty: boolean, busy = false) => {
    profileEditorDirtyRef.current = dirty;
    profileEditorBusyRef.current = busy;
  }, []);
  const [pendingIn, setPendingIn] = useState(0);
  const [unread, setUnread] = useState(0);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const client = useMemo<ProfileClient>(() => getProfileClient(), []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i, pr] = await Promise.all([
        client.getProfile(),
        client.listInterests(),
        client.listPrompts(),
      ]);
      setProfile(p);
      setInterests(i);
      setPrompts(pr);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // Reflect the current screen in the URL and restore it after refresh or browser Back/Forward.
  useEffect(() => {
    const restoreNavigation = () => {
      const navigation = readAppNavigation(window.location.search);
      const previous = currentNavigationRef.current;
      const leavingEditor =
        previous.shellView === 'app' &&
        previous.tab === 'profile' &&
        (navigation.shellView !== 'app' ||
          navigation.tab !== 'profile' ||
          navigation.focusSection !== previous.focusSection);

      if (leavingEditor && (profileEditorDirtyRef.current || profileEditorBusyRef.current)) {
        const confirmed =
          !profileEditorBusyRef.current &&
          window.confirm(
            'You have unsaved profile changes. Leave without saving? Photo uploads and removals are saved immediately and will not be undone.',
          );
        if (!confirmed) {
          const restoreHref =
            currentHrefRef.current || navigationHref(window.location.href, previous);
          window.history.pushState(
            { ...(window.history.state ?? {}), socialAppNavigation: true },
            '',
            restoreHref,
          );
          return;
        }
        setProfileDirty(false);
      }

      currentNavigationRef.current = navigation;
      currentHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      lastAppNavigation.current = {
        shellView: 'app',
        tab: navigation.tab,
        focusSection: navigation.shellView === 'app' ? navigation.focusSection : null,
      };
      setShellView(navigation.shellView);
      setTab(navigation.tab);
      setFocusSection(navigation.focusSection);
    };
    restoreNavigation();
    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, [setProfileDirty]);

  useEffect(() => {
    try {
      const saved =
        window.localStorage.getItem('sidle-theme') ??
        window.localStorage.getItem('social-app-theme');
      if (saved === 'system' || saved === 'light' || saved === 'dark') setThemePreference(saved);
    } catch {
      // Private browsing or storage restrictions should not prevent app use.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (themePreference === 'system') root.removeAttribute('data-theme');
    else root.dataset.theme = themePreference;
    try {
      window.localStorage.setItem('sidle-theme', themePreference);
    } catch {
      // The selected appearance still applies for this session.
    }
  }, [themePreference]);

  useEffect(() => {
    if (shellView !== 'app' || tab !== 'profile' || !focusSection) return;
    document.getElementById(focusSection)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [shellView, tab, focusSection, profile]);

  function applyNavigation(navigation: AppNavigation, historyMode: 'push' | 'replace' = 'push') {
    const href = navigationHref(window.location.href, navigation);
    const historyState = { ...(window.history.state ?? {}), socialAppNavigation: true };
    if (historyMode === 'replace') window.history.replaceState(historyState, '', href);
    else window.history.pushState(historyState, '', href);

    currentNavigationRef.current = navigation;
    currentHrefRef.current = href;
    if (navigation.shellView === 'app') lastAppNavigation.current = navigation;
    setShellView(navigation.shellView);
    setFocusSection(navigation.focusSection);
    setTab(navigation.tab);
  }

  function confirmLeaveProfileEditor() {
    if (profileEditorBusyRef.current) {
      window.alert('Please wait for the current save or photo operation to finish.');
      return false;
    }
    if (!(shellView === 'app' && tab === 'profile') || !profileEditorDirtyRef.current) return true;
    return window.confirm(
      'You have unsaved profile changes. Leave without saving? Photo uploads and removals are saved immediately and will not be undone.',
    );
  }

  function navigateTab(nextTab: AppTab, historyMode: 'push' | 'replace' = 'push') {
    if ((nextTab !== 'profile' || focusSection !== null) && !confirmLeaveProfileEditor()) return;
    applyNavigation({ shellView: 'app', tab: nextTab, focusSection: null }, historyMode);
  }

  function openShellView(nextView: 'settings' | 'viewProfile') {
    if (!confirmLeaveProfileEditor()) return;
    lastAppNavigation.current = { shellView: 'app', tab, focusSection: null };
    applyNavigation({ shellView: nextView, tab, focusSection: null });
  }

  function returnToApp() {
    applyNavigation(lastAppNavigation.current, 'replace');
  }

  function openProfileSection(sectionId: string) {
    if (!confirmLeaveProfileEditor()) return;
    const safeSection = PROFILE_EDITOR_SECTIONS.includes(
      sectionId as (typeof PROFILE_EDITOR_SECTIONS)[number],
    )
      ? sectionId
      : null;
    applyNavigation({ shellView: 'app', tab: 'profile', focusSection: safeSection });
  }

  // Keep the Messages tab badge warm even while looking at other tabs.
  useEffect(() => {
    const messaging = getMessagingClient();
    const tick = () => {
      if (document.hidden || !navigator.onLine) return;
      return messaging
        .listConversations()
        .then((l) => setUnread(l.reduce((n, c) => n + c.unreadCount, 0)))
        .catch(() => undefined);
    };
    void tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  // Cross-device continuity: restore intended destination after authentication
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    const safeNext = validateSafeRedirect(next);
    if (!safeNext) return;

    const parsed = parseShareUrl(safeNext);
    if (parsed) {
      const targetTab: AppTab =
        parsed.targetType === 'group' || parsed.targetType === 'event' ? 'community' : 'discover';
      applyNavigation({ shellView: 'app', tab: targetTab, focusSection: null }, 'replace');
    }
  }, []);

  async function signOut() {
    if (!confirmLeaveProfileEditor()) return;
    try {
      await getAuth().signOut();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function revoke(id: string) {
    try {
      await getAuth().revokeSession(id);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="app-wrapper">
      {/* Top Header */}
      <header className="app-header" role="banner">
        <div className="app-header-inner">
          <button
            type="button"
            className="brand-group brand-home-button"
            onClick={() => navigateTab('discover')}
            aria-label="Go to Discover"
          >
            <img
              className="sidle-mark sidle-mark-header"
              src="/brand/sidle-mark.svg"
              alt=""
              aria-hidden="true"
            />
            <div className="brand-text-wrap">
              <span className="brand-title sidle-wordmark">sidle</span>
              <span className="brand-tagline">People. Moments. Possibilities.</span>
            </div>
          </button>

          {profile?.onboardingCompleted && (
            <nav className="nav-pill-bar" aria-label="Main Navigation">
              <button
                role="tab"
                aria-selected={tab === 'feed'}
                className={`nav-pill-btn ${tab === 'feed' ? 'active' : ''}`}
                onClick={() => navigateTab('feed')}
              >
                <span>▦</span>
                <span>Feed</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'discover'}
                className={`nav-pill-btn ${tab === 'discover' ? 'active' : ''}`}
                onClick={() => navigateTab('discover')}
              >
                <span>🧭</span>
                <span>Discover</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'connections'}
                className={`nav-pill-btn nav-pill-btn-connections ${tab === 'connections' ? 'active' : ''}`}
                onClick={() => navigateTab('connections')}
              >
                <span>🤝</span>
                <span>Connections</span>
                {pendingIn > 0 && <span className="nav-badge">{pendingIn}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === 'messages'}
                className={`nav-pill-btn ${tab === 'messages' ? 'active' : ''}`}
                onClick={() => navigateTab('messages')}
              >
                <span>💬</span>
                <span>Messages</span>
                {unread > 0 && <span className="nav-badge">{unread}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === 'community'}
                className={`nav-pill-btn ${tab === 'community' ? 'active' : ''}`}
                onClick={() => navigateTab('community')}
              >
                <span>🎈</span>
                <span>Plans</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === 'profile'}
                className={`nav-pill-btn ${tab === 'profile' ? 'active' : ''}`}
                onClick={() => navigateTab('profile')}
              >
                <span>👤</span>
                <span>Profile</span>
              </button>
            </nav>
          )}

          <div className="user-bar">
            <AccountMenu
              displayName={profile?.displayName ?? 'Member'}
              email={me.email}
              onViewProfile={() => openShellView('viewProfile')}
              onEditProfile={() => openProfileSection('profile-details')}
              onOpenSettings={() => openShellView('settings')}
              onSignOut={() => void signOut()}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main" tabIndex={-1}>
        {error && (
          <div className="notice err" role="alert">
            <span>{error}</span>
            <button className="link" onClick={() => void loadProfile()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">✦</div>
            <h2>Opening your space…</h2>
            <p className="muted">Retrieving your profile, interests and connections.</p>
          </div>
        ) : profile && !profile.onboardingCompleted ? (
          <Onboarding
            profile={profile}
            interests={interests}
            prompts={prompts}
            client={client}
            onDone={setProfile}
          />
        ) : profile && shellView === 'settings' ? (
          <SettingsOverview
            me={me}
            profile={profile}
            sessions={sessions}
            theme={themePreference}
            onThemeChange={setThemePreference}
            onBack={returnToApp}
            onEditProfile={() => openProfileSection('profile-details')}
            onOpenPrivacy={() => openProfileSection('privacy-settings')}
            onOpenSessions={() => openProfileSection('account-sessions')}
            onOpenAccountData={() => openProfileSection('account-data')}
            onOpenNotifications={() =>
              applyNavigation({ shellView: 'notifications', tab, focusSection: null })
            }
            onVerifyStudent={async (studentEmail, studentId, institution) => {
              const res = await client.verifyStudent({ studentEmail, studentId, institution });
              if (res.verified) {
                const refreshed = await client.getProfile();
                setProfile(refreshed);
              } else {
                throw new Error(res.message);
              }
            }}
          />
        ) : profile && shellView === 'notifications' ? (
          <NotificationSettingsPage
            onBack={() =>
              applyNavigation({ shellView: 'settings', tab, focusSection: null }, 'replace')
            }
          />
        ) : profile && shellView === 'viewProfile' ? (
          <ProfileDashboard
            profile={profile}
            onEdit={() => openProfileSection('profile-details')}
            onSettings={() => openShellView('settings')}
          />
        ) : profile ? (
          tab === 'feed' ? (
            <>
              <div className="feature-hub">
                <a href="/reels">▷ Reels</a>
                <a href="/stories">◉ Stories</a>
                <a href="/music">♫ Music</a>
                <a href="/activity">Activity</a>
                <a href="/connections">Connections</a>
                <a href="/calls">Calls</a>
                <a href="/location">Location</a>
                <a href="/search">Search</a>
                <a href="/studio">＋ Create</a>
              </div>
              <SocialFeed />
            </>
          ) : tab === 'discover' ? (
            <Discover />
          ) : tab === 'connections' ? (
            <Connections
              onCount={setPendingIn}
              onMessage={(userId) => {
                setChatWith(userId);
                navigateTab('messages');
              }}
            />
          ) : tab === 'messages' ? (
            <Messages
              onUnread={setUnread}
              openWithUserId={chatWith}
              onOpened={() => setChatWith(null)}
            />
          ) : tab === 'community' ? (
            <Community />
          ) : focusSection === null ? (
            <ProfileDashboard
              profile={profile}
              onEdit={() => openProfileSection('profile-details')}
              onSettings={() => openShellView('settings')}
            />
          ) : focusSection === 'privacy-settings' ? (
            <PrivacySettings
              profile={profile}
              onSaved={setProfile}
              onBack={() => openShellView('settings')}
              onDirtyChange={setProfileDirty}
              renderControls={(value, setValue) => (
                <PrivacyEditor privacy={value} setPrivacy={setValue} />
              )}
            />
          ) : focusSection === 'account-sessions' || focusSection === 'account-data' ? (
            <AccountSettings
              me={me}
              sessions={sessions}
              revoke={revoke}
              onBack={() => openShellView('settings')}
            />
          ) : (
            <ProfileEditor
              profile={profile}
              interests={interests}
              prompts={prompts}
              client={client}
              onSaved={setProfile}
              onDirtyChange={setProfileDirty}
            />
          )
        ) : null}

        {profile?.onboardingCompleted && (
          <p className="footer-note">
            <span>
              <strong>Sidle</strong> · People. Moments. Possibilities.
            </span>
          </p>
        )}
      </main>
    </div>
  );
}

/* ==========================================================================
   Existing Onboarding and Profile Editor (Preserved)
   ========================================================================== */

function Onboarding({
  profile,
  interests,
  prompts,
  client,
  onDone,
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onDone: (profile: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState(
    profile.displayName === 'New member' ? '' : profile.displayName,
  );
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState<SocialStyle[]>(
    profile.socialStyles.length ? profile.socialStyles : ['one_to_one'],
  );
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [selected, setSelected] = useState<Record<string, 1 | 2 | 3>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input: OnboardingInput = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: styles,
        privacy,
        interests: Object.entries(selected).map(([interestId, strength]) => ({
          interestId,
          strength,
        })),
        answers: selectedPrompts.map((promptId) => ({
          promptId,
          answer: (answers[promptId] ?? '').trim(),
        })),
      };
      const next = await client.completeOnboarding(input);
      onDone(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid" onSubmit={save}>
      <section className="card">
        <div className="eyebrow">STEP 1</div>
        <h2>Tell people a little about you</h2>
        <p className="muted">Only the basics. You can change these later.</p>
        <Field
          label="Display name"
          id="displayName"
          value={displayName}
          setValue={setDisplayName}
        />
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={280}
            rows={4}
          />
          <p className="counter">{bio.length}/280</p>
        </div>
        <ChoiceSet
          title="How do you prefer to socialise?"
          values={styles}
          options={Object.keys(SOCIAL_STYLE_LABELS) as SocialStyle[]}
          onToggle={(style) =>
            setStyles(
              styles.includes(style) ? styles.filter((s) => s !== style) : [...styles, style],
            )
          }
        />
      </section>

      <section className="card">
        <div className="eyebrow">STEP 2</div>
        <h2>Choose your interests</h2>
        <p className="muted">
          Pick at least 3 so the app can explain why people and activities are suggested.
        </p>
        <div className="interest-grid">
          {interests.map((i) => {
            const chosen = selected[i.id] !== undefined;
            return (
              <button
                type="button"
                key={i.id}
                className={chosen ? 'chip selected' : 'chip'}
                onClick={() =>
                  setSelected((s) => {
                    const next = { ...s };
                    if (chosen) delete next[i.id];
                    else next[i.id] = 2;
                    return next;
                  })
                }
              >
                {i.name}
              </button>
            );
          })}
        </div>
        <p className={Object.keys(selected).length >= 3 ? 'ok' : 'err'}>
          {Object.keys(selected).length} selected (minimum 3)
        </p>
      </section>

      <section className="card">
        <div className="eyebrow">STEP 3</div>
        <h2>Answer a prompt</h2>
        <p className="muted">
          Choose 1–3. These will make your profile easier to understand than a photo alone.
        </p>
        <div className="prompt-list">
          {prompts.map((p) => {
            const chosen = selectedPrompts.includes(p.id);
            return (
              <div className="prompt-row" key={p.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={chosen}
                    onChange={() =>
                      setSelectedPrompts((current) =>
                        chosen
                          ? current.filter((id) => id !== p.id)
                          : current.length < 3
                            ? [...current, p.id]
                            : current,
                      )
                    }
                  />
                  <span>{p.prompt}</span>
                </label>
                {chosen && (
                  <textarea
                    value={answers[p.id] ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                    maxLength={240}
                    rows={2}
                    placeholder="Write a short answer…"
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className={selectedPrompts.length >= 1 ? 'ok' : 'err'}>
          {selectedPrompts.length} prompt(s) selected
        </p>
      </section>

      <section className="card">
        <div className="eyebrow">STEP 4</div>
        <h2>Privacy</h2>
        <p className="muted">You decide how discoverable and reachable you are.</p>
        <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={
            busy ||
            displayName.trim().length < 2 ||
            styles.length < 1 ||
            Object.keys(selected).length < 3 ||
            selectedPrompts.length < 1
          }
        >
          {busy ? 'Saving…' : 'Finish profile setup'}
        </button>
      </section>
    </form>
  );
}

function ProfileEditor({
  profile,
  interests,
  prompts,
  client,
  onSaved,
  onDirtyChange,
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onSaved: (profile: Profile) => void;
  onDirtyChange: (dirty: boolean, busy?: boolean) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState(profile.socialStyles);
  const [privacy, setPrivacy] = useState({ ...profile.privacy });
  const [selected, setSelected] = useState<Record<string, 1 | 2 | 3>>(
    Object.fromEntries(profile.interests.map((i) => [i.id, (i.strength ?? 2) as 1 | 2 | 3])),
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(profile.prompts.map((p) => [p.promptId, p.answer])),
  );
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [refreshingMedia, setRefreshingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [editorSection, setEditorSection] = useState<
    'details' | 'photos' | 'interests' | 'icebreakers'
  >('details');
  const [photoDraft, setPhotoDraft] = useState<{
    file: File;
    replacing?: Profile['media'][number];
  } | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const replacePhoto = useRef<Profile['media'][number] | undefined>(undefined);

  const draftFingerprint = JSON.stringify({ displayName, bio, styles, privacy, selected, answers });
  const liveDraftFingerprint = useRef(draftFingerprint);
  liveDraftFingerprint.current = draftFingerprint;

  const selectedDraft = Object.entries(selected)
    .map(([interestId, strength]) => ({ interestId, strength }))
    .sort((a, b) => a.interestId.localeCompare(b.interestId));
  const selectedSaved = profile.interests
    .map((interest) => ({ interestId: interest.id, strength: interest.strength ?? 2 }))
    .sort((a, b) => a.interestId.localeCompare(b.interestId));
  const answersDraft = Object.entries(answers)
    .filter(([, answer]) => answer.trim())
    .slice(0, 3)
    .map(([promptId, answer]) => ({ promptId, answer: answer.trim() }))
    .sort((a, b) => a.promptId.localeCompare(b.promptId));
  const answersSaved = profile.prompts
    .filter((answer) => answer.answer.trim())
    .map((answer) => ({ promptId: answer.promptId, answer: answer.answer.trim() }))
    .sort((a, b) => a.promptId.localeCompare(b.promptId));
  const hasUnsavedChanges =
    displayName.trim() !== profile.displayName ||
    bio.trim() !== profile.bio ||
    JSON.stringify([...styles].sort()) !== JSON.stringify([...profile.socialStyles].sort()) ||
    JSON.stringify(privacy) !== JSON.stringify(profile.privacy) ||
    JSON.stringify(selectedDraft) !== JSON.stringify(selectedSaved) ||
    JSON.stringify(answersDraft) !== JSON.stringify(answersSaved);
  const nonEmptyAnswers = Object.values(answers).filter((answer) => answer.trim());
  const validationMessage =
    displayName.trim().length < 2
      ? 'Your display name must contain at least 2 characters.'
      : displayName.trim().length > 50
        ? 'Your display name must be 50 characters or fewer.'
        : styles.length < 1
          ? 'Choose at least one social style.'
          : selectedDraft.length < 3
            ? 'Choose at least 3 interests.'
            : selectedDraft.length > 12
              ? 'Choose no more than 12 interests.'
              : nonEmptyAnswers.some((answer) => answer.trim().length < 2)
                ? 'Each prompt answer must contain at least 2 characters.'
                : nonEmptyAnswers.length < 1
                  ? 'Answer at least one conversation prompt.'
                  : nonEmptyAnswers.length > 3
                    ? 'Answer no more than 3 conversation prompts.'
                    : null;
  const saveValidationMessage = hasUnsavedChanges ? validationMessage : null;

  const refreshMedia = useCallback(async () => {
    setRefreshingMedia(true);
    try {
      const pairs = await Promise.all(
        profile.media.map(async (media) => {
          try {
            return [media.id, await getSignedMediaUrl(media.thumbnailPath)] as const;
          } catch {
            return [media.id, ''] as const;
          }
        }),
      );
      setMediaUrls(Object.fromEntries(pairs));
    } finally {
      setRefreshingMedia(false);
    }
  }, [profile.media]);

  useEffect(() => {
    void refreshMedia();
  }, [refreshMedia]);

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges, busy || mediaBusy || photoDraft !== null);
  }, [hasUnsavedChanges, busy, mediaBusy, photoDraft, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges && !photoDraft) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges, photoDraft]);

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  function resetDraft(source: Profile) {
    setDisplayName(source.displayName);
    setBio(source.bio);
    setStyles([...source.socialStyles]);
    setPrivacy({ ...source.privacy });
    setSelected(
      Object.fromEntries(
        source.interests.map((interest) => [interest.id, (interest.strength ?? 2) as 1 | 2 | 3]),
      ),
    );
    setAnswers(
      Object.fromEntries(source.prompts.map((prompt) => [prompt.promptId, prompt.answer])),
    );
  }

  function discardDraft() {
    if (!hasUnsavedChanges || busy || mediaBusy) return;
    if (
      !window.confirm(
        'Discard your unsaved profile details, interests, prompt answers and privacy changes? Photo uploads and removals are saved immediately and will not be undone.',
      )
    )
      return;
    resetDraft(profile);
    clearFeedback();
    setMessage('Unsaved profile changes discarded. Photo changes remain saved.');
    onDirtyChange(false);
  }

  async function save() {
    if (busy || mediaBusy || !hasUnsavedChanges || saveValidationMessage) return;
    const submittedFingerprint = liveDraftFingerprint.current;
    setBusy(true);
    clearFeedback();
    try {
      let saved = await client.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: styles,
        privacy,
      });
      saved = await client.updateInterests({
        interests: Object.entries(selected).map(([interestId, strength]) => ({
          interestId,
          strength,
        })),
      });
      const chosenAnswers = Object.entries(answers)
        .filter(([, answer]) => answer.trim())
        .slice(0, 3)
        .map(([promptId, answer]) => ({ promptId, answer: answer.trim() }));
      saved = await client.updatePrompts({ answers: chosenAnswers });
      onSaved(saved);
      if (liveDraftFingerprint.current === submittedFingerprint) {
        resetDraft(saved);
        setMessage('Profile saved successfully.');
        onDirtyChange(false);
      } else setMessage('Submitted changes saved. Newer edits remain unsaved.');
    } catch (err) {
      setError(errorMessage(err));
      try {
        const latest = await client.getProfile();
        onSaved(latest);
        setMessage(
          'We refreshed the saved profile after the error. Some earlier fields may already have been saved; review your remaining changes before retrying.',
        );
      } catch {
        setMessage(
          'One or more save steps may have completed before the error. Refresh the page and check your saved profile before retrying.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function savePhoto(file: File) {
    if (busy || mediaBusy) return;
    setMediaBusy(true);
    clearFeedback();
    try {
      const replacing = photoDraft?.replacing;
      const media = await uploadProfileImage(file, profile.media, replacing);
      const items = replacing
        ? profile.media.map((item) => (item.id === replacing.id ? media : item))
        : [...profile.media, media];
      onSaved({ ...profile, media: items.sort((a, b) => a.sortOrder - b.sortOrder) });
      setMessage('Photo saved.');
    } finally {
      setMediaBusy(false);
    }
  }

  async function editPhoto(media: Profile['media'][number]) {
    setMediaBusy(true);
    clearFeedback();
    try {
      setPhotoDraft({ file: await downloadProfileImage(media), replacing: media });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMediaBusy(false);
    }
  }

  async function makePrimary(media: Profile['media'][number]) {
    setMediaBusy(true);
    clearFeedback();
    try {
      onSaved(await client.makePrimaryMedia(media.id));
      setMessage('Profile picture updated.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMediaBusy(false);
    }
  }

  async function removeImage(id: string) {
    if (busy || mediaBusy) return;
    const media = profile.media.find((item) => item.id === id);
    if (!media) return;
    if (!window.confirm('Remove this profile photo? This change is saved immediately.')) return;
    setMediaBusy(true);
    clearFeedback();
    try {
      await deleteProfileImage(media);
      onSaved({ ...profile, media: profile.media.filter((item) => item.id !== id) });
      setMessage('Photo removed and saved immediately.');
    } catch (err) {
      setError(errorMessage(err));
      // The server may have deleted the profile record even if storage cleanup failed.
      // Refresh the current profile so the editor does not keep a stale media item.
      try {
        const latest = await client.getProfile();
        onSaved(latest);
      } catch {
        // Preserve the original actionable error if the follow-up read is also unavailable.
      }
    } finally {
      setMediaBusy(false);
    }
  }

  const activePrompt = prompts.find((prompt) => (answers[prompt.id] ?? '').trim());
  const primaryMedia = profile.media[0];
  const sections = [
    { id: 'details', label: 'About you', icon: 'user', detail: 'Name, bio & style' },
    { id: 'photos', label: 'Photos', icon: 'image', detail: `${profile.media.length}/6 photos` },
    {
      id: 'interests',
      label: 'Interests',
      icon: 'heart',
      detail: `${selectedDraft.length} selected`,
    },
    {
      id: 'icebreakers',
      label: 'Icebreakers',
      icon: 'sparkles',
      detail: `${nonEmptyAnswers.length}/3 answered`,
    },
  ] as const;
  return (
    <div className="profile-editor-workspace">
      <header className="profile-editor-header">
        <div>
          <span className="eyebrow">YOUR PROFILE</span>
          <h1>Edit profile</h1>
          <p className="muted">A few details. A little personality. All you.</p>
        </div>
        <a className="secondary compact" href="/settings">
          Settings
        </a>
      </header>
      <div className="profile-editor-layout">
        <nav className="editor-section-nav" aria-label="Profile editor sections">
          {sections.map((section) => (
            <button
              type="button"
              key={section.id}
              aria-current={editorSection === section.id ? 'page' : undefined}
              onClick={() => setEditorSection(section.id)}
            >
              <UiIcon name={section.icon} />
              <span>
                <strong>{section.label}</strong>
                <small>{section.detail}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="profile-editor-content">
          <section
            className="editor-panel"
            id="profile-details"
            tabIndex={-1}
            hidden={editorSection !== 'details'}
          >
            <div className="editor-section-heading">
              <div>
                <span className="eyebrow">THE BASICS</span>
                <h2>About you</h2>
                <p className="muted">What would you like people to know?</p>
              </div>
            </div>
            <Field
              label="Display name"
              id="editDisplayName"
              value={displayName}
              setValue={(value) => {
                setDisplayName(value);
                clearFeedback();
              }}
              maxLength={50}
            />
            <div className="field">
              <label htmlFor="editBio">Bio</label>
              <textarea
                id="editBio"
                value={bio}
                onChange={(event) => {
                  setBio(event.target.value);
                  clearFeedback();
                }}
                maxLength={280}
                rows={4}
                placeholder="Your interests, creative work, or something you love…"
              />
              <p className="counter">{bio.length}/280</p>
            </div>
            <ChoiceSet
              title="How you like to connect"
              values={styles}
              options={Object.keys(SOCIAL_STYLE_LABELS) as SocialStyle[]}
              onToggle={(style) => {
                setStyles(
                  styles.includes(style)
                    ? styles.filter((value) => value !== style)
                    : [...styles, style],
                );
                clearFeedback();
              }}
            />
            <p className="editor-footnote muted">
              Looking for your handle, campus or course?{' '}
              <a href="/settings?section=profile">Edit additional details in Settings.</a>
            </p>
          </section>
          <section className="editor-panel" hidden={editorSection !== 'photos'}>
            <div className="editor-section-heading">
              <div>
                <span className="eyebrow">PUT A FACE TO THE NAME</span>
                <h2>Profile photos</h2>
                <p className="muted">
                  Crop, rotate and add a filter before saving. Up to six photos.
                </p>
              </div>
            </div>
            <input
              ref={photoInput}
              className="sidle-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose a profile photo"
              disabled={busy || mediaBusy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) setPhotoDraft({ file, replacing: replacePhoto.current });
                replacePhoto.current = undefined;
              }}
            />
            <div className="profile-photo-grid">
              {profile.media.map((media, index) => (
                <article className="profile-photo-card" key={media.id}>
                  <div className="profile-photo-image">
                    {mediaUrls[media.id] ? (
                      <img
                        src={mediaUrls[media.id]}
                        alt={`Profile photo ${index + 1}`}
                        onError={() => setMediaUrls((current) => ({ ...current, [media.id]: '' }))}
                      />
                    ) : (
                      <UiIcon name="image" size={40} />
                    )}
                    {index === 0 && (
                      <span className="profile-photo-primary">
                        <UiIcon name="check" size={13} />
                        Profile picture
                      </span>
                    )}
                  </div>
                  <div className="profile-photo-actions">
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={busy || mediaBusy}
                      onClick={() => void editPhoto(media)}
                      aria-label={`Edit profile photo ${index + 1}`}
                    >
                      <UiIcon name="edit" size={16} />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="icon-control"
                      disabled={busy || mediaBusy}
                      aria-label={`Replace profile photo ${index + 1}`}
                      title="Replace photo"
                      onClick={() => {
                        replacePhoto.current = media;
                        photoInput.current?.click();
                      }}
                    >
                      <UiIcon name="image" size={18} />
                    </button>
                    <button
                      type="button"
                      className="icon-control"
                      disabled={busy || mediaBusy}
                      aria-label={`Remove profile photo ${index + 1}`}
                      title="Remove photo"
                      onClick={() => void removeImage(media.id)}
                    >
                      <UiIcon name="trash" size={17} />
                    </button>
                  </div>
                  {index > 0 && (
                    <button
                      type="button"
                      className="link make-profile-picture"
                      disabled={busy || mediaBusy}
                      onClick={() => void makePrimary(media)}
                    >
                      Use as profile picture
                    </button>
                  )}
                </article>
              ))}
              {profile.media.length < 6 && (
                <button
                  type="button"
                  className="profile-photo-add"
                  disabled={busy || mediaBusy}
                  onClick={() => {
                    replacePhoto.current = undefined;
                    photoInput.current?.click();
                  }}
                >
                  <UiIcon name="plus" size={27} />
                  <strong>Add a photo</strong>
                  <small>JPG, PNG or WebP · up to 5 MB</small>
                </button>
              )}
            </div>
            {profile.media.some((media) => !mediaUrls[media.id]) && (
              <button
                type="button"
                className="link"
                disabled={refreshingMedia || mediaBusy || busy}
                onClick={() => void refreshMedia()}
              >
                {refreshingMedia ? 'Refreshing photos…' : 'Retry loading photos'}
              </button>
            )}
            <p className="muted editor-footnote">
              Photo changes save immediately. Your other edits stay in this editor until you save
              them.
            </p>
          </section>
          <section className="editor-panel" hidden={editorSection !== 'interests'}>
            <div className="editor-section-heading">
              <div>
                <span className="eyebrow">FIND YOUR PEOPLE</span>
                <h2>Your interests</h2>
                <p className="muted">Choose three to twelve things you enjoy.</p>
              </div>
              <span className="editor-count">{selectedDraft.length}/12</span>
            </div>
            <CategorizedInterests
              interests={interests}
              selected={selected}
              onToggle={(id) => {
                if (selected[id] === undefined && selectedDraft.length >= 12) {
                  setError('Choose no more than 12 interests.');
                  setMessage(null);
                  return;
                }
                setSelected((current) => {
                  const next = { ...current };
                  if (current[id] !== undefined) delete next[id];
                  else next[id] = 2;
                  return next;
                });
                clearFeedback();
              }}
            />
          </section>
          <section className="editor-panel" hidden={editorSection !== 'icebreakers'}>
            <IcebreakerEditor
              prompts={prompts}
              answers={answers}
              disabled={busy || mediaBusy}
              onChange={(next) => {
                setAnswers(next);
                clearFeedback();
              }}
            />
          </section>
          <div className="editor-save-bar">
            <div>
              <strong>
                {hasUnsavedChanges ? 'You have unsaved changes' : 'Your profile is up to date'}
              </strong>
              <small>Changes stay here when you switch sections.</small>
            </div>
            <div>
              <button
                type="button"
                className="secondary compact"
                disabled={!hasUnsavedChanges || busy || mediaBusy}
                onClick={discardDraft}
              >
                Discard
              </button>
              <button
                type="button"
                disabled={busy || mediaBusy || !hasUnsavedChanges || Boolean(saveValidationMessage)}
                onClick={() => void save()}
              >
                {busy ? 'Saving changes…' : 'Save changes'}
              </button>
            </div>
          </div>
          {message && (
            <p className="notice ok" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="notice err" role="alert">
              {error}
            </p>
          )}
          {saveValidationMessage && (
            <p className="notice err" role="status">
              {saveValidationMessage}
            </p>
          )}
          {mediaBusy && (
            <p className="notice" role="status">
              Processing your photo…
            </p>
          )}
        </div>
        <aside className="editor-live-preview" aria-label="Profile preview">
          <span className="eyebrow">LIVE PREVIEW</span>
          <article className="editor-preview-card">
            <div className="editor-preview-image">
              {primaryMedia && mediaUrls[primaryMedia.id] ? (
                <img src={mediaUrls[primaryMedia.id]} alt="Your profile preview" />
              ) : (
                <span>{(displayName || '?').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="editor-preview-copy">
              <h2>{displayName.trim() || 'Your name'}</h2>
              <p>{bio.trim() || 'Your bio will appear here.'}</p>
              <div className="shared-interests-row">
                {interests
                  .filter((interest) => selected[interest.id])
                  .slice(0, 4)
                  .map((interest) => (
                    <span className="shared-chip" key={interest.id}>
                      {interest.name}
                    </span>
                  ))}
              </div>
              {activePrompt && (
                <blockquote>
                  <strong>{activePrompt.prompt}</strong>
                  <p>{answers[activePrompt.id]}</p>
                </blockquote>
              )}
            </div>
          </article>
          <p className="muted editor-footnote">A preview of how you show up.</p>
        </aside>
      </div>
      {photoDraft && (
        <PhotoEditor
          file={photoDraft.file}
          replacing={Boolean(photoDraft.replacing)}
          onSave={savePhoto}
          onClose={() => setPhotoDraft(null)}
        />
      )}
    </div>
  );
}

function AccountSettings({
  me,
  sessions,
  revoke,
  onBack,
}: {
  me: Me;
  sessions: DeviceSession[];
  revoke: (id: string) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section className="settings-page" aria-labelledby="account-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1 id="account-title">Account & security</h1>
          <p className="muted">
            {me.email || me.phone} · {me.status}
          </p>
        </div>
        <button type="button" className="secondary compact" onClick={onBack}>
          Back to Settings
        </button>
      </header>
      {error && (
        <p className="notice err" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice ok" role="status">
          {notice}
        </p>
      )}
      <section className="settings-panel">
        <h2>Password reset</h2>
        <p className="muted">Send a reset link to your sign-in email.</p>
        <button
          type="button"
          disabled={busy || !me.email}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await getAuth().requestPasswordReset(me.email!, `${window.location.origin}/reset`);
              setNotice('If available, a password reset link has been sent to your sign-in email.');
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Send reset link
        </button>
      </section>
      <Devices sessions={sessions} revoke={revoke} />
      <section
        className="card"
        id="account-data"
        tabIndex={-1}
        style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}
      >
        <span className="eyebrow" style={{ color: 'var(--danger)' }}>
          DATA PRIVACY & REMOVAL
        </span>
        <h2>Delete Account and Personal Data</h2>
        <p className="muted">
          Immediately disables app access and removes your profile details, contact information,
          interests, prompts and memberships. Storage photos and your sign-in account are queued for
          server cleanup. Past messages and safety reports remain; provider backups follow their
          retention policy. Delete any groups you own first.
        </p>
        <button
          type="button"
          className="danger compact"
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                'Remove this account? App access ends immediately. Photos and sign-in records are queued for cleanup; historical messages, reports and provider backups are retained as described. This cannot be undone.',
              )
            )
              return;
            setBusy(true);
            setError(null);
            try {
              await getSafetyClient().deleteAccount();
              await getAuth().signOut();
              window.location.reload();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete my account
        </button>
      </section>
    </section>
  );
}

function CategorizedInterests({
  interests,
  selected,
  onToggle,
}: {
  interests: Interest[];
  selected: Record<string, 1 | 2 | 3>;
  onToggle: (id: string) => void;
}) {
  const categories: { title: string; names: string[] }[] = [
    {
      title: 'Campus & Ambition',
      names: [
        'Study Groups',
        'Accounting',
        'Finance',
        'Programming',
        'Artificial Intelligence',
        'Cybersecurity',
        'Debate',
        'Student Life',
        'Languages',
        'Business',
        'Investing',
        'Entrepreneurship',
      ],
    },
    {
      title: 'Music & Culture',
      names: [
        'Afrobeats',
        'Amapiano',
        'Hip Hop',
        'R&B',
        'Gospel',
        'Church / Faith Communities',
        'Volunteering',
      ],
    },
    {
      title: 'Sports & Fitness',
      names: ['Football', 'Basketball', 'Running', 'Gym', 'Tennis', 'Fitness'],
    },
    {
      title: 'Arts & Entertainment',
      names: [
        'Anime',
        'Manga',
        'Cosplay',
        'Photography',
        'Drawing',
        'Design',
        'Writing',
        'Movies',
        'Series',
        'Documentaries',
        'Books',
      ],
    },
    {
      title: 'Gaming & Lifestyle',
      names: [
        'Gaming',
        'FIFA / EA FC',
        'Call of Duty',
        'Minecraft',
        'Mobile Gaming',
        'Cooking',
        'Baking',
        'Trying Restaurants',
        'Cars',
        'Fashion',
        'Travel',
        'Road Trips',
        'Nature',
      ],
    },
  ];

  const matchedIds = new Set<string>();

  return (
    <div>
      {categories.map((cat) => {
        const catInterests = interests.filter((i) => cat.names.includes(i.name));
        catInterests.forEach((i) => matchedIds.add(i.id));
        if (catInterests.length === 0) return null;

        return (
          <div key={cat.title} className="interest-category-block">
            <h4 style={{ margin: '0 0 8px', fontSize: '0.78rem' }}>{cat.title}</h4>
            <div className="interest-chips-wrap">
              {catInterests.map((i) => {
                const chosen = selected[i.id] !== undefined;
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={`interest-chip-btn ${chosen ? 'selected' : ''}`}
                    onClick={() => onToggle(i.id)}
                  >
                    <span>{chosen ? '✓' : '+'}</span>
                    <span>{i.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {interests.filter((i) => !matchedIds.has(i.id)).length > 0 && (
        <div className="interest-category-block">
          <h4 style={{ margin: '0 0 8px', fontSize: '0.78rem' }}>Other Passions</h4>
          <div className="interest-chips-wrap">
            {interests
              .filter((i) => !matchedIds.has(i.id))
              .map((i) => {
                const chosen = selected[i.id] !== undefined;
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={`interest-chip-btn ${chosen ? 'selected' : ''}`}
                    onClick={() => onToggle(i.id)}
                  >
                    <span>{chosen ? '✓' : '+'}</span>
                    <span>{i.name}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceSet({
  title,
  values,
  options,
  onToggle,
}: {
  title: string;
  values: SocialStyle[];
  options: SocialStyle[];
  onToggle: (option: SocialStyle) => void;
}) {
  const STYLE_ICONS: Record<SocialStyle, string> = {
    small_group: '👥',
    one_to_one: '💬',
    text_first: '✍️',
    voice_first: '🎙️',
    low_pressure: '🌿',
  };

  const STYLE_DESCRIPTIONS: Record<SocialStyle, string> = {
    small_group: 'Hangouts with small friendly groups',
    one_to_one: 'Direct, focused 1-on-1 conversations',
    text_first: 'Chat via messages before meeting',
    voice_first: 'Quick voice notes and calls',
    low_pressure: 'Respond on your own time without rush',
  };

  return (
    <div style={{ marginTop: 20 }}>
      <label>{title}</label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
          marginTop: 8,
        }}
      >
        {options.map((option) => {
          const active = values.includes(option);
          return (
            <div
              key={option}
              onClick={() => onToggle(option)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: active ? 'var(--accent-soft)' : 'var(--surface-sunken)',
                border: active ? '1.5px solid var(--accent)' : '1px solid var(--line)',
                cursor: 'pointer',
                transition: 'all var(--dur-fast)',
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>{STYLE_ICONS[option]}</span>
              <div>
                <span
                  style={{
                    display: 'block',
                    fontWeight: 650,
                    fontSize: '0.9rem',
                    color: active ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {SOCIAL_STYLE_LABELS[option]}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.76rem',
                    color: 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  {STYLE_DESCRIPTIONS[option]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PrivacyEditor({
  privacy,
  setPrivacy,
}: {
  privacy: Profile['privacy'];
  setPrivacy: (value: Profile['privacy']) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label className="switch-row">
        <div className="switch-label-group">
          <span className="switch-title">Discoverable in Search & Feed</span>
          <span className="switch-desc">
            Allow compatible people to discover your profile and say hi.
          </span>
        </div>
        <div className="toggle-switch">
          <input
            type="checkbox"
            checked={privacy.discoverable}
            onChange={(e) => setPrivacy({ ...privacy, discoverable: e.target.checked })}
          />
          <span className="toggle-slider" />
        </div>
      </label>

      <div className="field">
        <label htmlFor="messagePermission">Who can send you direct messages?</label>
        <select
          id="messagePermission"
          value={privacy.messagePermission}
          onChange={(e) =>
            setPrivacy({
              ...privacy,
              messagePermission: e.target.value as typeof privacy.messagePermission,
            })
          }
        >
          {PRIVACY_OPTIONS.messagePermission.map((v) => (
            <option key={v} value={v}>
              {v === 'everyone'
                ? 'Everyone (with suggested openers)'
                : v === 'connections'
                  ? 'Mutual connections only'
                  : 'Nobody (read-only)'}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label htmlFor="storyVisibility">Stories & Moments</label>
          <select
            id="storyVisibility"
            value={privacy.storyVisibility}
            onChange={(e) =>
              setPrivacy({
                ...privacy,
                storyVisibility: e.target.value as typeof privacy.storyVisibility,
              })
            }
          >
            {PRIVACY_OPTIONS.visibility.map((v) => (
              <option key={v} value={v}>
                {v === 'public' ? 'Everyone' : v === 'connections' ? 'Connections only' : 'Private'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="activityVisibility">Activity status</label>
          <select
            id="activityVisibility"
            value={privacy.activityVisibility}
            onChange={(e) =>
              setPrivacy({
                ...privacy,
                activityVisibility: e.target.value as typeof privacy.activityVisibility,
              })
            }
          >
            {PRIVACY_OPTIONS.visibility.map((v) => (
              <option key={v} value={v}>
                {v === 'public' ? 'Everyone' : v === 'connections' ? 'Connections only' : 'Private'}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function parseUserAgent(ua?: string): { name: string; browser: string; icon: string } {
  if (!ua) return { name: 'Current Device', browser: 'Web Browser', icon: '💻' };
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
  let browser = 'Browser';
  if (/Edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome/i.test(ua)) browser = 'Google Chrome';
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/Firefox/i.test(ua)) browser = 'Mozilla Firefox';

  let os = 'Desktop';
  if (/Windows/i.test(ua)) os = 'Windows PC';
  else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android Phone';
  else if (/Linux/i.test(ua)) os = 'Linux PC';

  return { name: os, browser, icon: isMobile ? '📱' : '💻' };
}

function Devices({
  sessions,
  revoke,
}: {
  sessions: DeviceSession[];
  revoke: (id: string) => void;
}) {
  return (
    <section className="card" id="account-sessions" tabIndex={-1} style={{ marginTop: 24 }}>
      <div className="card-header">
        <div>
          <span className="eyebrow">SECURITY</span>
          <h2>Active Devices</h2>
          <p className="muted">Manage where your account is signed in.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sessions.map((s) => {
          const info = parseUserAgent(s.userAgent ?? undefined);
          return (
            <div className="device-card-item" key={s.id}>
              <div className="device-info">
                <div className="device-icon-box">{info.icon}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: '0.92rem', color: 'var(--text)' }}>
                    {info.name}
                    {s.current && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: '0.72rem',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'var(--success-soft)',
                          color: 'var(--success)',
                          fontWeight: 700,
                        }}
                      >
                        This device
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {info.browser} · Active session
                  </div>
                </div>
              </div>
              {!s.current && (
                <button className="secondary compact" onClick={() => revoke(s.id)}>
                  Sign out
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
