"use client";

import type { NotificationSettings } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getMessagingClient } from "../lib/messaging";

export function NotificationSettingsPage({ onBack }: { onBack: () => void }) {
  const client = getMessagingClient();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await client.getNotificationSettings());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePreference(key: keyof NotificationSettings, value: boolean) {
    if (!settings || saving !== null) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setSaving(key);
    setError(null);
    setNotice(null);
    try {
      setSettings(await client.setNotificationSettings(next));
      setNotice("Your notification preferences are saved.");
    } catch (err) {
      setSettings(previous);
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="settings-page" aria-labelledby="notifications-settings-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">YOUR PREFERENCES</span>
          <h1 id="notifications-settings-title">Notifications</h1>
          <p className="muted">Choose the notification categories Sidle currently supports for your account.</p>
        </div>
        <button type="button" className="secondary compact" onClick={onBack}>← Back to Settings</button>
      </header>

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button type="button" className="link" onClick={() => void load()} disabled={loading || saving !== null}>
            Try again
          </button>
        </div>
      )}
      {notice && <div className="notice ok" role="status">{notice}</div>}

      <section className="settings-panel" aria-labelledby="notification-categories-title">
        <div>
          <span className="eyebrow">SUPPORTED CATEGORIES</span>
          <h2 id="notification-categories-title">What you hear about</h2>
          <p className="muted">These choices are saved to your account and can be changed at any time.</p>
        </div>

        {loading ? (
          <p className="muted" role="status" style={{ marginTop: 18 }}>Loading your preferences…</p>
        ) : settings ? (
          <div className="notification-preferences-list">
            <label className="notification-preference-row">
              <span>
                <strong>New messages</strong>
                <small>Notifications related to direct messages.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.messages}
                disabled={saving !== null}
                onChange={(event) => void updatePreference("messages", event.target.checked)}
                aria-label="New message notifications"
              />
            </label>
            <label className="notification-preference-row">
              <span>
                <strong>Connection requests</strong>
                <small>When someone wants to connect with you.</small>
              </span>
              <input
                type="checkbox"
                checked={settings.connectionRequests}
                disabled={saving !== null}
                onChange={(event) => void updatePreference("connectionRequests", event.target.checked)}
                aria-label="Connection request notifications"
              />
            </label>
          </div>
        ) : (
          <div className="settings-empty-error" role="status">
            <p className="muted">Your notification preferences could not be loaded.</p>
            <button type="button" className="secondary compact" onClick={() => void load()} disabled={loading}>
              Retry loading preferences
            </button>
          </div>
        )}
        {saving !== null && <p className="muted" role="status" style={{ marginTop: 12 }}>Saving your preference…</p>}
      </section>

      <aside className="notification-delivery-note" aria-label="Notification delivery status">
        <strong>About phone alerts</strong>
        <p>
          Your preference choices are stored, but live push delivery is not enabled yet. These settings do not
          guarantee system notifications on your phone. The Messages area still shows your in-app unread count.
        </p>
      </aside>
    </section>
  );
}
