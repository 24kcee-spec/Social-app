import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community guidelines',
  description:
    'Sidle’s plain-language expectations for respectful, low-pressure social connection.',
};

export default function CommunityGuidelinesPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-editorial-shell">
      <section className="sidle-editorial-hero">
        <span className="eyebrow">COMMUNITY GUIDANCE</span>
        <h1>Make it easier for people to feel comfortable saying hello.</h1>
        <p>
          Sidle supports posts, media, introductions, conversations and plans. Respecting another
          person’s boundaries matters more than getting a reply, a connection or an invitation.
        </p>
        <div className="sidle-editorial-actions">
          <a className="secondary" href="/help">
            Help & safety
          </a>
          <a className="secondary" href="/settings/privacy">
            Privacy controls
          </a>
          <a className="link" href="/discover">
            Back to Sidle
          </a>
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>How to use Sidle well</h2>
        <div className="sidle-principle-grid">
          <article className="sidle-principle-card">
            <strong>Respect a no — including silence</strong>
            <p>
              Do not repeatedly contact someone who has not responded, declined, blocked you or
              otherwise shown they do not want contact.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Keep plans appropriate and public-minded</strong>
            <p>
              Use broad public or campus locations where possible. Do not pressure people to share
              private addresses or exact live location.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Do not harass, threaten or impersonate</strong>
            <p>
              Targeted abuse, hateful conduct, intimidation, spam and pretending to be another
              person undermine the community and can be reported.
            </p>
          </article>
          <article className="sidle-principle-card">
            <strong>Report rather than retaliate</strong>
            <p>
              Profile, community and message reporting exists so moderators can review problems.
              Blocking provides an immediate personal boundary.
            </p>
          </article>
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>Moderation transparency</h2>
        <p>
          Sidle has code-level reporting, blocking and an admin-only moderation queue. Those tools
          do not replace real operational coverage. Before a larger pilot or public launch, the
          project still needs named moderation responsibility, response expectations and an approved
          escalation process.
        </p>
        <h3>Creative rights and advertising</h3>
        <p>
          Upload only media you created or are allowed to share, including music in videos. Include
          required attribution. Copyright complaints can be reported on posts. Sponsored campaigns
          must identify their destination honestly, avoid scams and obtain administrator approval
          before delivery.
        </p>
        <h3>Academic-email confirmation</h3>
        <p>
          An academic-email badge means the relevant email flow was confirmed. It should not be
          treated as proof that a person is safe, trustworthy in every context or independently
          identity-verified.
        </p>
        <h3>Emergency situations</h3>
        <p>
          Sidle does not currently publish an emergency-response service inside the product. The app
          must not invent local emergency contacts or imply that in-app reports are monitored
          continuously when that operational coverage has not been established.
        </p>
      </section>
    </main>
  );
}
