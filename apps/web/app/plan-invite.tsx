'use client';
import { useState } from 'react';
import type { ConnectionView } from '@sp/types';
import { getConnectionsClient } from '../lib/connections';
import { getPlatformClient } from '../lib/platform';
import { errorMessage } from '../lib/auth';
export function PlanInvite({ eventId }: { eventId: string }) {
  const [people, setPeople] = useState<ConnectionView[] | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  return (
    <div>
      {!people ? (
        <button
          className="secondary compact"
          onClick={() =>
            void getConnectionsClient()
              .listConnections()
              .then(setPeople)
              .catch((err) => setError(errorMessage(err)))
          }
        >
          Invite a connection
        </button>
      ) : (
        <form
          className="card-actions"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await getPlatformClient().inviteToPlan(eventId, selected);
              setNotice(
                'Invitation saved to their Activity inbox. They still need to RSVP for a place.',
              );
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Connection
            <select required value={selected} onChange={(event) => setSelected(event.target.value)}>
              <option value="">Choose someone</option>
              {people.map((person) => (
                <option key={person.other.userId} value={person.other.userId}>
                  {person.other.displayName}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy || !selected}>Send invitation</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
