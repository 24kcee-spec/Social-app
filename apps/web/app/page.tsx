"use client";

import type { Interest, Profile, PromptDefinition, SocialStyle } from "@sp/types";
import type { OnboardingInput } from "@sp/validation";
import { AuthClientError, type DeviceSession, type Me } from "@sp/auth-client";
import { type ProfileClient } from "@sp/profile-client";
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
          <div className="brand-group">
            <div className="brand-mark" aria-hidden="true">✦</div>
            <div className="brand-text-wrap">
              <span className="brand-title">Social</span>
              <span className="brand-tagline">Low-pressure connection</span>
            </div>
          </div>

          <div className="user-status-pill">
            <div className="user-meta">
              <div className="user-meta-name">{profile?.displayName ?? "Member"}</div>
              <div className="user-meta-email">{me.email ?? me.phone}</div>
            </div>
            <button className="secondary compact" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Primary Navigation Tabs */}
      {profile?.onboardingCompleted && (
        <nav className="nav-bar" aria-label="Main Navigation">
          <div className="nav-bar-inner" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "discover"}
              className={`nav-tab-btn ${tab === "discover" ? "active" : ""}`}
              onClick={() => setTab("discover")}
            >
              Discover
            </button>
            <button
              role="tab"
              aria-selected={tab === "connections"}
              className={`nav-tab-btn ${tab === "connections" ? "active" : ""}`}
              onClick={() => setTab("connections")}
            >
              Connections
              {pendingIn > 0 && <span className="nav-badge">{pendingIn}</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "messages"}
              className={`nav-tab-btn ${tab === "messages" ? "active" : ""}`}
              onClick={() => setTab("messages")}
            >
              Messages
              {unread > 0 && <span className="nav-badge">{unread}</span>}
            </button>
            <button
              role="tab"
              aria-selected={tab === "community"}
              className={`nav-tab-btn ${tab === "community" ? "active" : ""}`}
              onClick={() => setTab("community")}
            >
              Community
            </button>
            <button
              role="tab"
              aria-selected={tab === "profile"}
              className={`nav-tab-btn ${tab === "profile" ? "active" : ""}`}
              onClick={() => setTab("profile")}
            >
              Your profile
            </button>
          </div>
        </nav>
      )}

      {/* Main Content Area */}
      <main id="main" tabIndex={-1} className={profile?.onboardingCompleted ? "wide" : ""}>
        {error && (
          <div className="notice err" role="alert">
            <span>{error}</span>
            <button className="link" onClick={() => void loadProfile()}>Retry</button>
          </div>
        )}

        {loading ? (
          <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <p className="muted">Loading your profile…</p>
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
            />
          )
        ) : null}

        {profile?.onboardingCompleted && (
          <>
            <Devices sessions={sessions} revoke={revoke} />
            <p className="footer-note">
              You choose whether you are discoverable in Your profile → Privacy. Blocked people never see you and you never see them.
            </p>
          </>
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
}: {
  profile: Profile;
  interests: Interest[];
  prompts: PromptDefinition[];
  client: ProfileClient;
  onSaved: (profile: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio);
  const [styles, setStyles] = useState(profile.socialStyles);
  const [privacy, setPrivacy] = useState(profile.privacy);
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
        .slice(0, 3)
        .map(([promptId, answer]) => ({ promptId, answer: answer.trim() }));
      next = await client.updatePrompts({ answers: chosenAnswers });
      onSaved(next);
      setMessage("Profile saved.");
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
      setMessage("Photo added.");
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

  return (
    <div className="grid">
      <section className="card">
        <div className="eyebrow">PROFILE</div>
        <h2>Your profile</h2>
        <Field label="Display name" id="editDisplayName" value={displayName} setValue={setDisplayName} />
        <div className="field">
          <label htmlFor="editBio">Bio</label>
          <textarea id="editBio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={4} />
          <p className="counter">{bio.length}/280</p>
        </div>
        <ChoiceSet
          title="Social style"
          values={styles}
          options={Object.keys(SOCIAL_STYLE_LABELS) as SocialStyle[]}
          onToggle={(style) =>
            setStyles(styles.includes(style) ? styles.filter((s) => s !== style) : [...styles, style])
          }
        />
        <button onClick={() => void save()} disabled={busy || styles.length < 1}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </section>

      <section className="card">
        <div className="eyebrow">INTERESTS</div>
        <h2>Your interests</h2>
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
        <p className="muted">{Object.keys(selected).length} selected</p>
      </section>

      <section className="card">
        <div className="eyebrow">PROMPTS</div>
        <h2>Prompt answers</h2>
        <div className="prompt-list">
          {prompts.slice(0, 6).map((p) => (
            <div className="prompt-row" key={p.id}>
              <label htmlFor={`p-${p.id}`}>{p.prompt}</label>
              <textarea
                id={`p-${p.id}`}
                value={answers[p.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                maxLength={240}
                rows={2}
              />
            </div>
          ))}
        </div>
        <button onClick={() => void save()} disabled={busy}>
          Save prompts
        </button>
      </section>

      <section className="card">
        <div className="eyebrow">MEDIA</div>
        <h2>Profile photos</h2>
        <p className="muted">Up to 6 images, max 5 MB each. Images are cropped square before upload.</p>
        <div className="media-grid">
          {profile.media.map((m) => (
            <div className="media-card" key={m.id}>
              {mediaUrls[m.id] ? (
                <img src={mediaUrls[m.id]} alt="Your profile" />
              ) : (
                <div className="media-placeholder">Loading…</div>
              )}
              <button className="secondary" onClick={() => void removeImage(m.id)}>
                Remove
              </button>
            </div>
          ))}
          <label className="upload-tile">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void addImage(file);
                e.currentTarget.value = "";
              }}
              disabled={profile.media.length >= 6}
            />
            <span>＋ Add photo</span>
          </label>
        </div>
      </section>

      <section className="card">
        <div className="eyebrow">PRIVACY</div>
        <h2>Who can reach you?</h2>
        <PrivacyEditor privacy={privacy} setPrivacy={setPrivacy} />
        <button onClick={() => void save()} disabled={busy}>
          Save privacy
        </button>
      </section>

      <section className="card" style={{ border: "1px solid var(--danger)" }}>
        <div className="eyebrow" style={{ color: "var(--danger)" }}>PRIVACY & DATA DELETION</div>
        <h2>Delete account and personal data</h2>
        <p className="muted">
          Permanently anonymizes your account, removes your profile photos, prompt answers, interests, group memberships and ends all sessions.
        </p>
        <button
          type="button"
          className="secondary compact"
          style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
          onClick={async () => {
            if (!window.confirm("Are you sure you want to permanently delete your account and data?")) return;
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

      <section className="card preview">
        <div className="eyebrow">PREVIEW</div>
        <h2>{displayName || "Your display name"}</h2>
        <p>{bio || "Add a short bio so people can understand you."}</p>
        <div className="tag-row">
          {Object.keys(selected).slice(0, 8).map((id) => {
            const i = interests.find((x) => x.id === id);
            return i ? <span className="tag" key={id}>{i.name}</span> : null;
          })}
        </div>
        {Object.entries(answers)
          .filter(([, a]) => a.trim())
          .slice(0, 3)
          .map(([id, answer]) => {
            const p = prompts.find((x) => x.id === id);
            return p ? (
              <div className="preview-prompt" key={id}>
                <strong>{p.prompt}</strong>
                <p>{answer}</p>
              </div>
            ) : null;
          })}
      </section>

      {message && <div className="notice ok" role="status"><span>{message}</span></div>}
      {error && <div className="notice err" role="alert"><span>{error}</span></div>}
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
  values: string[];
  options: SocialStyle[];
  onToggle: (value: SocialStyle) => void;
}) {
  return (
    <div className="choice-set">
      <h3>{title}</h3>
      <div className="choice-grid">
        {options.map((option) => (
          <label key={option} className="check">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onToggle(option)}
            />
            <span>{SOCIAL_STYLE_LABELS[option]}</span>
          </label>
        ))}
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
    <div className="privacy-grid">
      <label className="check">
        <input
          type="checkbox"
          checked={privacy.discoverable}
          onChange={(e) => setPrivacy({ ...privacy, discoverable: e.target.checked })}
        />
        <span>Allow my profile to be discoverable</span>
      </label>
      <div className="field">
        <label htmlFor="messagePermission">Who can message me?</label>
        <select
          id="messagePermission"
          value={privacy.messagePermission}
          onChange={(e) => setPrivacy({ ...privacy, messagePermission: e.target.value as typeof privacy.messagePermission })}
        >
          {PRIVACY_OPTIONS.messagePermission.map((v) => (
            <option key={v} value={v}>
              {v === "everyone" ? "Everyone" : v === "connections" ? "Connections only" : "Nobody"}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="storyVisibility">Story visibility</label>
        <select
          id="storyVisibility"
          value={privacy.storyVisibility}
          onChange={(e) => setPrivacy({ ...privacy, storyVisibility: e.target.value as typeof privacy.storyVisibility })}
        >
          {PRIVACY_OPTIONS.visibility.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="activityVisibility">Activity visibility</label>
        <select
          id="activityVisibility"
          value={privacy.activityVisibility}
          onChange={(e) => setPrivacy({ ...privacy, activityVisibility: e.target.value as typeof privacy.activityVisibility })}
        >
          {PRIVACY_OPTIONS.visibility.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Devices({ sessions, revoke }: { sessions: DeviceSession[]; revoke: (id: string) => void }) {
  return (
    <section className="card device-card" style={{ marginTop: 24 }}>
      <div className="eyebrow">SESSIONS</div>
      <h2>Your devices</h2>
      <p className="muted">You can sign out another device without ending this session.</p>
      <ul className="device-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <span>
              {(s.userAgent ?? "Unknown device").slice(0, 70)}
              {s.current ? " · this device" : ""}
            </span>
            {!s.current && (
              <button className="secondary compact" onClick={() => revoke(s.id)}>
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
