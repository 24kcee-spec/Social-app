"use client";

import type { Interest, Profile, PromptDefinition, SocialStyle } from "@sp/types";
import type { OnboardingInput } from "@sp/validation";
import { AuthClientError, type DeviceSession, type Me } from "@sp/auth-client";
import { type ProfileClient, parseShareUrl, validateSafeRedirect } from "@sp/profile-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage, getAuth, isConfigured } from "../lib/auth";
import { Connections } from "./connections";
import { Discover } from "./discover";
import { Community } from "./community";
import { Messages } from "./messages";
import { getMessagingClient } from "../lib/messaging";
import { getSafetyClient } from "../lib/safety";
import { deleteProfileImage, getProfileClient, getSignedMediaUrl, uploadProfileImage } from "../lib/profile";
import { AccountMenu } from "./account-menu";
import { MyProfileView } from "./my-profile-view";
import { SettingsOverview, type ThemePreference } from "./settings-overview";

const SOCIAL_STYLE_LABELS: Record<SocialStyle, string> = {
  small_group: "Small groups",
  one_to_one: "One-to-one",
  text_first: "Text-first",
  voice_first: "Voice-first",
  low_pressure: "Low pressure",
};

const PRIVACY_OPTIONS = {
  messagePermission: ["everyone", "connections", "nobody"] as const,
  visibility: ["public", "connections", "private"] as const,
};

type Mode = "signin" | "signup" | "forgot";
const APP_TABS = ["discover", "connections", "messages", "community", "profile"] as const;
type AppTab = (typeof APP_TABS)[number];
type ShellView = "app" | "settings" | "viewProfile";
type AppNavigation = { shellView: ShellView; tab: AppTab; focusSection: string | null };
const PROFILE_EDITOR_SECTIONS = ["profile-details", "privacy-settings", "account-sessions", "account-data"] as const;

function isAppTab(value: string | null): value is AppTab {
  return APP_TABS.some((tab) => tab === value);
}

function readAppNavigation(search: string): AppNavigation {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const tab: AppTab = isAppTab(requestedTab) ? requestedTab : "discover";
  const view = params.get("view");

  if (view === "settings") return { shellView: "settings", tab, focusSection: null };
  if (view === "profile-preview") return { shellView: "viewProfile", tab, focusSection: null };

  const requestedSection = params.get("section");
  if (requestedSection && PROFILE_EDITOR_SECTIONS.includes(requestedSection as (typeof PROFILE_EDITOR_SECTIONS)[number])) {
    return { shellView: "app", tab: "profile", focusSection: requestedSection };
  }
  return { shellView: "app", tab, focusSection: null };
}

function navigationHref(currentHref: string, navigation: AppNavigation): string {
  const url = new URL(currentHref);
  url.searchParams.delete("view");
  url.searchParams.delete("tab");
  url.searchParams.delete("section");
  url.searchParams.delete("next");

  if (navigation.shellView === "settings") url.searchParams.set("view", "settings");
  if (navigation.shellView === "viewProfile") url.searchParams.set("view", "profile-preview");
  if (navigation.tab !== "discover") url.searchParams.set("tab", navigation.tab);
  if (navigation.focusSection && PROFILE_EDITOR_SECTIONS.includes(navigation.focusSection as (typeof PROFILE_EDITOR_SECTIONS)[number])) {
    url.searchParams.set("section", navigation.focusSection);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

type Phase =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; me: Me; sessions: DeviceSession[] }
  | { kind: "error"; message: string };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const auth = getAuth();
      if (!(await auth.isSignedIn())) return setPhase({ kind: "signedOut" });
      // The account record is essential; session inventory is secondary. Render the app
      // as soon as /me succeeds, then fill in the session list without blocking the shell.
      const me = await auth.fetchMe();
      setPhase({ kind: "signedIn", me, sessions: [] });
      void auth.listSessions().then((sessions) => {
        setPhase((current) =>
          current.kind === "signedIn" && current.me.id === me.id
            ? { ...current, sessions }
            : current,
        );
      }).catch((sessionsError: unknown) => {
        // A temporarily unavailable session inventory must not hide the user's account.
        // An invalid/revoked token is different: return them to the signed-out screen.
        if (sessionsError instanceof AuthClientError &&
          (sessionsError.code === "unauthorized" || sessionsError.code === "not_signed_in")) {
          void auth.signOut().catch(() => undefined);
          setPhase((current) =>
            current.kind === "signedIn" && current.me.id === me.id
              ? { kind: "signedOut" }
              : current,
          );
        }
      });
    } catch (err) {
      if (err instanceof AuthClientError && (err.code === "unauthorized" || err.code === "not_signed_in")) {
        await getAuth().signOut().catch(() => undefined);
        return setPhase({ kind: "signedOut" });
      }
      setPhase({ kind: "error", message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured()) {
      return setPhase({ kind: "signedOut" });
    }
    void load();
    return getAuth().onAuthChange((event) => {
      if (["SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"].includes(event)) void load();
    });
  }, [load]);

  if (phase.kind === "loading") {
    return (
      <div className="auth-wrapper">
        <div className="auth-card-editorial" style={{ textAlign: "center" }}>
          <div className="brand-mark" style={{ margin: "0 auto 16px" }}>S</div>
          <h2>Loading your space…</h2>
          <p className="muted">Retrieving your account details.</p>
        </div>
      </div>
    );
  }

  if (phase.kind === "signedOut") {
    return <AuthForm />;
  }

  if (phase.kind === "error") {
    return (
      <div className="auth-wrapper">
        <div className="auth-card-editorial">
          <div className="auth-brand-badge">Connection problem</div>
          <h2>We couldn’t load your account</h2>
          <p className="muted" role="alert">{phase.message}</p>
          <p className="muted">
            Check your connection and try again. If this keeps happening, the API service may be temporarily unavailable.
          </p>
          <button
            className="auth-submit-btn"
            onClick={() => {
              setPhase({ kind: "loading" });
              void load();
            }}
          >
            Try again
          </button>
          <button
            className="auth-submit-btn secondary"
            onClick={() => {
              void getAuth().signOut().catch(() => undefined);
              setPhase({ kind: "signedOut" });
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
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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
      if (mode === "signin") {
        await auth.signIn({ email, password });
      } else if (mode === "signup") {
        const r = await auth.signUp({ email, password, displayName: displayName.trim() || undefined });
        if (r === "confirm_email") {
          setNotice("Check your email and click the confirmation link, then sign in.");
        }
      } else {
        await auth.requestPasswordReset(email, `${window.location.origin}/reset`);
        setNotice("If that email has an account, a reset link is on its way.");
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
          <div className="auth-brand-badge">S · SOCIAL</div>
          <h1>{mode === "signin" ? "Welcome back" : mode === "signup" ? "Join the community" : "Reset your password"}</h1>
          <p className="muted">
            {mode === "signin"
              ? "Sign in to discover people and conversations at your pace."
              : mode === "signup"
              ? "A calm space for genuine relationships, without vanity metrics."
              : "Enter your email address and we'll send a secure password reset link."}
          </p>
        </header>

        <div className="auth-nav-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-nav-btn ${mode === "signin" ? "active" : ""}`}
            onClick={() => { setMode("signin"); setError(null); setNotice(null); }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-nav-btn ${mode === "signup" ? "active" : ""}`}
            onClick={() => { setMode("signup"); setError(null); setNotice(null); }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          {mode === "signup" && (
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

          {mode !== "forgot" && (
            <Field
              label="Password"
              id="password"
              type="password"
              value={password}
              setValue={setPassword}
              error={fields.password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
            {busy ? "Please wait…" : mode === "signin" ? "Sign in to account" : mode === "signup" ? "Create your account" : "Send reset link"}
          </button>

          <div className="auth-footer-links">
            {mode === "signin" ? (
              <button type="button" className="link" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>
                Forgot your password?
              </button>
            ) : (
              <button type="button" className="link" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
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
  type = "text",
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
        <p className="err" id={`${id}-err`} role="alert" style={{ margin: "4px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ==========================================================================
   Redesigned Application Shell (Scope C1 - A)
   ========================================================================== */

function Account({ me, sessions, reload }: { me: Me; sessions: DeviceSession[]; reload: () => Promise<void> }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [prompts, setPrompts] = useState<PromptDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AppTab>("discover");
  const [shellView, setShellView] = useState<ShellView>("app");
  const [focusSection, setFocusSection] = useState<string | null>(null);
  const lastAppNavigation = useRef<AppNavigation>({ shellView: "app", tab: "discover", focusSection: null });
  const currentNavigationRef = useRef<AppNavigation>({ shellView: "app", tab: "discover", focusSection: null });
  const currentHrefRef = useRef("");
  const profileEditorDirtyRef = useRef(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  const setProfileDirty = useCallback((dirty: boolean) => {
    profileEditorDirtyRef.current = dirty;
  }, []);
  const [pendingIn, setPendingIn] = useState(0);
  const [unread, setUnread] = useState(0);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const client = useMemo<ProfileClient>(() => getProfileClient(), []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, i, pr] = await Promise.all([client.getProfile(), client.listInterests(), client.listPrompts()]);
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
      const leavingEditor = previous.shellView === "app" && previous.tab === "profile"
        && (navigation.shellView !== "app" || navigation.tab !== "profile");

      if (leavingEditor && profileEditorDirtyRef.current) {
        const confirmed = window.confirm(
          "You have unsaved profile changes. Leave without saving? Photo uploads and removals are saved immediately and will not be undone.",
        );
        if (!confirmed) {
          const restoreHref = currentHrefRef.current || navigationHref(window.location.href, previous);
          window.history.pushState({ ...(window.history.state ?? {}), socialAppNavigation: true }, "", restoreHref);
          return;
        }
        setProfileDirty(false);
      }

      currentNavigationRef.current = navigation;
      currentHrefRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      lastAppNavigation.current = {
        shellView: "app",
        tab: navigation.tab,
        focusSection: navigation.shellView === "app" ? navigation.focusSection : null,
      };
      setShellView(navigation.shellView);
      setTab(navigation.tab);
      setFocusSection(navigation.focusSection);
    };
    restoreNavigation();
    window.addEventListener("popstate", restoreNavigation);
    return () => window.removeEventListener("popstate", restoreNavigation);
  }, [setProfileDirty]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("social-app-theme");
      if (saved === "system" || saved === "light" || saved === "dark") setThemePreference(saved);
    } catch {
      // Private browsing or storage restrictions should not prevent app use.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (themePreference === "system") root.removeAttribute("data-theme");
    else root.dataset.theme = themePreference;
    try {
      window.localStorage.setItem("social-app-theme", themePreference);
    } catch {
      // The selected appearance still applies for this session.
    }
  }, [themePreference]);

  useEffect(() => {
    if (shellView !== "app" || tab !== "profile" || !focusSection) return;
    document.getElementById(focusSection)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setFocusSection(null);
  }, [shellView, tab, focusSection, profile]);

  function applyNavigation(navigation: AppNavigation, historyMode: "push" | "replace" = "push") {
    const href = navigationHref(window.location.href, navigation);
    const historyState = { ...(window.history.state ?? {}), socialAppNavigation: true };
    if (historyMode === "replace") window.history.replaceState(historyState, "", href);
    else window.history.pushState(historyState, "", href);

    currentNavigationRef.current = navigation;
    currentHrefRef.current = href;
    if (navigation.shellView === "app") lastAppNavigation.current = navigation;
    setShellView(navigation.shellView);
    setFocusSection(navigation.focusSection);
    setTab(navigation.tab);
  }

  function confirmLeaveProfileEditor() {
    if (!(shellView === "app" && tab === "profile") || !profileEditorDirtyRef.current) return true;
    return window.confirm(
      "You have unsaved profile changes. Leave without saving? Photo uploads and removals are saved immediately and will not be undone.",
    );
  }

  function navigateTab(nextTab: AppTab, historyMode: "push" | "replace" = "push") {
    if (nextTab !== "profile" && !confirmLeaveProfileEditor()) return;
    applyNavigation({ shellView: "app", tab: nextTab, focusSection: null }, historyMode);
  }

  function openShellView(nextView: "settings" | "viewProfile") {
    if (!confirmLeaveProfileEditor()) return;
    lastAppNavigation.current = { shellView: "app", tab, focusSection: null };
    applyNavigation({ shellView: nextView, tab, focusSection: null });
  }

  function returnToApp() {
    applyNavigation(lastAppNavigation.current, "replace");
  }

  function openProfileSection(sectionId: string) {
    const safeSection = PROFILE_EDITOR_SECTIONS.includes(sectionId as (typeof PROFILE_EDITOR_SECTIONS)[number])
      ? sectionId
      : null;
    applyNavigation({ shellView: "app", tab: "profile", focusSection: safeSection });
  }

  // Keep the Messages tab badge warm even while looking at other tabs.
  useEffect(() => {
    const messaging = getMessagingClient();
    const tick = () =>
      messaging
        .listConversations()
        .then((l) => setUnread(l.reduce((n, c) => n + c.unreadCount, 0)))
        .catch(() => undefined);
    void tick();
    const t = setInterval(tick, 45_000);
    return () => clearInterval(t);
  }, []);

  // Cross-device continuity: restore intended destination after authentication
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const safeNext = validateSafeRedirect(next);
    if (!safeNext) return;

    const parsed = parseShareUrl(safeNext);
    if (parsed) {
      const targetTab: AppTab = parsed.targetType === "group" || parsed.targetType === "event"
        ? "community"
        : "discover";
      applyNavigation({ shellView: "app", tab: targetTab, focusSection: null }, "replace");
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
          <button type="button" className="brand-group brand-home-button" onClick={() => navigateTab("discover")} aria-label="Go to Discover">
            <div className="brand-mark-glow" aria-hidden="true">S</div>
            <div className="brand-text-wrap">
              <span className="brand-title">Social</span>
              <span className="brand-tagline">Low-pressure connection</span>
            </div>
          </button>

          {profile?.onboardingCompleted && (
            <nav className="nav-pill-bar" aria-label="Main Navigation">
              <button
                role="tab"
                aria-selected={tab === "discover"}
                className={`nav-pill-btn ${tab === "discover" ? "active" : ""}`}
                onClick={() => navigateTab("discover")}
              >
                <span>🧭</span>
                <span>Discover</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "connections"}
                className={`nav-pill-btn ${tab === "connections" ? "active" : ""}`}
                onClick={() => navigateTab("connections")}
              >
                <span>🤝</span>
                <span>Connections</span>
                {pendingIn > 0 && <span className="nav-badge">{pendingIn}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === "messages"}
                className={`nav-pill-btn ${tab === "messages" ? "active" : ""}`}
                onClick={() => navigateTab("messages")}
              >
                <span>💬</span>
                <span>Messages</span>
                {unread > 0 && <span className="nav-badge">{unread}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === "community"}
                className={`nav-pill-btn ${tab === "community" ? "active" : ""}`}
                onClick={() => navigateTab("community")}
              >
                <span>🎈</span>
                <span>Community</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "profile"}
                className={`nav-pill-btn ${tab === "profile" ? "active" : ""}`}
                onClick={() => navigateTab("profile")}
              >
                <span>👤</span>
                <span>Profile</span>
              </button>
            </nav>
          )}

          <div className="user-bar">
            <AccountMenu
              displayName={profile?.displayName ?? "Member"}
              email={me.email}
              onViewProfile={() => openShellView("viewProfile")}
              onEditProfile={() => openProfileSection("profile-details")}
              onOpenSettings={() => openShellView("settings")}
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
            <button className="link" onClick={() => void loadProfile()}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="empty-state-card">
            <div className="empty-state-icon">✦</div>
            <h2>Opening your space…</h2>
            <p className="muted">Retrieving your profile, interests and connections.</p>
          </div>
        ) : profile && !profile.onboardingCompleted ? (
          <Onboarding profile={profile} interests={interests} prompts={prompts} client={client} onDone={setProfile} />
        ) : profile && shellView === "settings" ? (
          <SettingsOverview
            me={me}
            sessions={sessions}
            theme={themePreference}
            onThemeChange={setThemePreference}
            onBack={returnToApp}
            onEditProfile={() => openProfileSection("profile-details")}
            onOpenPrivacy={() => openProfileSection("privacy-settings")}
            onOpenSessions={() => openProfileSection("account-sessions")}
            onOpenAccountData={() => openProfileSection("account-data")}
            onOpenNotifications={() => navigateTab("messages")}
          />
        ) : profile && shellView === "viewProfile" ? (
          <MyProfileView
            profile={profile}
            onBack={returnToApp}
            onEdit={() => openProfileSection("profile-details")}
          />
        ) : profile ? (
          tab === "discover" ? (
            <Discover />
          ) : tab === "connections" ? (
            <Connections
              onCount={setPendingIn}
              onMessage={(userId) => {
                setChatWith(userId);
                navigateTab("messages");
              }}
            />
          ) : tab === "messages" ? (
            <Messages onUnread={setUnread} openWithUserId={chatWith} onOpened={() => setChatWith(null)} />
          ) : tab === "community" ? (
            <Community />
          ) : (
            <ProfileEditor
              profile={profile}
              interests={interests}
              prompts={prompts}
              client={client}
              onSaved={setProfile}
              sessions={sessions}
              revoke={revoke}
              onDirtyChange={setProfileDirty}
            />
          )
        ) : null}

        {profile?.onboardingCompleted && (
          <p className="footer-note">
            <span>✦ Social · Designed for authentic campus connection without vanity metrics or pressure.</span>
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
  const [displayName, setDisplayName] = useState(profile.displayName === "New member" ? "" : profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState<SocialStyle[]>(profile.socialStyles.length ? profile.socialStyles : ["low_pressure"]);
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
        interests: Object.entries(selected).map(([interestId, strength]) => ({ interestId, strength })),
        answers: selectedPrompts.map((promptId) => ({ promptId, answer: (answers[promptId] ?? "").trim() })),
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
        <Field label="Display name" id="displayName" value={displayName} setValue={setDisplayName} />
        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={4} />
          <p className="counter">{bio.length}/280</p>
        </div>
        <ChoiceSet
          title="How do you prefer to socialise?"
          values={styles}
          options={Object.keys(SOCIAL_STYLE_LABELS) as SocialStyle[]}
          onToggle={(style) =>
            setStyles(styles.includes(style) ? styles.filter((s) => s !== style) : [...styles, style])
          }
        />
      </section>

      <section className="card">
        <div className="eyebrow">STEP 2</div>
        <h2>Choose your interests</h2>
        <p className="muted">Pick at least 3 so the app can explain why people and activities are suggested.</p>
        <div className="interest-grid">
          {interests.map((i) => {
            const chosen = selected[i.id] !== undefined;
            return (
              <button
                type="button"
                key={i.id}
                className={chosen ? "chip selected" : "chip"}
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
        <p className={Object.keys(selected).length >= 3 ? "ok" : "err"}>
          {Object.keys(selected).length} selected (minimum 3)
        </p>
      </section>

      <section className="card">
        <div className="eyebrow">STEP 3</div>
        <h2>Answer a prompt</h2>
        <p className="muted">Choose 1–3. These will make your profile easier to understand than a photo alone.</p>
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
                        chosen ? current.filter((id) => id !== p.id) : current.length < 3 ? [...current, p.id] : current
                      )
                    }
                  />
                  <span>{p.prompt}</span>
                </label>
                {chosen && (
                  <textarea
                    value={answers[p.id] ?? ""}
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
        <p className={selectedPrompts.length >= 1 ? "ok" : "err"}>
          {selectedPrompts.length} prompt(s) selected
        </p>
      </section>

      <section className="card">
        <div className="eyebrow">STEP 4</div>
        <h2>Privacy</h2>
        <p className="muted">You decide how discoverable and reachable you are.</p>
        <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />
        {error && <p className="err" role="alert">{error}</p>}
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
          {busy ? "Saving…" : "Finish profile setup"}
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
  sessions,
  revoke,
  onDirtyChange,
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onSaved: (profile: Profile) => void;
  sessions: DeviceSession[];
  revoke: (id: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState(profile.socialStyles);
  const [privacy, setPrivacy] = useState({ ...profile.privacy });
  const [selected, setSelected] = useState<Record<string, 1 | 2 | 3>>(
    Object.fromEntries(profile.interests.map((i) => [i.id, (i.strength ?? 2) as 1 | 2 | 3]))
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(profile.prompts.map((p) => [p.promptId, p.answer]))
  );
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [refreshingMedia, setRefreshingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

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
  const validationMessage = displayName.trim().length < 2
    ? "Your display name must contain at least 2 characters."
    : displayName.trim().length > 50
      ? "Your display name must be 50 characters or fewer."
      : styles.length < 1
        ? "Choose at least one social style."
        : selectedDraft.length < 3
          ? "Choose at least 3 interests."
          : selectedDraft.length > 12
            ? "Choose no more than 12 interests."
            : nonEmptyAnswers.some((answer) => answer.trim().length < 2)
              ? "Each prompt answer must contain at least 2 characters."
              : nonEmptyAnswers.length < 1
                ? "Answer at least one conversation prompt."
                : nonEmptyAnswers.length > 3
                  ? "Answer no more than 3 conversation prompts."
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
            return [media.id, ""] as const;
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
    onDirtyChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function clearFeedback() {
    setError(null);
    setMessage(null);
  }

  function resetDraft(source: Profile) {
    setDisplayName(source.displayName);
    setBio(source.bio);
    setStyles([...source.socialStyles]);
    setPrivacy({ ...source.privacy });
    setSelected(Object.fromEntries(source.interests.map((interest) => [interest.id, (interest.strength ?? 2) as 1 | 2 | 3])));
    setAnswers(Object.fromEntries(source.prompts.map((prompt) => [prompt.promptId, prompt.answer])));
  }

  function discardDraft() {
    if (!hasUnsavedChanges || busy || mediaBusy) return;
    if (!window.confirm("Discard your unsaved profile details, interests, prompt answers and privacy changes? Photo uploads and removals are saved immediately and will not be undone.")) return;
    resetDraft(profile);
    clearFeedback();
    setMessage("Unsaved profile changes discarded. Photo changes remain saved.");
    onDirtyChange(false);
  }

  async function save() {
    if (busy || mediaBusy || !hasUnsavedChanges || saveValidationMessage) return;
    setBusy(true);
    clearFeedback();
    try {
      await client.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: styles,
        privacy,
      });
      await client.updateInterests({
        interests: Object.entries(selected).map(([interestId, strength]) => ({ interestId, strength })),
      });
      const chosenAnswers = Object.entries(answers)
        .filter(([, answer]) => answer.trim())
        .slice(0, 3)
        .map(([promptId, answer]) => ({ promptId, answer: answer.trim() }));
      await client.updatePrompts({ answers: chosenAnswers });
      const saved = await client.getProfile();
      onSaved(saved);
      resetDraft(saved);
      setMessage("Profile saved successfully.");
      onDirtyChange(false);
    } catch (err) {
      setError(errorMessage(err));
      try {
        const latest = await client.getProfile();
        onSaved(latest);
        setMessage("We refreshed the saved profile after the error. Some earlier fields may already have been saved; review your remaining changes before retrying.");
      } catch {
        setMessage("One or more save steps may have completed before the error. Refresh the page and check your saved profile before retrying.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addImage(file: File) {
    if (busy || mediaBusy || profile.media.length >= 6) return;
    setMediaBusy(true);
    clearFeedback();
    try {
      const media = await uploadProfileImage(file, profile.media);
      onSaved({ ...profile, media: [...profile.media, media] });
      setMessage("Photo uploaded and saved immediately.");
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
    if (!window.confirm("Remove this profile photo? This change is saved immediately.")) return;
    setMediaBusy(true);
    clearFeedback();
    try {
      await deleteProfileImage(media);
      onSaved({ ...profile, media: profile.media.filter((item) => item.id !== id) });
      setMessage("Photo removed and saved immediately.");
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

  const activePrompt = prompts.find((p) => (answers[p.id] ?? "").trim().length > 0);
  const answeredPromptCount = nonEmptyAnswers.length;
  const verificationLabel = profile.verificationLevel === "student_verified"
    ? "Student verified"
    : profile.verificationLevel === "trusted"
      ? "Trusted member"
      : profile.verificationLevel === "email_verified"
        ? "Email verified"
        : null;

  return (
    <div className="profile-dashboard">
      {/* Profile Header Hero */}
      <div className="card" style={{ marginBottom: 28, padding: "28px 32px", background: "linear-gradient(135deg, var(--surface) 0%, var(--surface-sunken) 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366F1 0%, #A855F7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: "2rem",
                  fontWeight: 800,
                  boxShadow: "0 8px 24px rgba(99, 102, 241, 0.35)",
                  overflow: "hidden",
                }}
              >
                {profile.media?.[0] && mediaUrls[profile.media[0].id] ? (
                  <img
                    src={mediaUrls[profile.media[0].id]}
                    alt={profile.displayName}
                    onError={() => setMediaUrls((current) => ({ ...current, [profile.media[0].id]: "" }))}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span className="profile-card-initial">{profile.displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>
            </div>
            <div>
              <span className="eyebrow">PROFILE STUDIO</span>
              <h1 style={{ fontSize: "1.75rem", margin: "2px 0 6px" }}>{displayName.trim() || "Your Space"}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {selectedDraft.length} interests · {styles.length} social styles · {privacy.discoverable ? "Discoverable" : "Not discoverable"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="secondary compact"
              onClick={discardDraft}
              disabled={!hasUnsavedChanges || busy || mediaBusy}
            >
              Discard unsaved edits
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || mediaBusy || !hasUnsavedChanges || Boolean(saveValidationMessage)}
            >
              {busy ? "Saving changes…" : "Save changes"}
            </button>
          </div>
        </div>
        {message && (
          <div className="notice ok" role="status" style={{ marginTop: 18, marginBottom: 0 }}>
            <span>✓ {message}</span>
          </div>
        )}
        {error && (
          <div className="notice err" role="alert" style={{ marginTop: 18, marginBottom: 0 }}>
            <span>{error}</span>
          </div>
        )}
        {saveValidationMessage && (
          <div className="notice err" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
            <span>{saveValidationMessage}</span>
          </div>
        )}
        {mediaBusy && (
          <div className="notice" role="status" style={{ marginTop: 12, marginBottom: 0 }}>
            <span>Processing your photo change… please keep this page open.</span>
          </div>
        )}
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          Profile details, interests, prompts and privacy save when you choose Save changes. Photo uploads and removals are saved immediately.
        </p>
      </div>

      <div className="profile-dashboard-grid">
        {/* Left Column: Live Interactive Card Preview */}
        <div className="profile-col-main">
          <div className="live-preview-box">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="eyebrow">PROFILE PREVIEW</span>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Draft changes appear here until saved</span>
            </div>

            <article className="profile-card" style={{ margin: 0 }}>
              <div className="profile-card-cover" style={{ height: 240 }}>
                {profile.media?.[0] && mediaUrls[profile.media[0].id] ? (
                  <img
                    src={mediaUrls[profile.media[0].id]}
                    alt={displayName}
                    onError={() => setMediaUrls((current) => ({ ...current, [profile.media[0].id]: "" }))}
                  />
                ) : (
                  <span className="profile-card-initial">{(displayName || "?").charAt(0).toUpperCase()}</span>
                )}
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">
                    {styles.map((s) => SOCIAL_STYLE_LABELS[s]).join(" · ") || "Low pressure"}
                  </span>
                  {verificationLabel ? (
                    <span className="social-style-tag" style={{ background: "rgba(16, 185, 129, 0.85)" }}>
                      {verificationLabel}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">{displayName || "Your Name"}</div>
                </div>

                <p className="profile-card-bio">
                  {bio.trim() || "Add a bio in the editor to share your favorite campus spots, studies, or what you enjoy talking about!"}
                </p>

                <div className="shared-interests-row">
                  {interests
                    .filter((i) => selected[i.id])
                    .slice(0, 6)
                    .map((i) => (
                      <span key={i.id} className="shared-chip highlight">
                        {i.name}
                      </span>
                    ))}
                  {Object.keys(selected).length === 0 && (
                    <span className="muted" style={{ fontSize: "0.82rem" }}>Select passions on the right to show them here</span>
                  )}
                </div>

                {activePrompt && answers[activePrompt.id] && (
                  <div className="prompt-quote-box">
                    <div className="prompt-question">✦ {activePrompt.prompt}</div>
                    <p className="prompt-answer">"{answers[activePrompt.id]}"</p>
                  </div>
                )}

                <div className="profile-card-footer">
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Preview only · save changes to publish your updated profile</span>
                </div>
              </div>
            </article>


          </div>
        </div>

        {/* Right Column: Identity, Passions, Prompts, Photos, Privacy, Devices */}
        <div className="profile-col-side">
          {/* Identity & Bio */}
          <section className="card" id="profile-details" tabIndex={-1}>
            <span className="eyebrow">IDENTITY & BIO</span>
            <h2>Personal Details</h2>
            <Field
              label="Display name"
              id="editDisplayName"
              value={displayName}
              setValue={(value) => { setDisplayName(value); clearFeedback(); }}
              maxLength={50}
            />
            <div className="field">
              <label htmlFor="editBio">Bio & Campus Vibe</label>
              <textarea
                id="editBio"
                value={bio}
                onChange={(e) => { setBio(e.target.value); clearFeedback(); }}
                maxLength={280}
                rows={3}
                placeholder="Share your major, hobbies, music taste, and low-pressure connection style..."
              />
              <p className="counter">{bio.length}/280</p>
            </div>
            <ChoiceSet
              title="Social Pace & Connection Style"
              values={styles}
              options={Object.keys(SOCIAL_STYLE_LABELS) as SocialStyle[]}
              onToggle={(style) => {
                setStyles(styles.includes(style) ? styles.filter((s) => s !== style) : [...styles, style]);
                clearFeedback();
              }}
            />
          </section>

          {/* Interests Selector */}
          <section className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">MATCHING PASSIONS</span>
                <h2>Your interests</h2>
                <p className="muted">{Object.keys(selected).length} selected</p>
              </div>
            </div>
            <CategorizedInterests
              interests={interests}
              selected={selected}
              onToggle={(id) => {
                if (selected[id] === undefined && selectedDraft.length >= 12) {
                  setError("Choose no more than 12 interests.");
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

          {/* Prompt Answers */}
          <section className="card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="eyebrow">CONVERSATION STARTERS</span>
                <h2>Prompt answers</h2>
                <p className="muted">Answer 1–3 prompts. Each answer needs at least 2 characters and can be up to 240 characters. Clear an answer before adding a fourth.</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {prompts.slice(0, 6).map((p) => (
                <div key={p.id} className="prompt-quote-box">
                  <div className="prompt-question">✦ {p.prompt}</div>
                  <textarea
                    id={`p-${p.id}`}
                    value={answers[p.id] ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      const existingAnswer = (answers[p.id] ?? "").trim();
                      if (!existingAnswer && value.trim() && answeredPromptCount >= 3) {
                        setError("You can answer up to 3 prompts. Clear an existing answer before adding another.");
                        setMessage(null);
                        return;
                      }
                      setAnswers((current) => ({ ...current, [p.id]: value }));
                      clearFeedback();
                    }}
                    disabled={busy || mediaBusy || (answeredPromptCount >= 3 && !(answers[p.id] ?? "").trim())}
                    maxLength={240}
                    rows={2}
                    placeholder="Write your answer..."
                    style={{ background: "transparent", border: "1px solid var(--line)" }}
                  />
                  <p className="counter">{(answers[p.id] ?? "").length}/240</p>
                </div>
              ))}
            </div>
          </section>

          {/* Media Photos */}
          <section className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">MEDIA</span>
                <h2>Profile Photos</h2>
                <p className="muted">Up to 6 photos. JPG, PNG or WebP; 5 MB max before cropping. Photo changes save immediately.</p>
              </div>
              {profile.media.some((media) => !mediaUrls[media.id]) ? (
                <button
                  type="button"
                  className="secondary compact"
                  onClick={() => void refreshMedia()}
                  disabled={refreshingMedia || mediaBusy || busy}
                >
                  {refreshingMedia ? "Refreshing photo links…" : "Retry loading photos"}
                </button>
              ) : null}
            </div>
            <div className="photo-upload-grid">
              {profile.media.map((m) => (
                <div className="photo-tile" key={m.id}>
                  {mediaUrls[m.id] ? (
                    <img
                      src={mediaUrls[m.id]}
                      alt={`Profile photo ${m.sortOrder + 1}`}
                      onError={() => setMediaUrls((current) => ({ ...current, [m.id]: "" }))}
                    />
                  ) : (
                    <span className="profile-card-initial">📷</span>
                  )}
                  <button
                    type="button"
                    className="photo-tile-delete"
                    onClick={() => void removeImage(m.id)}
                    disabled={busy || mediaBusy}
                    aria-label={`Remove profile photo ${m.sortOrder + 1}`}
                    title="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {profile.media.length < 6 && (
                <label className="photo-tile photo-tile-add">
                  <span style={{ fontSize: "1.5rem" }}>+</span>
                  <span>Add photo</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    aria-label="Choose a profile photo"
                    disabled={busy || mediaBusy || profile.media.length >= 6}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (file) void addImage(file);
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          {/* Privacy Settings */}
          <section className="card" id="privacy-settings" tabIndex={-1}>
            <span className="eyebrow">CONTROLS</span>
            <h2>Privacy & Reachability</h2>
            <p className="muted">Adjust who can find and message you on the platform. Save your changes when you are ready.</p>
            <PrivacyEditor
              privacy={privacy}
              setPrivacy={(value) => { setPrivacy(value); clearFeedback(); }}
            />
          </section>

          {/* Active Devices & Security */}
          <Devices sessions={sessions} revoke={revoke} />

          {/* Danger Zone: Account Deletion */}
          <section className="card" id="account-data" tabIndex={-1} style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
            <span className="eyebrow" style={{ color: "var(--danger)" }}>DATA PRIVACY & REMOVAL</span>
            <h2>Delete Account and Personal Data</h2>
            <p className="muted">
              Permanently anonymizes your account, removes your profile photos, prompt answers, interests, group memberships and ends all active sessions.
            </p>
            <button
              type="button"
              className="danger compact"
              onClick={async () => {
                if (!window.confirm("Are you sure you want to permanently delete your account and data? This cannot be undone.")) return;
                try {
                  await getSafetyClient().deleteAccount();
                  await getAuth().signOut();
                  window.location.reload();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Delete my account
            </button>
          </section>
        </div>
      </div>
    </div>
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
      title: "Campus & Ambition",
      names: ["Study Groups", "Accounting", "Finance", "Programming", "Artificial Intelligence", "Cybersecurity", "Debate", "Student Life", "Languages", "Business", "Investing", "Entrepreneurship"],
    },
    {
      title: "Music & Culture",
      names: ["Afrobeats", "Amapiano", "Hip Hop", "R&B", "Gospel", "Church / Faith Communities", "Volunteering"],
    },
    {
      title: "Sports & Fitness",
      names: ["Football", "Basketball", "Running", "Gym", "Tennis", "Fitness"],
    },
    {
      title: "Arts & Entertainment",
      names: ["Anime", "Manga", "Cosplay", "Photography", "Drawing", "Design", "Writing", "Movies", "Series", "Documentaries", "Books"],
    },
    {
      title: "Gaming & Lifestyle",
      names: ["Gaming", "FIFA / EA FC", "Call of Duty", "Minecraft", "Mobile Gaming", "Cooking", "Baking", "Trying Restaurants", "Cars", "Fashion", "Travel", "Road Trips", "Nature"],
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
            <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem" }}>{cat.title}</h4>
            <div className="interest-chips-wrap">
              {catInterests.map((i) => {
                const chosen = selected[i.id] !== undefined;
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={`interest-chip-btn ${chosen ? "selected" : ""}`}
                    onClick={() => onToggle(i.id)}
                  >
                    <span>{chosen ? "✓" : "+"}</span>
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
          <h4 style={{ margin: "0 0 8px", fontSize: "0.78rem" }}>Other Passions</h4>
          <div className="interest-chips-wrap">
            {interests
              .filter((i) => !matchedIds.has(i.id))
              .map((i) => {
                const chosen = selected[i.id] !== undefined;
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={`interest-chip-btn ${chosen ? "selected" : ""}`}
                    onClick={() => onToggle(i.id)}
                  >
                    <span>{chosen ? "✓" : "+"}</span>
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
    small_group: "👥",
    one_to_one: "💬",
    text_first: "✍️",
    voice_first: "🎙️",
    low_pressure: "🌿",
  };

  const STYLE_DESCRIPTIONS: Record<SocialStyle, string> = {
    small_group: "Hangouts with small friendly groups",
    one_to_one: "Direct, focused 1-on-1 conversations",
    text_first: "Chat via messages before meeting",
    voice_first: "Quick voice notes and calls",
    low_pressure: "Respond on your own time without rush",
  };

  return (
    <div style={{ marginTop: 20 }}>
      <label>{title}</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 8 }}>
        {options.map((option) => {
          const active = values.includes(option);
          return (
            <div
              key={option}
              onClick={() => onToggle(option)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                padding: "12px 14px",
                borderRadius: "var(--radius-md)",
                background: active ? "var(--accent-soft)" : "var(--surface-sunken)",
                border: active ? "1.5px solid var(--accent)" : "1px solid var(--line)",
                cursor: "pointer",
                transition: "all var(--dur-fast)",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>{STYLE_ICONS[option]}</span>
              <div>
                <span style={{ display: "block", fontWeight: 650, fontSize: "0.9rem", color: active ? "var(--accent)" : "var(--text)" }}>
                  {SOCIAL_STYLE_LABELS[option]}
                </span>
                <span style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)", marginTop: 2 }}>
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
  privacy: Profile["privacy"];
  setPrivacy: (value: Profile["privacy"]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="switch-row">
        <div className="switch-label-group">
          <span className="switch-title">Discoverable in Search & Feed</span>
          <span className="switch-desc">Allow compatible people to discover your profile and say hi.</span>
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
          onChange={(e) => setPrivacy({ ...privacy, messagePermission: e.target.value as typeof privacy.messagePermission })}
        >
          {PRIVACY_OPTIONS.messagePermission.map((v) => (
            <option key={v} value={v}>
              {v === "everyone" ? "Everyone (with suggested openers)" : v === "connections" ? "Mutual connections only" : "Nobody (read-only)"}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="field">
          <label htmlFor="storyVisibility">Stories & Moments</label>
          <select
            id="storyVisibility"
            value={privacy.storyVisibility}
            onChange={(e) => setPrivacy({ ...privacy, storyVisibility: e.target.value as typeof privacy.storyVisibility })}
          >
            {PRIVACY_OPTIONS.visibility.map((v) => (
              <option key={v} value={v}>
                {v === "public" ? "Everyone" : v === "connections" ? "Connections only" : "Private"}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="activityVisibility">Activity status</label>
          <select
            id="activityVisibility"
            value={privacy.activityVisibility}
            onChange={(e) => setPrivacy({ ...privacy, activityVisibility: e.target.value as typeof privacy.activityVisibility })}
          >
            {PRIVACY_OPTIONS.visibility.map((v) => (
              <option key={v} value={v}>
                {v === "public" ? "Everyone" : v === "connections" ? "Connections only" : "Private"}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function parseUserAgent(ua?: string): { name: string; browser: string; icon: string } {
  if (!ua) return { name: "Current Device", browser: "Web Browser", icon: "💻" };
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
  let browser = "Browser";
  if (/Edg/i.test(ua)) browser = "Microsoft Edge";
  else if (/Chrome/i.test(ua)) browser = "Google Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Apple Safari";
  else if (/Firefox/i.test(ua)) browser = "Mozilla Firefox";

  let os = "Desktop";
  if (/Windows/i.test(ua)) os = "Windows PC";
  else if (/Macintosh|Mac OS/i.test(ua)) os = "Mac";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android Phone";
  else if (/Linux/i.test(ua)) os = "Linux PC";

  return { name: os, browser, icon: isMobile ? "📱" : "💻" };
}

function Devices({ sessions, revoke }: { sessions: DeviceSession[]; revoke: (id: string) => void }) {
  return (
    <section className="card" id="account-sessions" tabIndex={-1} style={{ marginTop: 24 }}>
      <div className="card-header">
        <div>
          <span className="eyebrow">SECURITY</span>
          <h2>Active Devices</h2>
          <p className="muted">Manage where your account is signed in.</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sessions.map((s) => {
          const info = parseUserAgent(s.userAgent ?? undefined);
          return (
            <div className="device-card-item" key={s.id}>
              <div className="device-info">
                <div className="device-icon-box">{info.icon}</div>
                <div>
                  <div style={{ fontWeight: 650, fontSize: "0.92rem", color: "var(--text)" }}>
                    {info.name}
                    {s.current && (
                      <span style={{ marginLeft: 8, fontSize: "0.72rem", padding: "2px 8px", borderRadius: "999px", background: "var(--success-soft)", color: "var(--success)", fontWeight: 700 }}>
                        This device
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
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
