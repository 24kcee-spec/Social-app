'use client';
import { useCallback, useEffect, useState } from 'react';
import { PlatformShell } from '../../platform-shell';
import { getPlatformClient } from '../../../lib/platform';
import { getAuth, errorMessage } from '../../../lib/auth';
interface Upload {
  id: string;
  path: string;
  kind: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}
export default function MediaSettings() {
  return (
    <PlatformShell
      title="Your uploaded media"
      description="Review storage use and remove files you no longer want to publish."
    >
      <Uploads />
    </PlatformShell>
  );
}
function Uploads() {
  const [items, setItems] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setItems(await getPlatformClient().call<Upload[]>('media.list'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="settings-panel">
      {error && <p role="alert">{error}</p>}
      {!items.length ? (
        <p>No uploads to display.</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="activity-item">
            <div>
              <strong>{item.kind}</strong>
              <p>
                {(item.sizeBytes / 1048576).toFixed(2)} MB · {item.status} ·{' '}
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              className="secondary"
              disabled={busy !== null}
              onClick={async () => {
                if (
                  !window.confirm(
                    'Remove this file and posts that use it? Existing downloaded copies cannot be recalled.',
                  )
                )
                  return;
                setBusy(item.id);
                setError(null);
                try {
                  const { error } = await getAuth()
                    .getSupabaseClient()
                    .storage.from('sidle-social-media')
                    .remove([item.path]);
                  if (error) throw error;
                  await getPlatformClient().removeMedia(item.id);
                  await load();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === item.id ? 'Removing…' : 'Remove'}
            </button>
          </article>
        ))
      )}
    </section>
  );
}
