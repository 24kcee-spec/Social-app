import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & safety",
  description: "Privacy, reporting, account security and community guidance for Sidle.",
};

const guidance = [
  {
    title: "Control who can reach you",
    body: "Use Privacy & safety to change discoverability and message permissions. Blocking removes the account from your Sidle experience; unblocking does not restore an old connection.",
  },
  {
    title: "Report behavior, not popularity",
    body: "Use Report on profiles, conversations, groups or plans when something breaks the community rules or makes the space unsafe. Reporting is separate from blocking, so you can use either or both.",
  },
  {
    title: "Protect your account",
    body: "Review active sessions under Account & security and revoke sessions you do not recognize. Password reset links should only be opened from the inbox you control.",
  },
  {
    title: "Keep location details general",
    body: "Sidle is designed around broad campus or neighborhood context. Avoid posting private home addresses, passwords, financial details or other sensitive information in profiles, messages, groups or plans.",
  },
];

export default function HelpPage() {
  return (
    <main id="main" tabIndex={-1} className="settings-page">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">HELP & SAFETY</span>
          <h1>Use Sidle with confidence</h1>
          <p className="muted">Practical guidance for privacy, reporting, account security and getting back to the right settings.</p>
        </div>
        <Link className="secondary compact" href="/settings">← Back to Settings</Link>
      </header>

      <section className="settings-panel" aria-labelledby="help-basics-title">
        <span className="eyebrow">THE BASICS</span>
        <h2 id="help-basics-title">Your controls stay close</h2>
        <div className="settings-help-grid">
          {guidance.map((item) => (
            <article className="settings-help-card" key={item.title}>
              <h3>{item.title}</h3>
              <p className="muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-panel" aria-labelledby="help-actions-title">
        <span className="eyebrow">QUICK ACTIONS</span>
        <h2 id="help-actions-title">Go straight to the control you need</h2>
        <div className="card-actions">
          <Link className="secondary" href="/settings/privacy">Privacy & blocked accounts</Link>
          <Link className="secondary" href="/settings/account">Active sessions</Link>
          <Link className="secondary" href="/settings/notifications">Notification preferences</Link>
          <Link className="secondary" href="/profile/edit">Edit profile</Link>
          <Link className="secondary" href="/privacy">Privacy overview</Link>
          <Link className="secondary" href="/community-guidelines">Community guidance</Link>
          <Link className="secondary" href="/whats-new">What’s new</Link>
        </div>
      </section>

      <aside className="notification-delivery-note" aria-label="Support readiness note">
        <strong>Before the wider pilot</strong>
        <p>
          Sidle intentionally does not invent a support email or emergency service that has not been staffed yet. A real support contact, moderation coverage and published policy owner should be added before broader admission.
        </p>
      </aside>
    </main>
  );
}
