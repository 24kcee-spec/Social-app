"use client";

import { AuthClientError } from "@sp/auth-client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isConfigured()) return;
    const auth = getAuth();
    const off = auth.onAuthChange((event, signedIn) => {
      if (event === "PASSWORD_RECOVERY" || signedIn) setReady(true);
    });
    void auth.isSignedIn().then((signedIn) => signedIn && setReady(true));
    return off;
  }, []);

  const validation = useMemo(() => {
    if (password.length < 8) return "Use at least 8 characters.";
    if (new TextEncoder().encode(password).length > 72) return "Use at most 72 bytes for your password.";
    if (confirmPassword && password !== confirmPassword) return "The passwords do not match.";
    return null;
  }, [password, confirmPassword]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || password !== confirmPassword || busy) return;
    setBusy(true);
    setError(null);
    try {
      await getAuth().setNewPassword(password);
      setPassword("");
      setConfirmPassword("");
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
        <p className="ok" role="status" aria-live="polite">Your password has been successfully updated.</p>
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
        <p className="muted" role="status">
          Open this page from the link sent in your password recovery email. If the link has expired or is invalid, request a new one from the sign-in page.
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
        <p id="password-help" className="muted">Use 8–72 characters and enter the same password twice.</p>
      </header>

      <form onSubmit={submit} noValidate style={{ marginTop: 16 }} aria-busy={busy}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            maxLength={72}
            required
            disabled={busy}
            aria-invalid={Boolean(error) || Boolean(password && password.length < 8)}
            aria-describedby="password-help"
          />
        </div>

        <div className="field">
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            disabled={busy}
            aria-invalid={Boolean(confirmPassword && password !== confirmPassword)}
            aria-describedby="password-help"
          />
        </div>

        {validation && (password || confirmPassword) && (
          <div className="notice err" role="alert" style={{ marginTop: 12 }}>
            <span>{validation}</span>
          </div>
        )}

        {error && (
          <div className="notice err" role="alert" style={{ marginTop: 12 }}>
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="auth-submit-btn"
          disabled={busy || Boolean(validation) || !confirmPassword || password !== confirmPassword}
        >
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
