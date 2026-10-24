"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep detailed diagnostics in the browser console without exposing stack data in the UI.
    console.error("Sidle page error", error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="auth-wrapper">
      <section className="auth-card-editorial" aria-labelledby="page-error-title">
        <div className="auth-brand-badge">SIDLE · RECOVERY</div>
        <h1 id="page-error-title">Something went wrong on this screen</h1>
        <p className="muted">
          Your account has not been signed out. Try this screen again first; if the problem continues, return to Sidle and retry the action from there.
        </p>
        <div className="card-actions" style={{ marginTop: 22 }}>
          <button type="button" onClick={reset}>Try this screen again</button>
          <a className="secondary" href="/discover">Return to Discover</a>
        </div>
      </section>
    </main>
  );
}
