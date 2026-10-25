'use client';

import type { ConnectionRequestView, ConnectionView, PersonSummary } from '@sp/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../lib/auth';
import { getConnectionsClient } from '../lib/connections';
import { getSignedMediaUrl } from '../lib/profile';
import { getProductClient } from '../lib/product';
import { getPlatformClient } from '../lib/platform';
import type { PeopleContext } from '@sp/profile-client';
import { INTENT_LABELS, AVAILABILITY_LABELS } from './social-context';

type ConnectionLabel = 'friend' | 'classmate' | 'study' | 'sport' | 'networking' | 'other';
const LABELS: { value: ConnectionLabel; label: string }[] = [
  { value: 'friend', label: 'Friend' },
  { value: 'classmate', label: 'Classmate' },
  { value: 'study', label: 'Study' },
  { value: 'sport', label: 'Sport' },
  { value: 'networking', label: 'Networking' },
  { value: 'other', label: 'Other' },
];

function Avatar({ person, url }: { person: PersonSummary; url?: string }) {
  if (url) {
    return (
      <div
        style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}
      >
        <img
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          src={url}
          alt={`${person.displayName}'s profile`}
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div className="sidle-avatar-fallback" aria-hidden="true">
      {person.displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Verification({ person }: { person: PersonSummary }) {
  if (person.verificationLevel === 'student_verified')
    return (
      <span className="campus-badge" title="Academic email confirmed">
        ✓ Academic email
      </span>
    );
  if (person.verificationLevel === 'trusted')
    return (
      <span className="campus-badge trusted" title="Trusted community standing">
        ★ Trusted
      </span>
    );
  return null;
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
  const [savingLabel, setSavingLabel] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, ConnectionLabel>>({});
  const [search, setSearch] = useState('');
  const [labelFilter, setLabelFilter] = useState<'all' | ConnectionLabel>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contexts, setContexts] = useState<Record<string, PeopleContext>>({});
  const [contextNow, setContextNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setContextNow(Date.now());
      if (!connections.length) return;
      void getProductClient()
        .getPeopleContext(connections.map((connection) => connection.other.userId))
        .then((rows) => {
          if (alive) setContexts(Object.fromEntries(rows.map((row) => [row.userId, row])));
        })
        .catch(() => {
          if (alive) setContexts({});
        });
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [connections]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inc, out, con, settings] = await Promise.all([
        client.listRequests('incoming'),
        client.listRequests('outgoing'),
        client.listConnections(),
        getPlatformClient().getPreferences(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setConnections(con);
      setLabels(settings.labels as Record<string, ConnectionLabel>);
      onCount?.(inc.length);
      const people = [
        ...inc.map((request) => request.other),
        ...out.map((request) => request.other),
        ...con.map((connection) => connection.other),
      ].filter((person) => person.thumbnailPath);
      const pairs = await Promise.all(
        people.map(async (person) => {
          try {
            return [person.userId, await getSignedMediaUrl(person.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        }),
      );
      setPhotos(
        Object.fromEntries(
          pairs.filter((pair): pair is readonly [string, string] => pair !== null),
        ),
      );
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

  async function setPrivateLabel(userId: string, value: '' | ConnectionLabel) {
    setSavingLabel(true);
    setError(null);
    try {
      const next = { ...labels };
      if (value) next[userId] = value;
      else delete next[userId];
      const saved = await getPlatformClient().setPreferences({ labels: next });
      setLabels(saved.labels as Record<string, ConnectionLabel>);
      setNotice('Private label saved to your account across devices.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingLabel(false);
    }
  }

  const visibleConnections = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return connections.filter((connection) => {
      if (labelFilter !== 'all' && labels[connection.other.userId] !== labelFilter) return false;
      if (!needle) return true;
      return `${connection.other.displayName} ${connection.other.bio}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [connections, labelFilter, labels, search]);

  return (
    <section aria-label="Connections" className="connections-page">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ RELATIONSHIPS & NETWORK</span>
          <h1 style={{ margin: '2px 0 0' }}>Connections & hellos</h1>
          <div className="discover-philosophy" style={{ marginTop: 8 }}>
            <span>Manage your connections, new introductions and private relationship labels.</span>
          </div>
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
          <span>✓ {notice}</span>
          <button className="link" onClick={() => setNotice(null)} style={{ marginLeft: 'auto' }}>
            Dismiss
          </button>
        </div>
      )}

      <p className="muted">
        Connection and optional low-pressure preferences are in <a href="/settings">Settings</a>.
      </p>

      {loading ? (
        <div className="empty-state-card" aria-busy="true">
          <p className="muted">Loading your connections…</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          <section aria-labelledby="incoming-title">
            <div className="sidle-list-heading">
              <div>
                <span className="eyebrow">WAITING FOR YOU</span>
                <h2 id="incoming-title">Hellos received</h2>
              </div>
              {incoming.length > 0 && (
                <span className="nav-badge" aria-label={`${incoming.length} pending`}>
                  {incoming.length}
                </span>
              )}
            </div>
            {incoming.length === 0 ? (
              <div className="card sidle-soft-card">
                <p className="muted">
                  No pending hellos right now. When someone breaks the ice, it will quietly appear
                  here.
                </p>
              </div>
            ) : (
              <div className="sidle-people-grid">
                {incoming.map((request) => (
                  <article className="card sidle-connection-card" key={request.id}>
                    <div className="sidle-person-row">
                      <Avatar person={request.other} url={photos[request.other.userId]} />
                      <div style={{ minWidth: 0 }}>
                        <div className="sidle-name-badges">
                          <h3>{request.other.displayName}</h3>
                          <Verification person={request.other} />
                        </div>
                        {request.other.bio && (
                          <p className="muted sidle-one-line">{request.other.bio}</p>
                        )}
                      </div>
                    </div>
                    <div className="prompt-quote-box">
                      <div className="prompt-question">✦ Opener sent to you</div>
                      <p className="prompt-answer">“{request.intro.text}”</p>
                    </div>
                    <div className="sidle-card-actions-wide">
                      <button
                        onClick={() =>
                          void act(
                            () => client.accept(request.id),
                            `You and ${request.other.displayName} are now connected.`,
                          )
                        }
                      >
                        Accept hello
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          void act(
                            () => client.decline(request.id),
                            'Passed quietly. They will not be notified.',
                          )
                        }
                      >
                        Pass quietly
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="connections-title">
            <div className="sidle-list-heading sidle-list-heading-wrap">
              <div>
                <span className="eyebrow">YOUR CIRCLE</span>
                <h2 id="connections-title">Connections</h2>
              </div>
              <div className="sidle-connection-tools">
                <label className="sidle-sr-only" htmlFor="connection-search">
                  Search connections
                </label>
                <input
                  id="connection-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search connections…"
                  autoComplete="off"
                />
                <label className="sidle-sr-only" htmlFor="connection-label-filter">
                  Filter by private label
                </label>
                <select
                  id="connection-label-filter"
                  value={labelFilter}
                  onChange={(event) =>
                    setLabelFilter(event.target.value as 'all' | ConnectionLabel)
                  }
                >
                  <option value="all">All private labels</option>
                  {LABELS.map((label) => (
                    <option key={label.value} value={label.value}>
                      {label.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: -4 }}>
              Labels are private and synced to your account for now; the other person cannot see
              them.
            </p>

            {connections.length === 0 ? (
              <div className="card sidle-soft-card">
                <p className="muted">
                  No connections yet. Discover gives you contextual openers so a first hello does
                  not have to feel awkward.
                </p>
              </div>
            ) : visibleConnections.length === 0 ? (
              <div className="card sidle-soft-card">
                <p className="muted">No connections match this search or private label.</p>
                <button
                  className="link"
                  onClick={() => {
                    setSearch('');
                    setLabelFilter('all');
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="sidle-people-grid">
                {visibleConnections.map((connection) => {
                  const privateLabel = labels[connection.other.userId] ?? '';
                  return (
                    <article className="card sidle-connection-card" key={connection.other.userId}>
                      <div className="sidle-person-row">
                        <Avatar person={connection.other} url={photos[connection.other.userId]} />
                        <div style={{ minWidth: 0 }}>
                          <div className="sidle-name-badges">
                            <h3>{connection.other.displayName}</h3>
                            <Verification person={connection.other} />
                          </div>
                          <p className="muted" style={{ margin: '2px 0 0', fontSize: '.8rem' }}>
                            Connected {new Date(connection.connectedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {connection.other.bio && (
                        <p className="muted" style={{ fontSize: '.88rem' }}>
                          {connection.other.bio}
                        </p>
                      )}
                      {contexts[connection.other.userId] && (
                        <div className="shared-interests-row">
                          {contexts[connection.other.userId]!.intents.map((intent) => (
                            <span className="social-style-tag" key={intent}>
                              {INTENT_LABELS[intent]}
                            </span>
                          ))}
                          {contexts[connection.other.userId]!.availability &&
                            Date.parse(contexts[connection.other.userId]!.expiresAt ?? '') >
                              contextNow && (
                              <span className="social-style-tag">
                                {
                                  AVAILABILITY_LABELS[
                                    contexts[connection.other.userId]!.availability!
                                  ]
                                }
                              </span>
                            )}
                        </div>
                      )}
                      <label className="sidle-private-label-field">
                        <span>Private label</span>
                        <select
                          value={privateLabel}
                          disabled={savingLabel}
                          onChange={(event) =>
                            void setPrivateLabel(
                              connection.other.userId,
                              event.target.value as '' | ConnectionLabel,
                            )
                          }
                        >
                          <option value="">No label</option>
                          {LABELS.map((label) => (
                            <option key={label.value} value={label.value}>
                              {label.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {onMessage && (
                        <button
                          style={{ width: '100%', marginTop: 'auto' }}
                          onClick={() => onMessage(connection.other.userId)}
                        >
                          Message
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {outgoing.length > 0 && (
            <section aria-labelledby="outgoing-title">
              <div className="sidle-list-heading">
                <div>
                  <span className="eyebrow">OUTGOING</span>
                  <h2 id="outgoing-title">Hellos you sent</h2>
                </div>
                <span className="nav-badge">{outgoing.length}</span>
              </div>
              <div className="sidle-people-grid">
                {outgoing.map((request) => (
                  <article className="card sidle-connection-card" key={request.id}>
                    <div className="sidle-person-row">
                      <Avatar person={request.other} url={photos[request.other.userId]} />
                      <div>
                        <div className="sidle-name-badges">
                          <h3>{request.other.displayName}</h3>
                          <Verification person={request.other} />
                        </div>
                        <span className="muted" style={{ fontSize: '.78rem' }}>
                          Awaiting response
                        </span>
                      </div>
                    </div>
                    <div className="prompt-quote-box">
                      <p className="prompt-answer">“{request.intro.text}”</p>
                    </div>
                    <button
                      className="link"
                      onClick={() =>
                        void act(() => client.withdraw(request.id), 'Hello withdrawn.')
                      }
                    >
                      Withdraw hello
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
