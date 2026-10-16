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
      {/* Hero Welcome Banner */}
      <div className="hero-banner">
        <div className="hero-banner-inner">
          <div className="hero-content">
            <span className="eyebrow">✦ CURATED CONNECTIONS</span>
            <h1>Discover your campus circle</h1>
            <p className="muted" style={{ maxWidth: 480 }}>
              Matched purely on shared interests, favorite hobbies, and social pace. No algorithms optimizing for doomscrolling or vanity metrics.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              <button
                className={`compact ${filterStyle === "all" ? "" : "secondary"}`}
                onClick={() => setFilterStyle("all")}
              >
                All introductions
              </button>
              <button
                className={`compact ${filterStyle === "shared" ? "" : "secondary"}`}
                onClick={() => setFilterStyle("shared")}
              >
                Shared passions
              </button>
              <button
                className={`compact ${filterStyle === "low_pressure" ? "" : "secondary"}`}
                onClick={() => setFilterStyle("low_pressure")}
              >
                🌿 Low pressure
              </button>
              <button
                className={`compact ${filterStyle === "small_group" ? "" : "secondary"}`}
                onClick={() => setFilterStyle("small_group")}
              >
                👥 Small groups
              </button>
            </div>
          </div>
          <div className="hero-image-wrap">
            <img src="/images/hero_community.jpg" alt="Campus community" />
          </div>
        </div>
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
            <h2>You're all caught up on new introductions!</h2>
            <p className="muted" style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              You've explored everyone currently matching your interests and privacy settings. As more classmates join or when you add new passions in your profile, new matches will appear here.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="secondary compact" onClick={() => void load()}>
                Refresh matches
              </button>
            </div>
          </div>

          {/* Interactive Community Spotlight Showcase */}
          <div style={{ marginBottom: 20 }}>
            <span className="eyebrow">CAMPUS SPOTLIGHT · ACTIVE MEMBERS</span>
            <h2>Get inspired by how others connect</h2>
            <p className="muted">See how fellow students share their energy with conversation starters and prompt cards.</p>
          </div>

          <div className="discover-grid">
            {/* Spotlight Student 1: Maya */}
            <article className="profile-card">
              <div className="profile-card-cover">
                <img src="/images/avatar_maya.jpg" alt="Maya Lin" />
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">🌿 Low pressure · Small groups</span>
                  <span className="social-style-tag" style={{ background: "rgba(16, 185, 129, 0.85)" }}>Verified Student</span>
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">Maya Lin</div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>NUST · Bulawayo</span>
                </div>
                <p className="profile-card-bio">
                  Architecture & Design student. Passionate about urban photography, Afrobeats playlists, and low-key coffee study dates.
                </p>

                <div className="shared-interests-row">
                  <span className="shared-chip highlight">Afrobeats</span>
                  <span className="shared-chip highlight">Design</span>
                  <span className="shared-chip highlight">Photography</span>
                  <span className="shared-chip">Study Groups</span>
                  <span className="shared-chip">Nature</span>
                </div>

                <div className="prompt-quote-box">
                  <div className="prompt-question">✦ My ideal weekend looks like...</div>
                  <p className="prompt-answer">"Browsing local art galleries, listening to Amapiano on repeat, and sketching downtown buildings."</p>
                </div>

                <div className="profile-card-footer">
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Active this week</span>
                  <button
                    className="compact"
                    onClick={() =>
                      setNotice("Maya will see your interest! Connect your live Supabase database to exchange real-time messages.")
                    }
                  >
                    Say hi
                  </button>
                </div>
              </div>
            </article>

            {/* Spotlight Student 2: Liam */}
            <article className="profile-card">
              <div className="profile-card-cover">
                <img src="/images/avatar_kuda.jpg" alt="Liam Ncube" />
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">💬 One-to-one · Text-first</span>
                  <span className="social-style-tag" style={{ background: "rgba(99, 102, 241, 0.85)" }}>NUST Campus</span>
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">Liam Ncube</div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Computer Science</span>
                </div>
                <p className="profile-card-bio">
                  Building tech products and studying AI. Huge fan of weekend football, FIFA tournaments, and exploring tech startups in Zimbabwe.
                </p>

                <div className="shared-interests-row">
                  <span className="shared-chip highlight">Artificial Intelligence</span>
                  <span className="shared-chip highlight">FIFA / EA FC</span>
                  <span className="shared-chip highlight">Programming</span>
                  <span className="shared-chip">Football</span>
                  <span className="shared-chip">Investing</span>
                </div>

                <div className="prompt-quote-box">
                  <div className="prompt-question">✦ I can talk about this for hours...</div>
                  <p className="prompt-answer">"Building mobile apps for Africa, modern fintech, and whether Manchester City will win the treble again."</p>
                </div>

                <div className="profile-card-footer">
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Active today</span>
                  <button
                    className="compact"
                    onClick={() =>
                      setNotice("Liam will see your greeting! Connect your live Supabase database to start chatting.")
                    }
                  >
                    Say hi
                  </button>
                </div>
              </div>
            </article>

            {/* Spotlight Student 3: Tariro */}
            <article className="profile-card">
              <div className="profile-card-cover">
                <img src="/images/avatar_tariro.jpg" alt="Tariro Mpofu" />
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">🎧 Low pressure · Music first</span>
                  <span className="social-style-tag" style={{ background: "rgba(244, 63, 94, 0.85)" }}>Verified Student</span>
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">Tariro Mpofu</div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Media & Communications</span>
                </div>
                <p className="profile-card-bio">
                  Podcasting on campus life, searching for the best matcha lattes, and curating warm Sunday afternoon Spotify playlists.
                </p>

                <div className="shared-interests-row">
                  <span className="shared-chip highlight">Afrobeats</span>
                  <span className="shared-chip highlight">Amapiano</span>
                  <span className="shared-chip highlight">Photography</span>
                  <span className="shared-chip">Books</span>
                  <span className="shared-chip">Fashion</span>
                </div>

                <div className="prompt-quote-box">
                  <div className="prompt-question">✦ The best way to get to know me is...</div>
                  <p className="prompt-answer">"Share your top 3 songs of the month, or invite me to an outdoor campus walk when it's sunny."</p>
                </div>

                <div className="profile-card-footer">
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Active 20m ago</span>
                  <button
                    className="compact"
                    onClick={() =>
                      setNotice("Tariro will see your note! Connect your live database to exchange messages.")
                    }
                  >
                    Say hi
                  </button>
                </div>
              </div>
            </article>

            {/* Spotlight Student 4: Farai */}
            <article className="profile-card">
              <div className="profile-card-cover">
                <img src="/images/avatar_farai.jpg" alt="Farai Moyo" />
                <div className="profile-card-scrim" />
                <div className="profile-card-cover-badges">
                  <span className="social-style-tag">👥 Small groups · Creative</span>
                  <span className="social-style-tag" style={{ background: "rgba(16, 185, 129, 0.85)" }}>Design Club Lead</span>
                </div>
              </div>

              <div className="profile-card-body">
                <div className="profile-name-row">
                  <div className="profile-card-name">Farai Moyo</div>
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Industrial Design</span>
                </div>
                <p className="profile-card-bio">
                  Graphic design, Figma prototyping, and street photography. Always down to trade sketchbook ideas or go for coffee.
                </p>

                <div className="shared-interests-row">
                  <span className="shared-chip highlight">Design</span>
                  <span className="shared-chip highlight">Drawing</span>
                  <span className="shared-chip highlight">Photography</span>
                  <span className="shared-chip">Artificial Intelligence</span>
                  <span className="shared-chip">Road Trips</span>
                </div>

                <div className="prompt-quote-box">
                  <div className="prompt-question">✦ A fun fact about me...</div>
                  <p className="prompt-answer">"I've designed posters for 4 campus music festivals and can identify almost any font in 2 seconds."</p>
                </div>

                <div className="profile-card-footer">
                  <span className="muted" style={{ fontSize: "0.82rem" }}>Active today</span>
                  <button
                    className="compact"
                    onClick={() =>
                      setNotice("Farai will see your greeting! Connect your live database to exchange messages.")
                    }
                  >
                    Say hi
                  </button>
                </div>
              </div>
            </article>
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
              <article className="profile-card" key={card.userId}>
                <div className="profile-card-cover">
                  {photoUrl ? (
                    <img src={photoUrl} alt={card.displayName} />
                  ) : (
                    <img src="/images/avatar_maya.jpg" alt={card.displayName} />
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
                  <div className="profile-name-row">
                    <div className="profile-card-name">{card.displayName}</div>
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
