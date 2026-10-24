import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="auth-wrapper">
      <section className="auth-card-editorial" aria-labelledby="not-found-title">
        <div className="auth-brand-badge">SIDLE · NOT FOUND</div>
        <h1 id="not-found-title">That page is not here</h1>
        <p className="muted">The link may be old, incomplete or no longer available. Use a known Sidle destination instead.</p>
        <div className="card-actions" style={{ marginTop: 22 }}>
          <Link href="/discover">Go to Discover</Link>
          <Link className="secondary" href="/settings">Open Settings</Link>
        </div>
      </section>
    </main>
  );
}
