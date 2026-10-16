"use client";

import type { Interest, Profile, PromptDefinition, SocialStyle } from "@sp/types";
import type { OnboardingInput } from "@sp/validation";
import { AuthClientError, type DeviceSession, type Me } from "@sp/auth-client";
import { type ProfileClient, parseShareUrl, validateSafeRedirect } from "@sp/profile-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage, getAuth, isConfigured } from "../lib/auth";
import { Connections } from "./connections";
import { Discover } from "./discover";
import { Community } from "./community";
import { Messages } from "./messages";
import { getMessagingClient } from "../lib/messaging";
import { getSafetyClient } from "../lib/safety";
import { deleteProfileImage, getProfileClient, getSignedMediaUrl, uploadProfileImage } from "../lib/profile";

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
      const [me, sessions] = await Promise.all([auth.fetchMe(), auth.listSessions()]);
      setPhase({ kind: "signedIn", me, sessions });
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
          <div className="brand-mark" style={{ margin: "0 auto 16px" }}>✦</div>
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
          <div className="auth-brand-badge">Configuration Notice</div>
          <h2>Supabase configuration required</h2>
          <p className="muted">
            To connect to your live database, add your credentials to <code>.env</code>:
          </p>
          <pre className="notice" style={{ background: "var(--surface-sunken)", fontSize: "0.82rem", overflowX: "auto" }}>
            SUPABASE_URL=...{"\n"}SUPABASE_PUBLISHABLE_KEY=...
          </pre>
          <button className="auth-submit-btn secondary" onClick={() => setPhase({ kind: "signedOut" })}>
            View Auth & Entry Screens →
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
          <div className="auth-brand-badge">✦ Social Connection</div>
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
}: {
  label: string;
  id: string;
  value: string;
  setValue: (value: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
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
  const [tab, setTab] = useState<"discover" | "connections" | "messages" | "community" | "profile">("discover");
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
      if (parsed.targetType === "group" || parsed.targetType === "event") {
        setTab("community");
      } else if (parsed.targetType === "profile") {
        setTab("discover");
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  async function signOut() {
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
          <div className="brand-group" onClick={() => setTab("discover")}>
            <div className="brand-mark-glow" aria-hidden="true">✦</div>
            <div className="brand-text-wrap">
              <span className="brand-title">Social</span>
              <span className="brand-tagline">Low-pressure connection</span>
            </div>
          </div>

          {profile?.onboardingCompleted && (
            <nav className="nav-pill-bar" aria-label="Main Navigation">
              <button
                role="tab"
                aria-selected={tab === "discover"}
                className={`nav-pill-btn ${tab === "discover" ? "active" : ""}`}
                onClick={() => setTab("discover")}
              >
                <span>🧭</span>
                <span>Discover</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "connections"}
                className={`nav-pill-btn ${tab === "connections" ? "active" : ""}`}
                onClick={() => setTab("connections")}
              >
                <span>🤝</span>
                <span>Connections</span>
                {pendingIn > 0 && <span className="nav-badge">{pendingIn}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === "messages"}
                className={`nav-pill-btn ${tab === "messages" ? "active" : ""}`}
                onClick={() => setTab("messages")}
              >
                <span>💬</span>
                <span>Messages</span>
                {unread > 0 && <span className="nav-badge">{unread}</span>}
              </button>
              <button
                role="tab"
                aria-selected={tab === "community"}
                className={`nav-pill-btn ${tab === "community" ? "active" : ""}`}
                onClick={() => setTab("community")}
              >
                <span>🎈</span>
                <span>Community</span>
              </button>
              <button
                role="tab"
                aria-selected={tab === "profile"}
                className={`nav-pill-btn ${tab === "profile" ? "active" : ""}`}
                onClick={() => setTab("profile")}
              >
                <span>👤</span>
                <span>Profile</span>
              </button>
            </nav>
          )}

          <div className="user-bar">
            <div className="user-badge-chip">
              <div className="user-avatar-circle">
                {profile?.media?.[0]?.thumbnailPath ? (
                  <img src="/images/avatar_kuda.jpg" alt="Profile" />
                ) : (
                  <span>{profile?.displayName?.charAt(0).toUpperCase() ?? "U"}</span>
                )}
              </div>
              <div className="user-chip-text">
                <span className="user-chip-name">{profile?.displayName ?? "Member"}</span>
                <span className="user-chip-campus">
                  {me.email?.includes("@students.nust.ac.zw") ? "NUST Student" : me.email ? me.email.split("@")[0] : "Verified"}
                </span>
              </div>
            </div>
            <button className="secondary compact" onClick={() => void signOut()}>
              Sign out
            </button>
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
        ) : profile ? (
          tab === "discover" ? (
            <Discover />
          ) : tab === "connections" ? (
            <Connections
              onCount={setPendingIn}
              onMessage={(userId) => {
                setChatWith(userId);
                setTab("messages");
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
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onSaved: (profile: Profile) => void;
  sessions: DeviceSession[];
  revoke: (id: string) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState(profile.socialStyles);
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [moodStatus, setMoodStatus] = useState("🌿 Low-pressure hangout");
  const [selected, setSelected] = useState<Record<string, 1 | 2 | 3>>(
    Object.fromEntries(profile.interests.map((i) => [i.id, (i.strength ?? 2) as 1 | 2 | 3]))
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(profile.prompts.map((p) => [p.promptId, p.answer]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  const refreshMedia = useCallback(async () => {
    const pairs = await Promise.all(
      profile.media.map(async (m) => [m.id, await getSignedMediaUrl(m.thumbnailPath)] as const)
    );
    setMediaUrls(Object.fromEntries(pairs));
  }, [profile.media]);

  useEffect(() => {
    void refreshMedia().catch(() => undefined);
  }, [refreshMedia]);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let next = await client.updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        socialStyles: styles,
        privacy,
      });
      next = await client.updateInterests({
        interests: Object.entries(selected).map(([interestId, strength]) => ({ interestId, strength })),
      });
      const chosenAnswers = Object.entries(answers)
        .filter(([, answer]) => answer.trim())
        .slice(0, 6)
        .map(([promptId, answer]) => ({ promptId, answer: answer.trim() }));
      next = await client.updatePrompts({ answers: chosenAnswers });
      onSaved(next);
      setMessage("Profile saved successfully.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addImage(file: File) {
    setError(null);
    setMessage(null);
    try {
      const media = await uploadProfileImage(file, profile.media);
      onSaved({ ...profile, media: [...profile.media, media] });
      setMessage("Photo uploaded.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function removeImage(id: string) {
    const media = profile.media.find((m) => m.id === id);
    if (!media) return;
    setError(null);
    try {
      await deleteProfileImage(media);
      onSaved({ ...profile, media: profile.media.filter((m) => m.id !== id) });
      setMessage("Photo removed.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const activePrompt = prompts.find((p) => (answers[p.id] ?? "").trim().length > 0);

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
                  <img src={mediaUrls[profile.media[0].id]} alt={profile.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <img src="/images/avatar_kuda.jpg" alt={profile.displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
            </div>
            <div>
              <span className="eyebrow">PROFILE STUDIO</span>
              <h1 style={{ fontSize: "1.75rem", margin: "2px 0 6px" }}>{profile.displayName || "Your Space"}</h1>
              <p className="muted" style={{ margin: 0 }}>
                {Object.keys(selected).length} passions · {styles.length} social paces · Campus Discoverable
              </p>
            </div>
          </div>
          <button onClick={() => void save()} disabled={busy || styles.length < 1}>
            {busy ? "Saving changes…" : "Save all changes"}
          </button>
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
      </div>

      <div className="profile-dashboard-grid">
        {/* Left Column: Live Interactive Card Preview */}
        <div className="profile-col-main">
          <div className="live-preview-box">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="eyebrow">LIVE CAMPUS PREVIEW</span>
              <span className="muted" style={{ fontSize: "0.78rem" }}>Real-time student card</span>
            </div>

            <article className="profile-card" style={{ margin: 0 }}>
              <div className="profile-card-cover" style={{ height: 240 }}>
                {profile.media?.[0] && mediaUrls[profile.media[0].id] ? (
                  <img src={mediaUrls[profile.media[0].id]} alt={displayName} />
                ) : (
                  <img src="/images/avatar_kuda.jpg" alt={displayName} />
                )}
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">
                    {styles.map((s) => SOCIAL_STYLE_LABELS[s]).join(" · ") || "Low pressure"}
                  </span>
                  <span className="social-style-tag" style={{ background: "rgba(16, 185, 129, 0.85)" }}>
                    Verified Student
                  </span>
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">{displayName || "Your Name"}</div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>NUST · Bulawayo</span>
                </div>

                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", fontSize: "0.78rem", fontWeight: 700, marginBottom: 12 }}>
                  <span>{moodStatus}</span>
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
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Active now</span>
                  <button className="compact secondary" type="button">
                    Say hi 👋
                  </button>
                </div>
              </div>
            </article>

            {/* Quick Mood Bar */}
            <div className="card" style={{ marginTop: 20, padding: 18 }}>
              <span className="eyebrow">QUICK VIBE STATUS</span>
              <p className="muted" style={{ fontSize: "0.82rem", margin: "2px 0 10px" }}>
                Let classmates know what you are currently up for:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  "🌿 Low-pressure hangout",
                  "🎧 In the zone / Music",
                  "💻 Late-night code",
                  "☕ Coffee & Library",
                  "⚽ Game night & Sports",
                  "🎨 Creative flow",
                ].map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    className={`compact ${moodStatus === mood ? "" : "secondary"}`}
                    onClick={() => setMoodStatus(mood)}
                    style={{ fontSize: "0.78rem" }}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Identity, Passions, Prompts, Photos, Privacy, Devices */}
        <div className="profile-col-side">
          {/* Identity & Bio */}
          <section className="card">
            <span className="eyebrow">IDENTITY & BIO</span>
            <h2>Personal Details</h2>
            <Field label="Display name" id="editDisplayName" value={displayName} setValue={setDisplayName} />
            <div className="field">
              <label htmlFor="editBio">Bio & Campus Vibe</label>
              <textarea
                id="editBio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
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
              onToggle={(style) =>
                setStyles(styles.includes(style) ? styles.filter((s) => s !== style) : [...styles, style])
              }
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
              onToggle={(id) =>
                setSelected((s) => {
                  const next = { ...s };
                  if (s[id] !== undefined) delete next[id];
                  else next[id] = 2;
                  return next;
                })
              }
            />
          </section>

          {/* Prompt Answers */}
          <section className="card">
            <div className="card-header">
              <div className="card-title-group">
                <span className="eyebrow">CONVERSATION STARTERS</span>
                <h2>Prompt answers</h2>
                <p className="muted">These prompt answers help other members break the ice with genuine depth.</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {prompts.slice(0, 6).map((p) => (
                <div key={p.id} className="prompt-quote-box">
                  <div className="prompt-question">✦ {p.prompt}</div>
                  <textarea
                    id={`p-${p.id}`}
                    value={answers[p.id] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
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
                <p className="muted">Up to 6 photos. Square crop.</p>
              </div>
            </div>
            <div className="photo-upload-grid">
              {profile.media.map((m) => (
                <div className="photo-tile" key={m.id}>
                  {mediaUrls[m.id] ? (
                    <img src={mediaUrls[m.id]} alt="Profile photo" />
                  ) : (
                    <img src="/images/avatar_kuda.jpg" alt="Profile photo" />
                  )}
                  <button className="photo-tile-delete" onClick={() => void removeImage(m.id)} title="Remove photo">
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
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void addImage(f);
                    }}
                  />
                </label>
              )}
            </div>
          </section>

          {/* Privacy Settings */}
          <section className="card">
            <span className="eyebrow">CONTROLS</span>
            <h2>Privacy & Reachability</h2>
            <p className="muted">Adjust who can find and message you on the platform.</p>
            <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />
          </section>

          {/* Active Devices & Security */}
          <Devices sessions={sessions} revoke={revoke} />

          {/* Danger Zone: Account Deletion */}
          <section className="card" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
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
          <span className="switch-desc">Allow compatible students to discover your profile and say hi.</span>
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
    <section className="card" style={{ marginTop: 24 }}>
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
