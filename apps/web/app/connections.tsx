"use client";

import type { ConnectionRequestView, ConnectionView, PersonSummary } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getConnectionsClient } from "../lib/connections";
import { getSignedMediaUrl } from "../lib/profile";

function Avatar({ person, url }: { person: PersonSummary; url?: string }) {
  if (url) {
    return (
      <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0 }}>
        <img style={{ width: "100%", height: "100%", objectFit: "cover" }} src={url} alt={`${person.displayName}'s profile`} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #6366F1 0%, #06B6D4 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: "1.1rem",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {person.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

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
      setNotice(next ? "Low-pressure mode enabled." : "Low-pressure mode disabled.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-label="Connections" className="connections-page">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ RELATIONSHIPS & NETWORK</span>
          <h1 style={{ margin: "2px 0 0" }}>Connections & Hellos</h1>
          <div className="discover-philosophy" style={{ marginTop: 8 }}>
            <span>🌿 Take things at your own rhythm. No read receipts or pressure to reply immediately.</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {notice && (
        <div className="notice ok" role="status">
          <span>✓ {notice}</span>
          <button className="link" onClick={() => setNotice(null)} style={{ marginLeft: "auto" }}>Dismiss</button>
        </div>
      )}

      {/* Low-pressure mode card with modern switch */}
      <label className="switch-row" style={{ marginBottom: 28, padding: 18 }}>
        <div className="switch-label-group">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "1.2rem" }}>🌿</span>
            <span className="switch-title" style={{ fontSize: "1.05rem" }}>Low-Pressure Mode</span>
          </div>
          <span className="switch-desc" style={{ marginTop: 4 }}>
            People can only send you polite suggested conversation starters (no unrestricted free text). You never have to reply: requests quietly expire after two weeks, and a "Not now" is never disclosed to the sender.
          </span>
        </div>
        <div className="toggle-switch">
          <input
            type="checkbox"
            checked={lowPressure}
            onChange={(e) => void toggleLowPressure(e.target.checked)}
          />
          <span className="toggle-slider" />
        </div>
      </label>

      {loading ? (
        <div className="empty-state-card">
          <p className="muted">Loading your connections…</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {/* Incoming Hellos Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="eyebrow" style={{ margin: 0 }}>WAITING FOR YOU</span>
              <h2>Hellos Received</h2>
              {incoming.length > 0 && <span className="nav-badge">{incoming.length}</span>}
            </div>

            {incoming.length === 0 ? (
              <div className="card" style={{ background: "var(--surface-sunken)", padding: "28px", textAlign: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  No pending hellos right now. When someone breaks the ice, it will quietly appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
                {incoming.map((r) => (
                  <div className="card" key={r.id} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                      <Avatar person={r.other} url={photos[r.other.userId]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{r.other.displayName}</h3>
                        {r.other.bio && (
                          <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {r.other.bio}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="prompt-quote-box" style={{ margin: "0 0 16px" }}>
                      <div className="prompt-question">✦ Opener sent to you</div>
                      <p className="prompt-answer">"{r.intro.text}"</p>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
                      <button
                        style={{ flex: 1 }}
                        onClick={() =>
                          void act(
                            () => client.accept(r.id),
                            `You and ${r.other.displayName} are now connected! Go to Messages to chat.`
                          )
                        }
                      >
                        Accept & Say Hi Back
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          void act(() => client.decline(r.id), "Passed quietly. They will not be notified.")
                        }
                      >
                        Pass
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Connections Section */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="eyebrow" style={{ margin: 0 }}>MUTUAL CIRCLE</span>
              <h2>Your Connections</h2>
              {connections.length > 0 && (
                <span className="nav-badge" style={{ background: "var(--success)" }}>{connections.length}</span>
              )}
            </div>

            {connections.length === 0 ? (
              <div className="card" style={{ background: "var(--surface-sunken)", padding: "28px", textAlign: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  You don't have active connections yet. Explore Discover, pick a conversation starter, and send your first hello!
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                {connections.map((c) => (
                  <div className="card" key={c.other.userId} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
                      <Avatar person={c.other} url={photos[c.other.userId]} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0 }}>{c.other.displayName}</h3>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: "0.82rem" }}>
                          Connected · Ready to chat
                        </p>
                      </div>
                    </div>

                    {c.other.bio && (
                      <p className="muted" style={{ fontSize: "0.88rem", marginBottom: 16, lineHeight: 1.4 }}>
                        {c.other.bio}
                      </p>
                    )}

                    <div style={{ marginTop: "auto" }}>
                      {onMessage && (
                        <button
                          style={{ width: "100%" }}
                          onClick={() => onMessage(c.other.userId)}
                        >
                          💬 Send Message
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing Hellos Section */}
          {outgoing.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span className="eyebrow" style={{ margin: 0 }}>OUTGOING</span>
                <h2>Hellos You Sent ({outgoing.length})</h2>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
                {outgoing.map((r) => (
                  <div className="card" key={r.id}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                      <Avatar person={r.other} url={photos[r.other.userId]} />
                      <div>
                        <h3 style={{ margin: 0 }}>{r.other.displayName}</h3>
                        <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          Sent · Awaiting response
                        </span>
                      </div>
                    </div>
                    <p className="prompt-quote-box" style={{ fontSize: "0.88rem", margin: "10px 0 0" }}>
                      "{r.intro.text}"
                    </p>
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
