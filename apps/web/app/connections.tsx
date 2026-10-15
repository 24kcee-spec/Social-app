"use client";

import type { ConnectionRequestView, ConnectionView, PersonSummary } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getConnectionsClient } from "../lib/connections";
import { getSignedMediaUrl } from "../lib/profile";

function Avatar({ person, url }: { person: PersonSummary; url?: string }) {
  if (url) {
    return <img className="avatar small" src={url} alt={`${person.displayName}'s profile`} />;
  }
  return (
    <div className="avatar small placeholder" aria-hidden="true">
      {person.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

const STATUS_TEXT = {
  pending: "Waiting. They can reply any time in the next two weeks.",
  accepted: "Connected",
  no_reply: "No reply yet. People reply on their own time.",
} as const;

export function Connections({
  onCount,
  onMessage,
}: {
  onCount?: (pending: number) => void;
  onMessage?: (userId: string) => void;
}) {
  const client = getConnectionsClient();
  const [incoming, setIncoming] = useState<ConnectionRequestView[]>([]);
  const [outgoing, setOutgoing] = useState<ConnectionRequestView[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [lowPressure, setLowPressure] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inc, out, con, settings] = await Promise.all([
        client.listRequests("incoming"),
        client.listRequests("outgoing"),
        client.listConnections(),
        client.getSettings(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setConnections(con);
      setLowPressure(settings.lowPressureMode);
      onCount?.(inc.length);
      const people = [
        ...inc.map((r) => r.other),
        ...out.map((r) => r.other),
        ...con.map((c) => c.other),
      ].filter((p) => p.thumbnailPath);
      const pairs = await Promise.all(
        people.map(async (p) => {
          try {
            return [p.userId, await getSignedMediaUrl(p.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        })
      );
      setPhotos(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setError(null);
    try {
      await fn();
      setNotice(message);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleLowPressure(next: boolean) {
    setError(null);
    try {
      const res = await client.setLowPressure(next);
      setLowPressure(res.lowPressureMode);
      setNotice(next ? "Low-pressure mode is on." : "Low-pressure mode is off.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-label="Connections" className="connections-page">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ RELATIONSHIPS</span>
          <h1 style={{ margin: "2px 0 0" }}>Connections & Hellos</h1>
        </div>
        <div className="discover-philosophy">
          <span className="discover-philosophy-dot" />
          <span>No obligation to reply immediately. Take things at your pace.</span>
        </div>
      </div>

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {notice && (
        <div className="notice ok" role="status">
          <span>{notice}</span>
        </div>
      )}

      {/* Low-pressure mode card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <label className="check" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={lowPressure}
            onChange={(e) => void toggleLowPressure(e.target.checked)}
          />
          <div>
            <strong>Low-pressure mode</strong>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              People can only send you a suggested opener (no free text). You never have to answer:
              requests quietly expire after two weeks, and a "Not now" is never shown to the sender.
            </p>
          </div>
        </label>
      </div>

      {loading ? (
        <div className="skeleton-card" style={{ minHeight: 180 }}>
          <div className="skeleton-shimmer skeleton-title" />
          <div className="skeleton-shimmer skeleton-line" />
          <div className="skeleton-shimmer skeleton-line short" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Incoming section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Said hi to you</h2>
              {incoming.length > 0 && <span className="nav-badge">{incoming.length}</span>}
            </div>

            {incoming.length === 0 ? (
              <div className="card" style={{ background: "var(--surface-sunken)" }}>
                <p className="muted" style={{ margin: 0 }}>
                  Nothing waiting. When someone says hi, it shows up here, and there is no rush to answer.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {incoming.map((r) => (
                  <div className="card request" key={r.id}>
                    <div className="person-head">
                      <Avatar person={r.other} url={photos[r.other.userId]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{r.other.displayName}</h3>
                        {r.other.bio ? (
                          <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>
                            {r.other.bio}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <blockquote className="intro-quote">"{r.intro.text}"</blockquote>

                    <div className="card-actions">
                      <button
                        onClick={() =>
                          void act(
                            () => client.accept(r.id),
                            `You are now connected with ${r.other.displayName}.`
                          )
                        }
                      >
                        Connect
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          void act(() => client.decline(r.id), "Done. They will not be told.")
                        }
                      >
                        Not now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active connections section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Your connections</h2>
              {connections.length > 0 && (
                <span className="badge-style">{connections.length}</span>
              )}
            </div>

            {connections.length === 0 ? (
              <div className="card" style={{ background: "var(--surface-sunken)" }}>
                <p className="muted" style={{ margin: 0 }}>
                  No connections yet. Say hi to someone in Discover. Pick an opener and you are done.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {connections.map((c) => (
                  <div className="card request" key={c.other.userId}>
                    <div className="person-head">
                      <Avatar person={c.other} url={photos[c.other.userId]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{c.other.displayName}</h3>
                        {c.other.bio ? (
                          <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.88rem" }}>
                            {c.other.bio}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="card-actions">
                      {onMessage && (
                        <button onClick={() => onMessage(c.other.userId)}>Message</button>
                      )}
                      <button
                        className="link danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${c.other.displayName} from your connections?`
                            )
                          ) {
                            void act(
                              () => client.removeConnection(c.other.userId),
                              "Connection removed."
                            );
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing hellos section */}
          {outgoing.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Your hellos</h2>
                <span className="badge-style">{outgoing.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {outgoing.map((r) => (
                  <div className="card request" key={r.id}>
                    <div className="person-head">
                      <Avatar person={r.other} url={photos[r.other.userId]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{r.other.displayName}</h3>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.86rem" }}>
                          {STATUS_TEXT[r.status]}
                        </p>
                      </div>
                    </div>

                    <blockquote className="intro-quote">"{r.intro.text}"</blockquote>

                    {r.status === "pending" && (
                      <div className="card-actions">
                        <button
                          className="secondary compact"
                          onClick={() => void act(() => client.withdraw(r.id), "Hello withdrawn.")}
                        >
                          Withdraw
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
