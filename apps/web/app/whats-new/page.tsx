import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'What’s new',
  description: 'Recent Sidle beta improvements and the product principles behind them.',
};

const entries = [
  {
    title: 'Your platform, expanded',
    body: 'Publish photos, reels, 24-hour stories and music you can legally share. Follow creators, react, comment and save posts. Your profile now opens as a real profile with separate editing and settings.',
  },
  {
    title: 'More ways to connect',
    body: 'Send attachments, voice notes and replies. Share precise location with selected connections for a limited time, invite connections to Plans, and export a calendar event. Calling, live broadcasts and payments display their actual provider setup status.',
  },
  {
    title: 'A calmer, more responsive Sidle',
    body: 'The web experience now uses a coordinated design system with stronger phone, tablet and desktop layouts, deliberate dark mode, reduced-motion support and clearer visual hierarchy.',
  },
  {
    title: 'Discover explains itself',
    body: 'Introductions can show positive matching context, be searched and filtered, saved privately to your account, or hidden with a short undo window. Discovery ranking continues to explain relevant shared context.',
  },
  {
    title: 'Plans are becoming first-class',
    body: 'Sidle’s existing community events already support time, general area, capacity, RSVP/waitlist, sharing and attendee chat. The product is evolving that foundation into intentional Plans instead of building a duplicate feature.',
  },
  {
    title: 'Operator tools are becoming real',
    body: 'Admins have a protected product-health and moderation view backed by the existing activation and report APIs. External staffing, policy ownership and service-provider gates are still tracked separately from code readiness.',
  },
];

export default function WhatsNewPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-editorial-shell">
      <section className="sidle-editorial-hero">
        <span className="eyebrow">SIDLE BETA · WHAT’S NEW</span>
        <h1>Better connection, less noise.</h1>
        <p>
          Meaningful product changes should be easy to understand without turning release notes into
          another notification stream.
        </p>
        <div className="sidle-editorial-actions">
          <a className="secondary" href="/discover">
            Open Sidle
          </a>
          <a className="secondary" href="/community-guidelines">
            Community guidance
          </a>
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>Current beta improvements</h2>
        <div className="sidle-principle-grid">
          {entries.map((entry) => (
            <article className="sidle-principle-card" key={entry.title}>
              <strong>{entry.title}</strong>
              <p>{entry.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sidle-editorial-section">
        <h2>Control how you use Sidle</h2>
        <p>
          Low-pressure introductions are an optional preference in Settings. Feed, media and creator
          tools are part of the app. Each post has an explicit audience; calls and location require
          your permission. Provider-dependent features enable only after configuration.
        </p>
      </section>
    </main>
  );
}
