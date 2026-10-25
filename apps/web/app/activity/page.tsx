'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ActivityItem, PlanInvitation } from '@sp/profile-client';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { errorMessage } from '../../lib/auth';
export default function ActivityPage() {
  return (
    <PlatformShell
      title="Activity"
      description="Updates from your posts, connections, conversations and invitations."
    >
      <ActivityInbox />
    </PlatformShell>
  );
}
function ActivityInbox() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [invitations, setInvitations] = useState<PlanInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activity, plans] = await Promise.all([
        getPlatformClient().listActivity(),
        getPlatformClient().listInvitations(),
      ]);
      setItems(activity);
      setInvitations(plans);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="card-actions">
        <button className="secondary" disabled={loading || busy} onClick={() => void load()}>
          Refresh
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void act(() => getPlatformClient().readActivity())}
        >
          Mark all read
        </button>
      </div>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      {invitations.length > 0 && (
        <section className="settings-panel">
          <h2>Plan invitations</h2>
          {invitations.map((invite) => (
            <article key={invite.id} className="activity-item">
              <div>
                <strong>{invite.title}</strong>
                <p>
                  {invite.senderName} invited you · {new Date(invite.startsAt).toLocaleString()} ·{' '}
                  {invite.generalArea}
                </p>
                <small>{invite.status}</small>
              </div>
              {invite.status === 'pending' && (
                <div className="card-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() => getPlatformClient().respondInvitation(invite.id, 'accepted'))
                    }
                  >
                    Accept invitation
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(() => getPlatformClient().respondInvitation(invite.id, 'declined'))
                    }
                  >
                    Decline
                  </button>
                </div>
              )}
              <a href="/plans">Open Plans to RSVP</a>
            </article>
          ))}
          <p className="muted">
            Accepting an invitation does not reserve a seat. Review the Plan and RSVP to join.
          </p>
        </section>
      )}
      {loading ? (
        <p>Loading activity…</p>
      ) : !items.length ? (
        <section className="empty-state-card">
          <h2>You’re up to date</h2>
          <p>Relevant updates will appear here as you use Sidle.</p>
          <a href="/feed">Explore the feed</a>
        </section>
      ) : (
        <div className="activity-list">
          {items.map((item) => (
            <article key={item.id} className={`activity-item ${item.seenAt ? '' : 'unread'}`}>
              <div>
                <strong>{item.label}</strong>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </div>
              <div className="card-actions">
                <a
                  href={
                    ['connection', 'connection_request'].includes(item.kind)
                      ? '/connections'
                      : item.kind === 'message'
                        ? '/messages'
                        : item.kind === 'call'
                          ? '/calls'
                          : item.kind === 'plan_invitation'
                            ? '/plans'
                            : item.kind === 'follow'
                              ? `/u/${item.targetId}`
                              : `/post/${item.targetId}`
                  }
                >
                  Open
                </a>
                {!item.seenAt && (
                  <button
                    className="link"
                    disabled={busy}
                    onClick={() => void act(() => getPlatformClient().readActivity(item.id))}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
