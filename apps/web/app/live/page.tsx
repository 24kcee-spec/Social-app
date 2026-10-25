'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { getAuth, errorMessage } from '../../lib/auth';
import type { Room } from 'livekit-client';
interface Broadcast {
  id: string;
  userId: string;
  displayName: string;
  title: string;
  audience: string;
  expiresAt: string;
}
export default function LivePage() {
  return (
    <PlatformShell
      title="Live broadcasts"
      description="Host a live video or watch a member broadcast when streaming infrastructure is configured."
    >
      <Live />
    </PlatformShell>
  );
}
function Live() {
  const [rooms, setRooms] = useState<Broadcast[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; owner: boolean } | null>(null);
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState('connections');
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<Room | null>(null);
  const media = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const [items, cap] = await Promise.all([
      getPlatformClient().call<Broadcast[]>('live.list'),
      fetch('/api/platform/capabilities').then((r) => r.json()),
    ]);
    setRooms(items);
    setEnabled(cap.live === true);
  }, []);
  useEffect(() => {
    void load().catch((err) => setError(errorMessage(err)));
    const timer = setInterval(() => {
      if (!document.hidden) void load().catch(() => undefined);
    }, 15000);
    return () => {
      clearInterval(timer);
      void controller.current?.disconnect();
    };
  }, [load]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      void getPlatformClient()
        .call('live.join', { id: active.id })
        .catch(() => {
          void controller.current?.disconnect();
          controller.current = null;
          setActive(null);
          setError('This broadcast has ended or is no longer available.');
        });
    }, 10000);
    return () => clearInterval(timer);
  }, [active]);
  async function api(operation: string, id: string) {
    const token = await getAuth().getAccessToken();
    const response = await fetch('/api/platform/' + operation, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
      cache: 'no-store',
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? 'Streaming unavailable.');
    return value;
  }
  async function join(id: string) {
    setBusy(true);
    setError(null);
    try {
      const grant = await api('live-token', id);
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 24 } },
      });
      controller.current = room;
      setActive({ id, owner: grant.owner });
      room.on(RoomEvent.TrackSubscribed, (track) => {
        const element = track.attach();
        media.current?.appendChild(element);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) =>
        track.detach().forEach((element) => element.remove()),
      );
      await room.connect(grant.url, grant.token);
      if (grant.owner) {
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
        const camera = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (camera) {
          const video = camera.attach();
          video.muted = true;
          media.current?.appendChild(video);
        }
      }
    } catch (err) {
      void controller.current?.disconnect();
      controller.current = null;
      setActive(null);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    try {
      if (active?.owner) await api('live-end', active.id);
      await controller.current?.disconnect();
      controller.current = null;
      setActive(null);
      media.current?.replaceChildren();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {!enabled && (
        <p className="provider-status">
          Streaming code is installed. Configure a self-hosted or managed LiveKit server to enable
          broadcasts. Live video bandwidth is not included in the free hosting budget.
        </p>
      )}
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      <section className="settings-panel">
        <h2>{active ? 'Broadcast in progress' : 'Host a broadcast'}</h2>
        {!active && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void getPlatformClient()
                .call<{ id: string }>('live.create', { title, audience })
                .then((room) => join(room.id))
                .catch((err) => {
                  setError(errorMessage(err));
                  setBusy(false);
                });
            }}
          >
            <label>
              Title
              <input
                required
                minLength={2}
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Audience
              <select value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="connections">Connections</option>
                <option value="public">Public members</option>
              </select>
            </label>
            <button disabled={busy || !enabled}>Start live video</button>
          </form>
        )}
        <div ref={media} className="live-media" />
        {active && (
          <button className="danger" disabled={busy} onClick={() => void leave()}>
            {active.owner ? 'End broadcast' : 'Leave broadcast'}
          </button>
        )}
      </section>
      <div className="feature-hub">
        {rooms.map((room) => (
          <article className="settings-panel" key={room.id}>
            <span className="eyebrow">LIVE · {room.audience}</span>
            <h2>{room.title}</h2>
            <p>{room.displayName}</p>
            <button disabled={busy || !!active || !enabled} onClick={() => void join(room.id)}>
              Watch / resume
            </button>
          </article>
        ))}
      </div>
      <p className="muted">
        This feature does not record broadcasts. Only the host can publish. Keep private information
        out of public broadcasts.
      </p>
    </div>
  );
}
