'use client';

import type { SavedPerson } from '@sp/profile-client';
import { useCallback, useEffect, useState } from 'react';
import { getProductClient } from '../lib/product';
import { errorMessage } from '../lib/auth';
import { getSignedMediaUrl } from '../lib/profile';
import { SayHi } from './say-hi';

export function SavedIntroductions({
  search,
  onRemoved,
}: {
  search: string;
  onRemoved: (id: string) => void;
}) {
  const [people, setPeople] = useState<SavedPerson[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<SavedPerson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const saved = await getProductClient().listSavedPeople();
      setPeople(saved);
      const pairs = await Promise.all(
        saved
          .filter((person) => person.thumbnailPath)
          .map(async (person) => {
            try {
              return [person.userId, await getSignedMediaUrl(person.thumbnailPath!)] as const;
            } catch {
              return null;
            }
          }),
      );
      setPhotos(Object.fromEntries(pairs.filter((pair) => pair !== null)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = people.filter((person) =>
    `${person.displayName} ${person.bio}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section aria-label="Saved introductions">
      <h2>Your saved introductions</h2>
      <p className="muted">
        Saved to your account across devices. Profiles remain subject to privacy and blocks.
      </p>
      <button className="secondary" disabled={loading || busy !== null} onClick={() => void load()}>
        Refresh saved introductions
      </button>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice ok">
          {notice}
        </p>
      )}
      {loading ? (
        <p>Loading saved introductions…</p>
      ) : !visible.length ? (
        <p>
          No saved introductions match this view. Save someone from Discover to find them here on
          another device.
        </p>
      ) : (
        <div className="sidle-people-grid">
          {visible.map((person) => (
            <article className="card" key={person.userId}>
              {photos[person.userId] && (
                <img
                  src={photos[person.userId]}
                  alt=""
                  loading="lazy"
                  width={80}
                  height={80}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
              )}
              <h3>{person.displayName}</h3>
              <p>{person.bio}</p>
              <div className="card-actions">
                {person.connected ? (
                  <a className="secondary" href="/connections">
                    View connections
                  </a>
                ) : (
                  <button onClick={() => setGreeting(person)}>Say hi</button>
                )}
                <button
                  className="secondary"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(person.userId);
                    setError(null);
                    try {
                      await getProductClient().setSaved(person.userId, false);
                      setPeople((current) =>
                        current.filter((item) => item.userId !== person.userId),
                      );
                      onRemoved(person.userId);
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Remove saved introduction
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {greeting && (
        <SayHi
          card={greeting}
          onClose={() => setGreeting(null)}
          onSent={(message) => {
            setNotice(message);
            setGreeting(null);
          }}
        />
      )}
    </section>
  );
}
