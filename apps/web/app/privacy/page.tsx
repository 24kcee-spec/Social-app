import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Sidle’s product is designed around discoverability, messaging and privacy boundaries.",
};

export default function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-editorial-shell">
      <section className="sidle-editorial-hero">
        <span className="eyebrow">PRIVACY BY PRODUCT DESIGN</span>
        <h1>Be social without giving up your boundaries.</h1>
        <p>
          Sidle is designed so discoverability, messaging and activity visibility are choices you can understand and change. The app should never imply that an academic-email check proves someone’s identity, and it should never expose precise live location by default.
        </p>
        <div className="sidle-editorial-actions">
          <a className="secondary" href="/settings/privacy">Open privacy controls</a>
          <a className="secondary" href="/help">Help & safety</a>
          <a className="link" href="/discover">Back to Sidle</a>
        </div>
      </section>

      <section className="sidle-editorial-section" aria-labelledby="privacy-principles">
        <h2 id="privacy-principles">Product principles</h2>
        <div className="sidle-principle-grid">
          <article className="sidle-principle-card"><strong>Discoverability is controllable</strong><p>Your profile’s appearance in discovery is governed by your saved privacy choices and server rules, not by a hidden public popularity setting.</p></article>
          <article className="sidle-principle-card"><strong>Messaging has boundaries</strong><p>Who can reach you is a separate choice from whether your profile is discoverable. Blocking is available when you need a stronger boundary.</p></article>
          <article className="sidle-principle-card"><strong>Location stays coarse</strong><p>Community plans use general areas or public venue names. Sidle’s product direction explicitly avoids default precise live-location exposure.</p></article>
          <article className="sidle-principle-card"><strong>Verification copy stays honest</strong><p>An academic email can confirm access to that email address. Sidle does not describe that alone as government-ID or in-person identity verification.</p></article>
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>What this page is — and is not</h2>
        <p>
          This is a plain-language product privacy overview so people can understand Sidle’s intended behavior. It is not a substitute for a formally published legal privacy notice. Before a broad public launch, Sidle still needs an approved legal/privacy owner, real support contact and jurisdiction-appropriate policy text.
        </p>
        <h3>Private browser conveniences</h3>
        <p>
          Features such as saved introductions and unsent message drafts may use browser storage on the device. Sidle labels those features so users know when something is device-local rather than synced to their account.
        </p>
        <h3>Offline behavior</h3>
        <p>
          Sidle’s service worker intentionally does not cache authenticated profile, account or message pages for private offline reading. When a navigation fails offline, the app shows a public offline fallback instead.
        </p>
      </section>
    </main>
  );
}
