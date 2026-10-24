import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What’s new",
  description: "Recent Sidle beta improvements and the product principles behind them.",
};

const entries = [
  {
    title: "A calmer, more responsive Sidle",
    body: "The web experience now uses a coordinated design system with stronger phone, tablet and desktop layouts, deliberate dark mode, reduced-motion support and clearer visual hierarchy.",
  },
  {
    title: "Discover explains itself",
    body: "Introductions can show positive matching context, be searched and filtered, saved privately on the current browser, or hidden with a short undo window. Public popularity scores remain out of the product direction.",
  },
  {
    title: "Plans are becoming first-class",
    body: "Sidle’s existing community events already support time, general area, capacity, RSVP/waitlist, sharing and attendee chat. The product is evolving that foundation into intentional Plans instead of building a duplicate feature.",
  },
  {
    title: "Operator tools are becoming real",
    body: "Admins have a protected product-health and moderation view backed by the existing activation and report APIs. External staffing, policy ownership and service-provider gates are still tracked separately from code readiness.",
  },
];

export default function WhatsNewPage() {
  return (
    <main id="main" tabIndex={-1} className="sidle-editorial-shell">
      <section className="sidle-editorial-hero">
        <span className="eyebrow">SIDLE BETA · WHAT’S NEW</span>
        <h1>Better connection, less noise.</h1>
        <p>Meaningful product changes should be easy to understand without turning release notes into another notification stream.</p>
        <div className="sidle-editorial-actions">
          <a className="secondary" href="/discover">Open Sidle</a>
          <a className="secondary" href="/community-guidelines">Community guidance</a>
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
        <h2>What Sidle deliberately is not adding</h2>
        <p>
          The product direction does not center public follower counts, engagement streaks or an endless short-video feed. Sidle’s differentiation is low-pressure discovery that leads to genuine conversations, communities and plans.
        </p>
      </section>
    </main>
  );
}
