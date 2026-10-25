'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Playlist, SocialPost } from '@sp/profile-client';
import { PlatformShell } from '../platform-shell';
import { SocialMedia } from '../social-media';
import { getPlatformClient } from '../../lib/platform';
import { errorMessage } from '../../lib/auth';

export default function MusicPage() {
  return (
    <PlatformShell
      title="Music"
      description="Original and licensed tracks shared by Sidle creators."
    >
      <MusicLibrary />
    </PlatformShell>
  );
}
function MusicLibrary() {
  const [tracks, setTracks] = useState<SocialPost[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState('all');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [page, lists] = await Promise.all([
        getPlatformClient().listPosts({ kind: 'music', limit: 30 }),
        getPlatformClient().listPlaylists(),
      ]);
      setTracks(page.items);
      setPlaylists(lists);
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
    setError(null);
    try {
      await work();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const visible =
    selection === 'all' ? tracks : (playlists.find((item) => item.id === selection)?.tracks ?? []);
  return (
    <div className="music-layout">
      <aside className="settings-panel">
        <h2>Your library</h2>
        <button className="link" onClick={() => setSelection('all')}>
          All tracks
        </button>
        {playlists.map((list) => (
          <div className="playlist-row" key={list.id}>
            <button className="link" onClick={() => setSelection(list.id)}>
              {list.name} ({list.tracks.length})
            </button>
            <button
              className="link"
              aria-label={`Delete ${list.name}`}
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await getPlatformClient().deletePlaylist(list.id);
                  setSelection('all');
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await getPlatformClient().createPlaylist(name);
              setName('');
            });
          }}
        >
          <label>
            New playlist
            <input
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <button disabled={busy || !name.trim()}>Create playlist</button>
        </form>
        <a className="secondary" href="/studio?kind=music">
          Upload a track
        </a>
      </aside>
      <section aria-label="Tracks">
        {error && (
          <p className="notice err" role="alert">
            {error}
            <button onClick={() => void load()}>Retry</button>
          </p>
        )}
        {loading ? (
          <p>Loading music…</p>
        ) : !visible.length ? (
          <section className="empty-state-card">
            <h2>Your next favourite starts here</h2>
            <p>Upload original music or add tracks to a private playlist.</p>
          </section>
        ) : (
          visible.map((track) => (
            <article className="social-post music-track" key={track.id}>
              <h2>{track.title}</h2>
              <a href={`/u/${track.userId}`}>{track.displayName}</a>
              <p>{track.body}</p>
              {track.asset && <SocialMedia asset={track.asset} />}
              <label>
                Add to playlist
                <select
                  aria-label="Add to playlist" defaultValue=""
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    event.target.value = '';
                    if (value) void act(() => getPlatformClient().playlistTrack(value, track.id));
                  }}
                >
                  <option value="">Choose playlist</option>
                  {playlists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </label>
              {selection !== 'all' && (
                <button
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void act(() => getPlatformClient().playlistTrack(selection, track.id, false))
                  }
                >
                  Remove from playlist
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
