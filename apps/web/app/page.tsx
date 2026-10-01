"use client";

import { AuthClientError, type DeviceSession, type Me } from "@sp/auth-client";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, getAuth, isConfigured } from "../lib/auth";

type Mode = "signin" | "signup" | "forgot";
type Phase = { kind: "loading" } | { kind: "signedOut" } | { kind: "signedIn"; me: Me; sessions: DeviceSession[] } | { kind: "error"; message: string };

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
    if (!isConfigured()) return setPhase({ kind: "error", message: "Supabase is not configured. Fill SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the repo-root .env, then restart." });
    void load();
    return getAuth().onAuthChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void load();
    });
  }, [load]);

  if (phase.kind === "loading") return <p className="muted">Loading...</p>;
  if (phase.kind === "error")
    return (
      <div className="card">
        <p className="err" role="alert">{phase.message}</p>
        {isConfigured() && <button onClick={() => { setPhase({ kind: "loading" }); void load(); }}>Try again</button>}
      </div>
    );
  if (phase.kind === "signedOut") return <AuthForm />;
  return <Account me={phase.me} sessions={phase.sessions} reload={load} />;
}

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
    setBusy(true); setError(null); setFields({}); setNotice(null);
    try {
      const auth = getAuth();
      if (mode === "signin") await auth.signIn({ email, password });
      else if (mode === "signup") {
        const r = await auth.signUp({ email, password, displayName: displayName.trim() || undefined });
        if (r === "confirm_email") setNotice("Check your email and click the confirmation link, then sign in.");
      } else {
        await auth.requestPasswordReset(email, `${window.location.origin}/reset`);
        setNotice("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof AuthClientError) setFields(err.fieldErrors);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signin" ? "Sign in" : mode === "signup" ? "Create your account" : "Reset your password";
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1>{title}</h1>
      {mode === "signup" && (
        <>
          <label htmlFor="name">Display name (optional)</label>
          <input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
          {fields.displayName && <p className="err">{fields.displayName}</p>}
        </>
      )}
      <label htmlFor="email">Email</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      {fields.email && <p className="err">{fields.email}</p>}
      {mode !== "forgot" && (
        <>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} required />
          {fields.password && <p className="err">{fields.password}</p>}
        </>
      )}
      {error && <p className="err" role="alert">{error}</p>}
      {notice && <p className="ok" role="status">{notice}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait..." : mode === "forgot" ? "Send reset link" : title}</button>
      <div>
        {mode !== "signin" && <button type="button" className="link" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>Sign in</button>}
        {mode !== "signup" && <button type="button" className="link" onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>Create account</button>}
        {mode === "signin" && <button type="button" className="link" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>Forgot password?</button>}
      </div>
    </form>
  );
}

function Account({ me, sessions, reload }: { me: Me; sessions: DeviceSession[]; reload: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    try { await getAuth().revokeSession(id); await reload(); } catch (err) { setError(errorMessage(err)); }
  }
  async function signOut() {
    try { await getAuth().signOut(); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <div className="card">
      <h1>You are signed in</h1>
      <p>{me.email ?? me.phone}</p>
      <p className="muted">Account status: {me.status}</p>
      <h2 style={{ fontSize: "1rem", marginTop: "1.25rem" }}>Your devices</h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            <span>{(s.userAgent ?? "Unknown device").slice(0, 40)}{s.current ? " (this device)" : ""}</span>
            {!s.current && <button className="secondary" onClick={() => void revoke(s.id)}>Sign out</button>}
          </li>
        ))}
      </ul>
      {error && <p className="err" role="alert">{error}</p>}
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
