"use client";

import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getDiscoveryClient } from "../lib/discovery";
import { getSignedMediaUrl } from "../lib/profile";
import { SayHi } from "./say-hi";
import { ReportModal } from "./report-modal";
import { ShareModal } from "./share-modal";

const STYLE_LABELS: Record<SocialStyle, string> = {
  small_group: "Small groups",
  one_to_one: "One-to-one",
  text_first: "Text-first",
  voice_first: "Voice-first",
  low_pressure: "Low pressure",
};

const PAGE = 12;

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
  const [reportingProfile, setReportingProfile] = useState<{ id: string; displayName: string } | null>(null);
  const [filterStyle, setFilterStyle] = useState<string>("all");
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
    setNotice(`${card.displayName} will appear less frequently in your suggestions.`);
  }

  async function block(card: DiscoveryCard) {
    if (!window.confirm(`Block ${card.displayName}? You will not see each other anywhere in the app.`)) return;
    try {
      await client.block(card.userId);
      setPeople((p) => p.filter((x) => x.userId !== card.userId));
      setNotice(`${card.displayName} has been blocked.`);
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

  const filteredPeople = people.filter((p) => {
    if (filterStyle === "all") return true;
    if (filterStyle === "shared") return p.sharedInterests.length > 0;
    return p.socialStyles.includes(filterStyle as SocialStyle);
  });

  return (
    <section aria-label="Discover people" className="discover-page-head">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ FOR YOU</span>
          <h1 style={{ margin: "2px 0 0" }}>Discover people</h1>
          <p className="muted" style={{ margin: "6px 0 0", maxWidth: 520 }}>
            Matched on shared interests and social pace. No popularity contests, just people you will click with.
          </p>
        </div>
      </div>
      <div className="filter-chips" role="group" aria-label="Filter introductions">
        {([["all", "All"], ["shared", "Shared passions"], ["low_pressure", "🌿 Low pressure"], ["small_group", "👥 Small groups"]] as const).map(([k, label]) => (
          <button key={k} className={`chip-btn ${filterStyle === k ? "on" : ""}`} aria-pressed={filterStyle === k} onClick={() => setFilterStyle(k)}>{label}</button>
        ))}
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
          <span>✓ {notice}</span>
          <button className="link" onClick={() => setNotice(null)} style={{ marginLeft: "auto" }}>Dismiss</button>
        </div>
      )}

      {!loading && people.length > 0 && (
        <div className="stories-row" aria-label="Fresh introductions">
          {people.slice(0, 12).map((p) => (
            <button
              key={p.userId}
              className="story"
              onClick={() => document.getElementById(`card-${p.userId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              <span className="story-ring">
                {photos[p.userId] ? <img src={photos[p.userId]} alt="" /> : <span>{p.displayName.charAt(0).toUpperCase()}</span>}
              </span>
              <span className="story-name">{p.displayName.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="discover-grid" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div className="card" key={i} style={{ minHeight: 320, opacity: 0.6 }}>
              <div style={{ height: 160, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", marginBottom: 16 }} />
              <div style={{ height: 24, width: "60%", background: "var(--surface-sunken)", borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 16, width: "85%", background: "var(--surface-sunken)", borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : filteredPeople.length === 0 ? (
        /* Empty State & Community Spotlight Preview */
        <div>
          <div className="empty-state-card" style={{ marginBottom: 36 }}>
            <div className="empty-state-icon">✦</div>
            <h2>You're all caught up!</h2>
            <p className="muted" style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              You've explored everyone currently matching your interests and privacy settings. As more people join or when you add new passions in your profile, new matches will appear here.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="secondary compact" onClick={() => void load()}>
                Refresh matches
              </button>
            </div>
          </div>

          <div className="card invite-card">
            <h2>Grow your circle</h2>
            <p className="muted">The best introductions come from real friends. Invite someone, or add more interests and prompts so we can match you better.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => { const t = "Join me on Sidle — a calm place to find people, conversations and plans at your pace."; if (navigator.share) { void navigator.share({ title: "Sidle", text: t, url: window.location.origin }).catch(() => undefined); } else { void navigator.clipboard?.writeText(`${t} ${window.location.origin}`); setNotice("Invite link copied."); } }}>Invite a friend</button>
            </div>
          </div>
        </div>
      ) : (
        /* Real API Cards Grid */
        <div className="discover-grid">
          {filteredPeople.map((card) => {
            const isOpen = open === card.userId;
            const isGreeting = greeting === card.userId;
            const photoUrl = photos[card.userId];

            return (
              <article className="profile-card" id={`card-${card.userId}`} key={card.userId}>
                <div className="profile-card-cover">
                  {photoUrl ? (
                    <img src={photoUrl} alt={card.displayName} />
                  ) : (
                    <span className="profile-card-initial">{card.displayName.charAt(0).toUpperCase()}</span>
                  )}
                  <div className="profile-card-scrim" />
                  <div className="profile-card-cover-badges">
                    <span className="social-style-tag">
                      {card.socialStyles.map((s) => STYLE_LABELS[s]).join(" · ") || "Community Member"}
                    </span>
                    {card.sharedInterests.length > 0 && (
                      <span className="social-style-tag" style={{ background: "var(--accent)" }}>
                        {card.sharedInterests.length} shared passions
                      </span>
                    )}
                  </div>
                </div>

                <div className="profile-card-body">
                  <div className="profile-name-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div className="profile-card-name">{card.displayName}</div>
                    {card.verificationLevel === "student_verified" && (
                      <span className="campus-badge" title="Campus Verified Student">✓ Campus Verified</span>
                    )}
                    {card.verificationLevel === "trusted" && (
                      <span className="campus-badge trusted" title="Trusted Community Member">★ Trusted</span>
                    )}
                  </div>

                  {card.bio && <p className="profile-card-bio">{card.bio}</p>}

                  {/* Interests */}
                  <div className="shared-interests-row">
                    {card.interests.slice(0, isOpen ? 12 : 5).map((interest) => {
                      const isShared = card.sharedInterests.some((s) => s.id === interest.id);
                      return (
                        <span
                          key={interest.id}
                          className={`shared-chip ${isShared ? "highlight" : ""}`}
                        >
                          {interest.name}
                        </span>
                      );
                    })}
                  </div>

                  {/* Prompt Answers */}
                  {card.prompts.length > 0 && card.prompts[0] && (
                    <div className="prompt-quote-box">
                      <div className="prompt-question">✦ {card.prompts[0].prompt}</div>
                      <p className="prompt-answer">"{card.prompts[0].answer}"</p>
                    </div>
                  )}

                  {/* Expanded Prompts */}
                  {isOpen && card.prompts.length > 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                      {card.prompts.slice(1).map((p) => (
                        <div key={p.promptId} className="prompt-quote-box">
                          <div className="prompt-question">✦ {p.prompt}</div>
                          <p className="prompt-answer">"{p.answer}"</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions Footer */}
                  <div className="profile-card-footer">
                    <div style={{ display: "flex", gap: 8 }}>
                      {card.relation === "none" && card.messagePermission !== "nobody" && (
                        <button
                          className="compact"
                          onClick={() => setGreeting(isGreeting ? null : card.userId)}
                        >
                          Say hi
                        </button>
                      )}
                      <button className="secondary compact" onClick={() => toggle(card)}>
                        {isOpen ? "Less" : "Profile"}
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
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
                      <button className="secondary compact" onClick={() => skip(card)} title="Skip for now">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>

                {/* Say Hi Modal */}
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

      {reportingProfile && (
        <ReportModal
          targetType="profile"
          targetId={reportingProfile.id}
          targetLabel={reportingProfile.displayName}
          onClose={() => setReportingProfile(null)}
        />
      )}

      {/* Pagination */}
      {!loading && hasMore && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button className="secondary" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Loading more students…" : "Show more people"}
          </button>
        </div>
      )}

      {/* Blocked members footer toggle */}
      <div style={{ textAlign: "center", marginTop: 40 }}>
        <button
          className="link"
          style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}
          onClick={() => void (blocks ? setBlocks(null) : showBlocks())}
        >
          {blocks ? "Hide blocked people" : "Manage blocked people"}
        </button>
      </div>

      {blocks && (
        <section className="card" style={{ marginTop: 20, maxWidth: 600, margin: "20px auto 0" }}>
          <span className="eyebrow">SAFETY</span>
          <h3>Blocked members</h3>
          <p className="muted">Blocked members cannot see your profile or message you.</p>
          {blocks.length === 0 ? (
            <p className="muted" style={{ fontStyle: "italic" }}>You have not blocked anyone.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
              {blocks.map((b) => (
                <li key={b.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
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
