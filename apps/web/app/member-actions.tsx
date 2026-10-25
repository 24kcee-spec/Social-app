'use client';
import { useEffect, useState } from 'react';
import { getAuth, errorMessage } from '../lib/auth';
import { getDiscoveryClient } from '../lib/discovery';
import { getPlatformClient } from '../lib/platform';
import { ReportModal } from './report-modal';
export function MemberActions({ id, name }: { id: string; name: string }) {
  const [me, setMe] = useState('');
  const [report, setReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getAuth()
      .fetchMe()
      .then((user) => setMe(user.id))
      .catch(() => undefined);
  }, []);
  if (!me || me === id) return null;
  return (
    <div className="card-actions">
      <button
        className="secondary compact"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const p = await getPlatformClient().getPreferences();
            await getPlatformClient().setPreferences({
              mutedUsers: [...new Set([...p.mutedUsers, id])],
            });
            setNotice(
              'Muted in your feed and message push preferences. Manage muted accounts in Settings.',
            );
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Mute
      </button>
      <button className="secondary compact" onClick={() => setReport(true)}>
        Report member
      </button>
      <button
        className="danger compact"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Block ${name}? This ends the connection and prevents contact.`))
            return;
          setBusy(true);
          try {
            await getDiscoveryClient().block(id);
            window.location.assign('/feed');
          } catch (err) {
            setError(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Block
      </button>
      {report && (
        <ReportModal
          targetType="profile"
          targetId={id}
          targetLabel={name}
          onClose={() => setReport(false)}
        />
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
