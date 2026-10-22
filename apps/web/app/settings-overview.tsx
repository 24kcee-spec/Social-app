"use client";

import type { DeviceSession, Me } from "@sp/auth-client";

export type ThemePreference = "system" | "light" | "dark";

interface SettingsOverviewProps {
  me: Me;
  sessions: DeviceSession[];
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onBack: () => void;
  onEditProfile: () => void;
  onOpenPrivacy: () => void;
  onOpenSessions: () => void;
  onOpenAccountData: () => void;
  onOpenNotifications: () => void;
}

const THEMES: { value: ThemePreference; label: string; icon: string; description: string }[] = [
  { value: "system", label: "System", icon: "◐", description: "Follow your device preference" },
  { value: "light", label: "Light", icon: "☀", description: "Bright surfaces" },
  { value: "dark", label: "Dark", icon: "☾", description: "Low-light surfaces" },
];

export function SettingsOverview({
  me,
  sessions,
  theme,
  onThemeChange,
  onBack,
  onEditProfile,
  onOpenPrivacy,
  onOpenSessions,
  onOpenAccountData,
  onOpenNotifications,
}: SettingsOverviewProps) {
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">YOUR SPACE</span>
          <h1 id="settings-title">Settings</h1>
          <p className="muted">Make Social feel right for you. Changes to your profile and privacy are saved through your account.</p>
        </div>
        <button className="secondary compact" type="button" onClick={onBack}>← Back to Social</button>
      </header>

      <section className="settings-account-summary" aria-label="Signed-in account">
        <div className="settings-summary-avatar" aria-hidden="true">{me.email?.charAt(0).toUpperCase() || "S"}</div>
        <div>
          <h2>Account</h2>
          <p>{me.email || "Email not available"}</p>
          <span className="settings-status">{me.status === "active" ? "Active account" : `Account status: ${me.status}`}</span>
        </div>
      </section>

      <div className="settings-tile-grid">
        <button className="settings-tile" type="button" onClick={onEditProfile}>
          <span className="settings-tile-icon" aria-hidden="true">✎</span>
          <span className="settings-tile-copy"><strong>Profile</strong><small>Edit your name, bio, interests, photos and conversation prompts.</small></span>
          <span className="settings-tile-arrow" aria-hidden="true">→</span>
        </button>
        <button className="settings-tile" type="button" onClick={onOpenPrivacy}>
          <span className="settings-tile-icon" aria-hidden="true">◈</span>
          <span className="settings-tile-copy"><strong>Privacy & safety</strong><small>Manage discoverability and who can message you.</small></span>
          <span className="settings-tile-arrow" aria-hidden="true">→</span>
        </button>
        <button className="settings-tile" type="button" onClick={onOpenSessions}>
          <span className="settings-tile-icon" aria-hidden="true">⌘</span>
          <span className="settings-tile-copy"><strong>Account & security</strong><small>{sessions.length} active session{sessions.length === 1 ? "" : "s"} found. Review sessions and account controls.</small></span>
          <span className="settings-tile-arrow" aria-hidden="true">→</span>
        </button>
        <button className="settings-tile" type="button" onClick={onOpenNotifications}>
          <span className="settings-tile-icon" aria-hidden="true">♧</span>
          <span className="settings-tile-copy"><strong>Notifications</strong><small>Open your message area to manage currently supported notification preferences.</small></span>
          <span className="settings-tile-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <section className="settings-panel" aria-labelledby="appearance-title">
        <div>
          <span className="eyebrow">PERSONALISE</span>
          <h2 id="appearance-title">Appearance</h2>
          <p className="muted">Choose how Social looks on this device. System follows your operating-system preference.</p>
        </div>
        <div className="settings-theme-options" role="group" aria-label="Appearance theme">
          {THEMES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={theme === item.value}
              className={`settings-theme-option ${theme === item.value ? "selected" : ""}`}
              onClick={() => onThemeChange(item.value)}
            >
              <span className="settings-theme-icon" aria-hidden="true">{item.icon}</span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-panel" aria-labelledby="data-title">
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">YOUR DATA</span>
            <h2 id="data-title">Account data</h2>
            <p className="muted">Review the existing permanent account deletion controls. Read the confirmation carefully before proceeding.</p>
          </div>
          <button className="secondary compact" type="button" onClick={onOpenAccountData}>Review data controls →</button>
        </div>
      </section>

      <section className="settings-panel settings-help-panel" aria-labelledby="help-title">
        <span className="eyebrow">HELP & SAFETY</span>
        <h2 id="help-title">Keep your space comfortable</h2>
        <p className="muted">Use the report and block actions on profiles, connections, messages, groups and events when something does not feel right. Settings here reflect controls already available in the app; we do not show unsupported switches.</p>
      </section>
    </section>
  );
}
