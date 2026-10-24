import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-offline-page">
      <section className="sidle-offline-card">
        <img className="sidle-mark sidle-mark-empty" src="/brand/sidle-mark.svg" alt="" aria-hidden="true" />
        <span className="eyebrow">SIDLE · OFFLINE</span>
        <h1>Your connection took a sidetrack</h1>
        <p className="muted" style={{ margin: "12px auto 20px", maxWidth: 500 }}>
          Sidle does not cache private profile, message or account pages for offline reading. Reconnect, then retry the screen you were opening.
        </p>
        <a className="secondary" href="/discover">Try Sidle again</a>
      </section>
    </main>
  );
}
