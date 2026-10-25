'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocationShare } from '@sp/profile-client';
import type { ConnectionView } from '@sp/types';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { getConnectionsClient } from '../../lib/connections';
import { getAuth, errorMessage } from '../../lib/auth';

export default function LocationPage() {
  return (
    <PlatformShell
      title="Live location"
      description="Share precise location with selected connections for a limited time."
    >
      <LocationControl />
    </PlatformShell>
  );
}
function LocationControl() {
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [minutes, setMinutes] = useState<15 | 30 | 60>(15);
  const [shares, setShares] = useState<LocationShare[]>([]);
  const [me, setMe] = useState('');
  const [own, setOwn] = useState<{ id: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const [people, locations, user] = await Promise.all([
        getConnectionsClient().listConnections(),
        getPlatformClient().listLocations(),
        getAuth().fetchMe(),
      ]);
      setConnections(people);
      setShares(locations);
      setMe(user.id);
      const existing = locations.find((share) => share.userId === user.id);
      setOwn(existing ? { id: existing.id, expiresAt: existing.expiresAt } : null);
      if (existing && watch.current === null)
        setNotice(
          'An active share was found for this account. This device is not sending updates. Stop the share before choosing new recipients.',
        );
      if (!existing && watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden)
        void getPlatformClient()
          .listLocations()
          .then(setShares)
          .catch(() => undefined);
    }, 15000);
    return () => {
      alive.current = false;
      clearInterval(timer);
      if (watch.current !== null) {
        navigator.geolocation.clearWatch(watch.current);
        void getPlatformClient()
          .stopLocation()
          .catch(() => undefined);
      }
    };
  }, [load]);
  useEffect(() => {
    if (!own) return;
    const remaining = Date.parse(own.expiresAt) - Date.now();
    const timer = setTimeout(
      () => {
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        setOwn(null);
        setNotice('Location sharing expired.');
      },
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [own]);
  async function start() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!navigator.geolocation) throw new Error('This browser does not support location.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        }),
      );
      const share = await getPlatformClient().startLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        minutes,
        recipients: selected,
      });
      setOwn(share);
      lastSent.current = Date.now();
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
      watch.current = navigator.geolocation.watchPosition(
        (position) => {
          if (Date.now() - lastSent.current < 10000) return;
          lastSent.current = Date.now();
          void getPlatformClient()
            .updateLocation(
              share.id,
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy,
            )
            .catch(() => {
              if (alive.current)
                setError(
                  'Location update interrupted. The last known position remains available until you stop sharing or it expires.',
                );
            });
        },
        () => {
          if (alive.current)
            setError(
              'Location access stopped. Recipients may see the last known position until expiry.',
            );
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
      );
      setNotice('Sharing with your selected connections. Keep this screen open for updates.');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setBusy(true);
    setError(null);
    try {
      await getPlatformClient().stopLocation();
      setOwn(null);
      setNotice('Location sharing stopped.');
      await load();
    } catch {
      setError(
        'Tracking on this device stopped, but server revocation was not confirmed. Retry Stop; the share will expire automatically.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="platform-split">
      <section className="settings-panel">
        <h2>Choose who can see you</h2>
        <p>
          Sharing is optional. Selected connections can see your exact coordinates and accuracy.
          They can record what they see. Leaving this screen stops device tracking; server expiry
          remains the fallback if the network is unavailable.
        </p>
        {connections.length ? (
          connections.map((connection) => (
            <label className="switch-row" key={connection.other.userId}>
              <span>{connection.other.displayName}</span>
              <input
                type="checkbox"
                checked={selected.includes(connection.other.userId)}
                disabled={
                  busy ||
                  own !== null ||
                  (!selected.includes(connection.other.userId) && selected.length >= 20)
                }
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, connection.other.userId]
                      : current.filter((id) => id !== connection.other.userId),
                  )
                }
              />
            </label>
          ))
        ) : (
          <p>Connect with someone before sharing location.</p>
        )}
        <label>
          Share duration
          <select
            value={minutes}
            disabled={busy || own !== null}
            onChange={(event) => setMinutes(Number(event.target.value) as 15 | 30 | 60)}
          >
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
        </label>
        <div className="card-actions">
          {own ? (
            <button className="secondary danger-text" disabled={busy} onClick={() => void stop()}>
              Stop sharing now
            </button>
          ) : (
            <button disabled={busy || !selected.length} onClick={() => void start()}>
              {busy ? 'Requesting location…' : 'Share my precise location'}
            </button>
          )}
          <button className="secondary" disabled={busy} onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {own && <p role="status">Ends {new Date(own.expiresAt).toLocaleTimeString()}.</p>}
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
      </section>
      <section>
        <h2>Locations shared with you</h2>
        {shares
          .filter((share) => Date.parse(share.expiresAt) > Date.now())
          .map((share) => (
            <article className="social-post" key={share.id}>
              <h3>{share.userId === me ? 'Your location' : share.displayName}</h3>
              <p className="location-coordinate">
                {share.latitude.toFixed(6)}, {share.longitude.toFixed(6)}
              </p>
              <p className="muted">
                Accuracy: {share.accuracy === null ? 'unknown' : Math.round(share.accuracy) + ' m'}{' '}
                · Updated {new Date(share.updatedAt).toLocaleTimeString()} · Expires{' '}
                {new Date(share.expiresAt).toLocaleTimeString()}
              </p>
              <a
                className="secondary"
                target="_blank"
                rel="noopener noreferrer"
                href={`https://www.openstreetmap.org/?mlat=${share.latitude}&mlon=${share.longitude}#map=17/${share.latitude}/${share.longitude}`}
              >
                Open map
              </a>
              <p className="muted">Opening the map sends these coordinates to OpenStreetMap.</p>
            </article>
          ))}
        {!shares.length && (
          <div className="empty-state-card">
            <p>No active shares. Exact location is never part of public discovery or the feed.</p>
          </div>
        )}
      </section>
    </div>
  );
}
