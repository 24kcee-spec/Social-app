import { useState } from "react";
import type { DeviceSession, Me } from "@sp/auth-client";
import type { Profile } from "@sp/types";
import { getAuth } from "../lib/auth";

export type ThemePreference = "system" | "light" | "dark";

interface SettingsOverviewProps {
  me: Me;
  profile?: Profile | null;
  sessions: DeviceSession[];
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onBack: () => void;
  onEditProfile: () => void;
  onOpenPrivacy: () => void;
  onOpenSessions: () => void;
  onOpenAccountData: () => void;
  onOpenNotifications: () => void;
  onVerifyStudent?: (email: string, id?: string, inst?: string) => Promise<void>;
}

const THEMES: { value: ThemePreference; label: string; icon: string; description: string }[] = [
  { value: "system", label: "System", icon: "◐", description: "Follow your device preference" },
  { value: "light", label: "Light", icon: "☀", description: "Bright surfaces" },
  { value: "dark", label: "Dark", icon: "☾", description: "Low-light surfaces" },
];

export function SettingsOverview({
  me,
  profile,
  sessions,
  theme,
  onThemeChange,
  onBack,
  onEditProfile,
  onOpenPrivacy,
  onOpenSessions,
  onOpenAccountData,
  onOpenNotifications,
  onVerifyStudent,
}: SettingsOverviewProps) {
  const isStudentVerified = profile?.verificationLevel === "student_verified";
  const [studentEmail, setStudentEmail] = useState(me.email?.includes(".ac.") || me.email?.includes(".edu") ? me.email : "");
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">YOUR SPACE</span>
          <h1 id="settings-title">Settings</h1>
          <p className="muted">Make Sidle feel right for you. Changes to your profile and privacy are saved through your account.</p>
        </div>
        <button className="secondary compact" type="button" onClick={onBack}>← Back to Sidle</button>
      </header>

      <section className="settings-account-summary" aria-label="Signed-in account">
        <div className="settings-summary-avatar" aria-hidden="true">{me.email?.charAt(0).toUpperCase() || "S"}</div>
        <div>
          <h2>Account</h2>
          <p>{me.email || "Email not available"}</p>
          <span className="settings-status">{me.status === "active" ? "Active account" : `Account status: ${me.status}`}</span>
        </div>
      </section>

      <section className={`verification-status-card ${isStudentVerified ? "verified" : ""}`} aria-labelledby="verification-title">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="eyebrow" style={{ margin: 0 }}>CAMPUS AFFILIATION</span>
              {isStudentVerified ? (
                <span className="campus-badge">✓ Academic email</span>
              ) : (
                <span className="campus-badge" style={{ background: "var(--surface-sunken)", color: "var(--text-muted)", borderColor: "var(--line)" }}>Unverified</span>
              )}
            </div>
            <h2 id="verification-title" style={{ margin: "6px 0 4px" }}>
              {isStudentVerified ? "Academic email confirmed" : "Confirm your academic email"}
            </h2>
            <p id="verification-help" className="muted" style={{ margin: 0, fontSize: "0.9rem", maxWidth: 540 }}>
              {isStudentVerified
                ? "Your confirmed sign-in email belongs to a supported institution. This badge verifies email access, not current enrollment or identity."
                : "Sign in with a supported university email and confirm it through the email link first. The address below must match your confirmed sign-in email."}
            </p>
          </div>
        </div>

        {!isStudentVerified && onVerifyStudent && (
          <form
            aria-busy={verifying}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!studentEmail.trim() || verifying) return;
              setVerifying(true);
              setVerifyError(null);
              setVerifyMsg(null);
              try {
                await onVerifyStudent(studentEmail.trim().toLowerCase(), undefined);
                setVerifyMsg("Academic email ownership confirmed.");
              } catch (err: unknown) {
                setVerifyError(err instanceof Error ? err.message : "Failed to verify. Please make sure you enter a valid university email.");
              } finally {
                setVerifying(false);
              }
            }}
            style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 500 }}
          >
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="student-email">Academic email</label>
              <input
                id="student-email"
                name="studentEmail"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoComplete="email"
                aria-describedby="verification-help"
                placeholder="e.g. n02420280y@students.nust.ac.zw"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                required
                disabled={verifying}
                style={{ width: "100%", padding: "8px 12px", fontSize: "0.9rem" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button type="submit" disabled={verifying || !studentEmail.trim()} className="compact" style={{ alignSelf: "flex-start" }}>
                {verifying ? "Verifying…" : "Confirm academic email"}
              </button>
              <button type="button" className="secondary compact" disabled={verifying || !me.email} onClick={async () => {
                setVerifying(true); setVerifyError(null); setVerifyMsg(null);
                try {
                  await getAuth().requestEmailAccessLink(me.email!, `${window.location.origin}/settings`);
                  setVerifyMsg("If available, an access link was sent to your sign-in email. Open it, return to Settings and confirm your academic email. Delivery depends on the project's email provider.");
                } catch (err) { setVerifyError(err instanceof Error ? err.message : "Could not send the access link."); }
                finally { setVerifying(false); }
              }}>Send email access link</button>
            </div>
            {verifyMsg && <p className="notice ok" role="status" aria-live="polite" style={{ margin: 0 }}>{verifyMsg}</p>}
            {verifyError && <p className="notice err" role="alert" style={{ margin: 0 }}>{verifyError}</p>}
          </form>
        )}
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
          <span className="settings-tile-copy"><strong>Notifications</strong><small>Manage new-message and connection-request notification preferences.</small></span>
          <span className="settings-tile-arrow" aria-hidden="true">→</span>
        </button>
      </div>

      <section className="settings-panel" aria-labelledby="appearance-title">
        <div>
          <span className="eyebrow">PERSONALISE</span>
          <h2 id="appearance-title">Appearance</h2>
          <p className="muted">Choose how Sidle looks on this device. System follows your operating-system preference.</p>
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
        <div className="settings-panel-heading">
          <div>
            <span className="eyebrow">HELP & SAFETY</span>
            <h2 id="help-title">Keep your space comfortable</h2>
            <p className="muted">Use the report and block actions on profiles, connections, messages, groups and events when something does not feel right. The help center explains the controls Sidle actually supports without inventing unavailable services.</p>
          </div>
          <a className="secondary compact" href="/help">Open help & safety →</a>
        </div>
      </section>
    </section>
  );
}
