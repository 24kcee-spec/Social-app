"use client";

import { AuthClientError } from "@sp/auth-client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage, getAuth, isConfigured } from "../../lib/auth";

/** Opened from the reset email. Supabase puts a temporary session in the URL; we then let the user choose a new password. */
export default function ResetPassword() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isConfigured()) return;
    const auth = getAuth();
    const off = auth.onAuthChange((event, signedIn) => {
      if (event === "PASSWORD_RECOVERY" || signedIn) setReady(true);
    });
    void auth.isSignedIn().then((s) => s && setReady(true));
    return off;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await getAuth().setNewPassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthClientError && err.fieldErrors.password ? err.fieldErrors.password : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="card">
        <h1>Password updated</h1>
        <p className="ok">You can now use your new password.</p>
        <Link href="/">Continue</Link>
      </div>
    );
  if (!ready)
    return (
      <div className="card">
        <h1>Reset your password</h1>
        <p className="muted">Open this page from the link in your reset email. If the link has expired, request a new one.</p>
        <Link href="/">Back to sign in</Link>
      </div>
    );
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h1>Choose a new password</h1>
      <label htmlFor="password">New password</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
      {error && <p className="err" role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Please wait..." : "Update password"}</button>
    </form>
  );
}
