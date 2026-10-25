import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How Sidle’s product is designed around discoverability, messaging and privacy boundaries.',
};

export default function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-editorial-shell">
      <section className="sidle-editorial-hero">
        <span className="eyebrow">PRIVACY BY PRODUCT DESIGN</span>
        <h1>Be social without giving up your boundaries.</h1>
        <p>
          Sidle is designed so discoverability, messaging and activity visibility are choices you
          can understand and change. The app should never imply that an academic-email check proves
          someone’s identity, and it should never expose precise live location by default.
        </p>
        <div className="sidle-editorial-actions">
          <a className="secondary" href="/settings/privacy">
            Open privacy controls
          </a>
          <a className="secondary" href="/help">
            Help & safety
          </a>
          <a className="link" href="/discover">
            Back to Sidle
          </a>
        </div>
      </section>

      <section className="sidle-editorial-section" aria-labelledby="privacy-principles">
        <h2 id="privacy-principles">Product principles</h2>
        <div className="sidle-principle-grid">
          <article className="sidle-principle-card">
            <strong>Discoverability is controllable</strong>
            <p>
              Your profile’s appearance in discovery is governed by your saved privacy choices and
              server rules, not by a hidden public popularity setting.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Messaging has boundaries</strong>
            <p>
              Who can reach you is a separate choice from whether your profile is discoverable.
              Blocking is available when you need a stronger boundary.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Location sharing is explicit</strong>
            <p>
              Plans use named venues or general areas. Live location requires browser permission,
              selected current connections and a 15–60 minute expiry. You can stop sharing at any
              time. A map link sends coordinates to that map provider only when you choose to open
              it.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Verification copy stays honest</strong>
            <p>
              An academic email can confirm access to that email address. Sidle does not describe
              that alone as government-ID or in-person identity verification.
            </p>
          </article>
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>What this page is — and is not</h2>
        <p>
          This is a plain-language product privacy overview so people can understand Sidle’s
          intended behavior. It is not a substitute for a formally published legal privacy notice.
          Before a broad public launch, Sidle still needs an approved legal/privacy owner, real
          support contact and jurisdiction-appropriate policy text.
        </p>
        <h3>Private browser conveniences</h3>
        <p>
          Saved introductions, private connection labels, post bookmarks and preferences sync to
          your account. Unsent message drafts stay in session storage on the device. Private uploads
          use short-lived signed URLs; a person who already received a URL may retain access for its
          remaining lifetime or keep a downloaded copy. Story visibility expires at 24 hours; the
          cleanup worker removes story-only media after a further 24 hours.
        </p>
        <h3>Media, payments and calls</h3>
        <p>
          Public posts are visible to signed-in members. Music uploads require your rights
          confirmation; Sidle does not provide a licensed commercial catalogue. WebRTC calls and
          optional live broadcasts use configured relay/streaming providers. Payments use hosted
          Stripe Checkout and require separate merchant configuration. Advertising uses approved
          campaigns and unique daily clicks, without precise-location or message-based targeting.
          Optional account-linked product counters require consent and retain only bounded event
          names and counts.
        </p>
        <h3>Offline behavior</h3>
        <p>
          Sidle’s service worker intentionally does not cache authenticated profile, account or
          message pages for private offline reading. When a navigation fails offline, the app shows
          a public offline fallback instead.
        </p>
      </section>
    </main>
  );
}
