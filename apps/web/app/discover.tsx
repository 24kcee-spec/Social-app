"use client";

import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getDiscoveryClient } from "../lib/discovery";
import { getSignedMediaUrl } from "../lib/profile";
import { SayHi } from "./say-hi";

const STYLE_LABELS: Record<SocialStyle, string> = {
  small_group: "Small groups",
  one_to_one: "One-to-one",
  text_first: "Text-first",
  voice_first: "Voice-first",
  low_pressure: "Low pressure",
};

const PAGE = 12;

import { ReportModal } from "./report-modal";
import { ShareModal } from "./share-modal";

export function Discover() {
  const client = getDiscoveryClient();
  const [people, setPeople] = useState<DiscoveryCard[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [sharingProfile, setSharingProfile] = useState<{ id: string; displayName: string; bio?: string } | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const loadPhotos = useCallback(async (cards: DiscoveryCard[]) => {
    const pairs = await Promise.all(
      cards
        .filter((c) => c.thumbnailPath)
        .map(async (c) => {
          try {
            return [c.userId, await getSignedMediaUrl(c.thumbnailPath!)] as const;
          } catch {
            return null;
          }
        })
    );
    setPhotos((current) => ({
      ...current,
      ...Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)),
    }));
  }, []);

  const track = useCallback(
    (cards: DiscoveryCard[]) => {
      const fresh = cards.filter((c) => !seen.current.has(c.userId));
      fresh.forEach((c) => seen.current.add(c.userId));
      if (fresh.length) {
        void client
          .recordEvents(fresh.map((c) => ({ candidateId: c.userId, type: "impression" as const })))
          .catch(() => undefined);
      }
    },
    [client]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const feed = await client.getPeople(PAGE, 0);
      setPeople(feed.people);
      setHasMore(feed.hasMore);
      track(feed.people);
      void loadPhotos(feed.people);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client, loadPhotos, track]);

  useEffect(() => {
    void load();
  }, [load]);

  async function more() {
    setLoadingMore(true);
    setError(null);
    try {
      const feed = await client.getPeople(PAGE, people.length);
      const known = new Set(people.map((p) => p.userId));
      const added = feed.people.filter((p) => !known.has(p.userId));
      setPeople([...people, ...added]);
      setHasMore(feed.hasMore);
      track(added);
      void loadPhotos(added);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(card: DiscoveryCard) {
    const next = open === card.userId ? null : card.userId;
    setOpen(next);
    if (next) {
      void client.recordEvents([{ candidateId: card.userId, type: "open" }]).catch(() => undefined);
    }
  }

  function skip(card: DiscoveryCard) {
    setPeople((p) => p.filter((x) => x.userId !== card.userId));
    void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined);
    setNotice(`${card.displayName} will be shown less frequently.`);
  }

  async function block(card: DiscoveryCard) {
    if (!window.confirm(`Block ${card.displayName}? You will not see each other anywhere in the app.`)) return;
    try {
      await client.block(card.userId);
      setPeople((p) => p.filter((x) => x.userId !== card.userId));
      setNotice(`${card.displayName} is blocked. You can undo this under Blocked people.`);
      if (blocks) setBlocks(await client.listBlocks());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function showBlocks() {
    try {
      setBlocks(await client.listBlocks());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function unblock(id: string) {
    try {
      await client.unblock(id);
      setBlocks((b) => (b ?? []).filter((x) => x.userId !== id));
      setNotice("Unblocked. They can appear in your suggestions again.");
      void load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section aria-label="Discover people" className="app-page-head">
      {/* Editorial Header */}
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">CURATED INTRODUCTIONS</span>
          <h1>Discover people</h1>
          <div className="discover-philosophy">
            <span className="discover-philosophy-dot" aria-hidden="true" />
            <span>Introductions are matched on mutual interests and social rhythms. No popularity rankings.</span>
          </div>
        </div>

        <button className="secondary compact" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh suggestions"}
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {notice && (
        <div className="notice ok" role="status">
          <span>{notice}</span>
          <button className="link" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {/* Skeletons while initial loading */}
      {loading ? (
        <div className="discover-grid" aria-busy="true" aria-label="Loading suggestions">
          {[1, 2, 3].map((i) => (
            <div className="skeleton-card" key={i}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div className="skeleton-avatar skeleton-shimmer" />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="skeleton-title skeleton-shimmer" />
                  <div className="skeleton-line short skeleton-shimmer" />
                </div>
              </div>
              <div className="skeleton-line skeleton-shimmer" style={{ height: 38 }} />
              <div className="skeleton-line skeleton-shimmer" style={{ height: 48 }} />
              <div className="skeleton-line skeleton-shimmer" style={{ marginTop: "auto", height: 36 }} />
            </div>
          ))}
        </div>
      ) : people.length === 0 && !error ? (
        /* Empty State */
        <div className="discover-empty">
          <div className="discover-empty-icon" aria-hidden="true">✦</div>
          <h2>No new introductions right now</h2>
          <p className="muted">
            You have seen everyone that matches your current interests and privacy preferences.
          </p>
          <p className="muted" style={{ fontSize: "0.86rem" }}>
            Try expanding your profile prompts and interests, or check back soon as more community members join.
          </p>
          <button className="secondary compact" style={{ marginTop: 12 }} onClick={() => void load()}>
            Check again
          </button>
        </div>
      ) : (
        /* Cards Grid */
        <div className="discover-grid">
          {people.map((card) => {
            const isOpen = open === card.userId;
            const isGreeting = greeting === card.userId;
            const photoUrl = photos[card.userId];

            return (
              <article className="discover-card" key={card.userId}>
                {/* Header: Photo + Name + Social Styles */}
                <div className="discover-card-top">
                  {photoUrl ? (
                    <img className="discover-avatar" src={photoUrl} alt={`${card.displayName}'s profile`} />
                  ) : (
                    <div className="discover-avatar-fallback" aria-hidden="true">
                      {card.displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className="discover-card-heading">
                    <h2>{card.displayName}</h2>
                    <div className="badge-row">
                      {card.socialStyles.map((s) => (
                        <span className="badge-style" key={s}>
                          {STYLE_LABELS[s]}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Match Reasons Callout */}
                {card.reasons.length > 0 && (
                  <ul className="discover-reasons" aria-label="Recommendation reasons">
                    {card.reasons.slice(0, isOpen ? 5 : 2).map((r) => (
                      <li key={r.code}>{r.text}</li>
                    ))}
                  </ul>
                )}

                {/* Bio */}
                {card.bio && <p className="discover-bio">{card.bio}</p>}

                {/* Interest Chips: Shared vs Other */}
                <div className="discover-chips-group">
                  <span className="discover-chips-label">Interests</span>
                  <div className="discover-chips">
                    {card.interests.slice(0, isOpen ? 12 : 5).map((interest) => {
                      const isShared = card.sharedInterests.some((s) => s.id === interest.id);
                      return (
                        <span
                          key={interest.id}
                          className={isShared ? "chip-shared" : "chip-neutral"}
                          title={isShared ? "Shared interest" : undefined}
                        >
                          {interest.name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded Profile Prompts */}
                {isOpen && card.prompts.length > 0 && (
                  <div className="discover-prompts-section">
                    <span className="discover-chips-label">Prompt Responses</span>
                    {card.prompts.map((p) => (
                      <div className="discover-prompt-card" key={p.promptId}>
                        <div className="discover-prompt-question">{p.prompt}</div>
                        <p className="discover-prompt-answer">"{p.answer}"</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Say Hi Interactive Opener Form */}
                {isGreeting && (
                  <SayHi
                    card={card}
                    onClose={() => setGreeting(null)}
                    onSent={(msg) => {
                      setGreeting(null);
                      setNotice(msg);
                      void load();
                    }}
                  />
                )}

                {/* Relationship status messages */}
                {card.relation === "pending_in" && (
                  <div className="discover-relation-status">
                    <strong>{card.displayName} said hi to you.</strong> Open Connections to reply.
                  </div>
                )}

                {card.relation === "pending_out" && (
                  <div className="discover-relation-status">
                    You sent an introduction. They can respond whenever they are ready.
                  </div>
                )}

                {/* Actions Footer */}
                <div className="discover-actions">
                  {card.relation === "none" && (
                    card.messagePermission === "nobody" ? (
                      <span className="muted" style={{ fontSize: "0.82rem" }}>Not accepting new connections</span>
                    ) : (
                      <button
                        className="compact"
                        onClick={() => setGreeting(isGreeting ? null : card.userId)}
                        aria-expanded={isGreeting}
                      >
                        {isGreeting ? "Close opener" : "Say hi"}
                      </button>
                    )
                  )}

                  <button
                    className="secondary compact"
                    onClick={() => toggle(card)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Show less" : "View profile"}
                  </button>

                  <button
                    type="button"
                    className="secondary compact"
                    onClick={() =>
                      setSharingProfile({
                        id: card.userId,
                        displayName: card.displayName,
                        bio: card.bio,
                      })
                    }
                  >
                    Share
                  </button>

                  <button className="secondary compact" onClick={() => skip(card)}>
                    Not now
                  </button>

                  <button
                    type="button"
                    className="link block-link"
                    onClick={() => void block(card)}
                  >
                    Block
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sharingProfile && (
        <ShareModal
          targetType="profile"
          targetId={sharingProfile.id}
          title={sharingProfile.displayName}
          description={sharingProfile.bio}
          onClose={() => setSharingProfile(null)}
        />
      )}

      {/* Pagination */}
      {!loading && hasMore && (
        <div className="center">
          <button className="secondary" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Loading more…" : "Show more people"}
          </button>
        </div>
      )}

      {/* Blocked People Management */}
      <div className="center" style={{ marginTop: 32 }}>
        <button
          className="link"
          style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}
          onClick={() => void (blocks ? setBlocks(null) : showBlocks())}
        >
          {blocks ? "Hide blocked people" : "Manage blocked people"}
        </button>
      </div>

      {blocks && (
        <section className="blocked-section" aria-label="Blocked members">
          <h3>Blocked people</h3>
          <p className="muted">Blocked members cannot see your profile, and you will not see them anywhere.</p>
          {blocks.length === 0 ? (
            <p className="muted" style={{ fontStyle: "italic" }}>You have not blocked anyone.</p>
          ) : (
            <ul className="device-list">
              {blocks.map((b) => (
                <li key={b.userId}>
                  <span style={{ fontWeight: 600 }}>{b.displayName}</span>
                  <button className="secondary compact" onClick={() => void unblock(b.userId)}>
                    Unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
