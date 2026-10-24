"use client";

import { AuthClientError } from "@sp/auth-client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage, getAuth, isConfigured } from "../../lib/auth";

/** Opened from the reset email. Supabase puts a temporary session in the URL; we then let the user choose a new password. */
export default function ResetPassword() {
  return (
    <div className="auth-wrapper">
      <ResetForm />
    </div>
  );
}

function ResetForm() {
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
    setBusy(true);
    setError(null);
    try {
      await getAuth().setNewPassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthClientError && err.fieldErrors.password ? err.fieldErrors.password : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card-editorial">
        <div className="auth-brand-badge">SIDLE · LOW-PRESSURE CONNECTION</div>
        <h1>Password updated</h1>
        <p className="ok" role="status">Your password has been successfully updated.</p>
        <div style={{ marginTop: 24 }}>
          <Link href="/" className="auth-submit-btn" style={{ display: "inline-flex", textDecoration: "none" }}>
            Continue to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="auth-card-editorial">
        <div className="auth-brand-badge">SIDLE · LOW-PRESSURE CONNECTION</div>
        <h1>Reset your password</h1>
        <p className="muted">
          Open this page from the link sent in your password recovery email. If the link has expired or is invalid, please request a new one.
        </p>
        <div style={{ marginTop: 24 }}>
          <Link href="/" className="link">
            ← Return to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card-editorial">
      <header>
        <div className="auth-brand-badge">SIDLE · LOW-PRESSURE CONNECTION</div>
        <h1>Choose a new password</h1>
        <p className="muted">Create a strong, memorable password for your account.</p>
      </header>

      <form onSubmit={submit} noValidate style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            aria-invalid={Boolean(error)}
          />
        </div>

        {error && (
          <div className="notice err" role="alert" style={{ marginTop: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="auth-submit-btn" disabled={busy || password.length < 6}>
          {busy ? "Updating…" : "Update password"}
        </button>

        <div className="auth-footer-links">
          <Link href="/" className="link">
            ← Back to sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
