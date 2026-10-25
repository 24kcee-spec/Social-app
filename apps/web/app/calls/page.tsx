'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CallRoom } from '@sp/profile-client';
import type { ConnectionView } from '@sp/types';
import { PlatformShell } from '../platform-shell';
import { getAuth, errorMessage } from '../../lib/auth';
import { getPlatformClient } from '../../lib/platform';
import { getConnectionsClient } from '../../lib/connections';
import { CallSession } from '../../lib/call-session';

export default function CallsPage() {
  return (
    <PlatformShell
      title="Voice & video calls"
      description="Call a connection with explicit microphone and camera permission."
    >
      <Calls />
    </PlatformShell>
  );
}
function Calls() {
  const [people, setPeople] = useState<ConnectionView[]>([]);
  const [calls, setCalls] = useState<CallRoom[]>([]);
  const [me, setMe] = useState('');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [active, setActive] = useState<{ id: string; mode: 'audio' | 'video' } | null>(null);
  const [state, setState] = useState('Ready');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camera, setCamera] = useState(true);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const session = useRef<CallSession | null>(null);
  const activeRef = useRef<string | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const load = useCallback(async () => {
    try {
      const [connections, rooms, user, capabilities] = await Promise.all([
        getConnectionsClient().listConnections(),
        getPlatformClient().listCalls(),
        getAuth().fetchMe(),
        fetch('/api/platform/capabilities').then((response) => response.json()),
      ]);
      setPeople(connections);
      setCalls(rooms);
      setMe(user.id);
      setEnabled(capabilities.calls === true);
      if (
        activeRef.current &&
        (!rooms.some((room) => room.id === activeRef.current) ||
          rooms.some(
            (room) => room.id === activeRef.current && ['ended', 'declined'].includes(room.state),
          ))
      ) {
        session.current?.close();
        session.current = null;
        setActive(null);
        activeRef.current = null;
        setState('Call ended');
        setLocal(null);
        setRemote(null);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden || activeRef.current) void load();
    }, 10000);
    return () => {
      clearInterval(timer);
      session.current?.close();
      if (activeRef.current)
        void getPlatformClient()
          .setCallState(activeRef.current, 'ended')
          .catch(() => undefined);
    };
  }, [load]);
  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = local;
  }, [local]);
  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = remote;
  }, [remote]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void session.current?.poll(), 1500);
    return () => clearInterval(timer);
  }, [active]);
  async function join(room: { id: string; mode: 'audio' | 'video' }, outgoing: boolean) {
    setBusy(true);
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection)
        throw new Error('This browser cannot place calls. Try a current supported browser.');
      const token = await getAuth().getAccessToken();
      const response = await fetch('/api/platform/ice', {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error((await response.json()).error ?? 'Calling is not configured.');
      const configuration = (await response.json()) as {
        iceServers: RTCIceServer[];
        relay: boolean;
      };
      const controller = new CallSession(getPlatformClient(), room.id, {
        local: setLocal,
        remote: setRemote,
        state: (value) => {
          setState(value);
          if (value === 'ended') {
            activeRef.current = null;
            session.current = null;
            setActive(null);
            setLocal(null);
            setRemote(null);
          }
        },
        error: (err) => setError(errorMessage(err)),
      });
      session.current = controller;
      activeRef.current = room.id;
      setActive(room);
      setState('Connecting');
      await controller.prepare(room.mode, configuration);
      if (outgoing) await controller.offer();
      else {
        const accepted = await getPlatformClient().setCallState(room.id, 'accepted');
        if (!accepted.updated) throw new Error('This call has expired.');
        await controller.poll();
      }
      await load();
    } catch (err) {
      session.current?.close();
      session.current = null;
      activeRef.current = null;
      setActive(null);
      setLocal(null);
      setRemote(null);
      void getPlatformClient()
        .setCallState(room.id, 'ended')
        .catch(() => undefined);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    const id = activeRef.current;
    session.current?.close();
    session.current = null;
    activeRef.current = null;
    setActive(null);
    setLocal(null);
    setRemote(null);
    setState('Call ended');
    if (id)
      try {
        await getPlatformClient().setCallState(id, 'ended');
        await load();
      } catch (err) {
        setError(errorMessage(err));
      }
  }
  return (
    <div className="platform-split">
      <section className="settings-panel">
        <h2>Your connections</h2>
        {enabled === false && (
          <p className="provider-status">
            Calling code is installed. A TURN relay or explicit direct-call configuration is still
            required before calls can start.
          </p>
        )}
        {people.length ? (
          people.map((person) => (
            <div className="call-person" key={person.other.userId}>
              <strong>{person.other.displayName}</strong>
              <div className="card-actions">
                {(['audio', 'video'] as const).map((mode) => (
                  <button
                    className="secondary compact"
                    key={mode}
                    disabled={busy || !!active || !enabled}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const room = await getPlatformClient().startCall(person.other.userId, mode);
                        await join({ ...room, mode }, true);
                      } catch (err) {
                        setError(errorMessage(err));
                        setBusy(false);
                      }
                    }}
                  >
                    {mode === 'audio' ? 'Voice' : 'Video'}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p>Connect with someone to place a call.</p>
        )}
        <h3>Incoming calls</h3>
        {calls
          .filter((room) => room.recipientId === me && room.state === 'ringing')
          .map((room) => (
            <div className="call-person" key={room.id}>
              <span>
                {room.otherName} · {room.mode}
              </span>
              <button
                disabled={busy || !!active || !enabled}
                onClick={() => void join(room, false)}
              >
                Accept
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    await getPlatformClient().setCallState(room.id, 'declined');
                    await load();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Decline
              </button>
            </div>
          ))}
      </section>
      <section>
        <div className="call-stage">
          <p role="status">{state}</p>
          {active ? (
            <>
              <video ref={remoteVideo} autoPlay playsInline aria-label="Remote call media" />
              <video
                className="local-preview"
                ref={localVideo}
                autoPlay
                playsInline
                muted
                aria-label="Your camera preview"
              />
            </>
          ) : (
            <div className="empty-state-card">
              <h2>Your next conversation</h2>
              <p>Microphone and camera stay off until you place or accept a call.</p>
            </div>
          )}
        </div>
        {active && (
          <div className="call-controls">
            <button
              className="secondary"
              onClick={() => {
                session.current?.mute(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            {active.mode === 'video' && (
              <button
                className="secondary"
                onClick={() => {
                  session.current?.camera(!camera);
                  setCamera(!camera);
                }}
              >
                {camera ? 'Camera off' : 'Camera on'}
              </button>
            )}
            <button className="danger" onClick={() => void end()}>
              End call
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="notice err">
            {error}
          </p>
        )}
        <p className="muted">
          Media uses WebRTC. Calls are not recorded by this feature. Network relay capacity and
          device support affect connectivity.
        </p>
      </section>
    </div>
  );
}
