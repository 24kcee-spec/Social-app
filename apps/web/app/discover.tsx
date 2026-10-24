"use client";

import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getDiscoveryClient } from "../lib/discovery";
import { webFeatureFlags } from "../lib/feature-flags";
import { trackProductEvent } from "../lib/product-telemetry";
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
const SAVED_KEY = "sidle-saved-introductions-v1";

type PendingHide = { card: DiscoveryCard; index: number };

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
  const [search, setSearch] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [pendingHide, setPendingHide] = useState<PendingHide | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const pendingIgnoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIgnoreCard = useRef<DiscoveryCard | null>(null);

  useEffect(() => {
    if (!webFeatureFlags.savedIntroductions) return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]") as unknown;
      if (Array.isArray(parsed)) setSavedIds(new Set(parsed.filter((value): value is string => typeof value === "string")));
    } catch {
      // Saved introductions are a convenience; storage restrictions must not block Discover.
    }
  }, []);

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

  useEffect(() => () => {
    if (pendingIgnoreTimer.current) clearTimeout(pendingIgnoreTimer.current);
    const card = pendingIgnoreCard.current;
    if (card) void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined);
  }, [client]);

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

  function commitPendingIgnore() {
    if (pendingIgnoreTimer.current) clearTimeout(pendingIgnoreTimer.current);
    const card = pendingIgnoreCard.current;
    pendingIgnoreTimer.current = null;
    pendingIgnoreCard.current = null;
    if (card) void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined);
  }

  function skip(card: DiscoveryCard) {
    commitPendingIgnore();
    const index = people.findIndex((person) => person.userId === card.userId);
    setPeople((current) => current.filter((person) => person.userId !== card.userId));
    setPendingHide({ card, index: Math.max(0, index) });
    pendingIgnoreCard.current = card;
    pendingIgnoreTimer.current = setTimeout(() => {
      const pending = pendingIgnoreCard.current;
      pendingIgnoreCard.current = null;
      pendingIgnoreTimer.current = null;
      if (pending) void client.recordEvents([{ candidateId: pending.userId, type: "ignore" }]).catch(() => undefined);
      setPendingHide(null);
    }, 7000);
    trackProductEvent("recommendation_hidden");
    setNotice(`${card.displayName} is hidden for now.`);
  }

  function undoSkip() {
    if (!pendingHide) return;
    if (pendingIgnoreTimer.current) clearTimeout(pendingIgnoreTimer.current);
    pendingIgnoreTimer.current = null;
    pendingIgnoreCard.current = null;
    const { card, index } = pendingHide;
    setPeople((current) => {
      if (current.some((person) => person.userId === card.userId)) return current;
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, card);
      return next;
    });
    setPendingHide(null);
    setNotice(`${card.displayName} is back in this set of introductions.`);
    trackProductEvent("recommendation_undo");
  }

  function toggleSaved(card: DiscoveryCard) {
    if (!webFeatureFlags.savedIntroductions) return;
    setSavedIds((current) => {
      const next = new Set(current);
      const wasSaved = next.has(card.userId);
      if (wasSaved) next.delete(card.userId);
      else next.add(card.userId);
      try {
        window.localStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
      } catch {
        setNotice("This browser is not allowing Sidle to save introductions on this device.");
      }
      trackProductEvent(wasSaved ? "recommendation_unsaved" : "recommendation_saved");
      return next;
    });
  }

  async function block(card: DiscoveryCard) {
    if (!window.confirm(`Block ${card.displayName}? You will not see each other anywhere in the app.`)) return;
    try {
      commitPendingIgnore();
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
      setNotice("Unblocked. They can appear in your suggestions again; old connections are not restored automatically.");
      void load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredPeople = people.filter((person) => {
    const matchesFilter = filterStyle === "all"
      || (filterStyle === "shared" && person.sharedInterests.length > 0)
      || (filterStyle === "saved" && savedIds.has(person.userId))
      || person.socialStyles.includes(filterStyle as SocialStyle);
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;
    const searchable = [
      person.displayName,
      person.bio,
      ...person.interests.map((interest) => interest.name),
      ...person.prompts.map((prompt) => `${prompt.prompt} ${prompt.answer}`),
      ...person.reasons.map((reason) => reason.text),
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(normalizedSearch);
  });

  const filterOptions = [
    ["all", "All"],
    ["shared", "Shared passions"],
    ...(webFeatureFlags.savedIntroductions ? [["saved", `Saved${savedIds.size ? ` · ${savedIds.size}` : ""}`]] : []),
    ["low_pressure", "🌿 Low pressure"],
    ["one_to_one", "One-to-one"],
    ["small_group", "Small groups"],
  ] as const;

  return (
    <section aria-label="Discover people" className="discover-page-head">
      <div className="discover-header-bar">
        <div>
          <span className="eyebrow">✦ FOR YOU</span>
          <h1 style={{ margin: "2px 0 0" }}>Discover people</h1>
          <p className="muted" style={{ margin: "8px 0 0", maxWidth: 620 }}>
            Relevant introductions built around shared interests and social pace — not follower counts or popularity.
          </p>
        </div>
      </div>

      {webFeatureFlags.recommendationTuning && (
        <div className="sidle-discover-toolbar">
          <div className="sidle-searchbox">
            <span className="sidle-searchbox-icon" aria-hidden="true">⌕</span>
            <label className="sidle-sr-only" htmlFor="discover-search">Search current introductions</label>
            <input
              id="discover-search"
              type="search"
              placeholder="Search names, interests or prompts…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
            />
          </div>
          <a className="secondary compact" href="/profile/edit">Tune my profile</a>
        </div>
      )}

      <div className="filter-chips" role="group" aria-label="Filter introductions">
        {filterOptions.map(([key, label]) => (
          <button
            key={key}
            className={`chip-btn ${filterStyle === key ? "on" : ""}`}
            aria-pressed={filterStyle === key}
            onClick={() => {
              setFilterStyle(key);
              trackProductEvent("recommendation_filter_changed", { filter: key });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {webFeatureFlags.savedIntroductions && (
        <p className="muted" style={{ marginTop: -4, fontSize: ".78rem" }}>
          Saved introductions are private to this browser for now; saving does not notify the other person.
        </p>
      )}

      {error && (
        <div className="notice err" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {notice && (
        <div className="notice ok" role="status">
          <span>✓ {notice}</span>
          {pendingHide && <button className="link" onClick={undoSkip} style={{ marginLeft: "auto" }}>Undo</button>}
          {!pendingHide && <button className="link" onClick={() => setNotice(null)} style={{ marginLeft: "auto" }}>Dismiss</button>}
        </div>
      )}

      {!loading && filteredPeople.length > 0 && (
        <div className="stories-row" aria-label="Fresh introductions">
          {filteredPeople.slice(0, 12).map((person) => (
            <button
              key={person.userId}
              className="story"
              onClick={() => document.getElementById(`card-${person.userId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              <span className="story-ring">
                {photos[person.userId] ? <img src={photos[person.userId]} alt="" /> : <span>{person.displayName.charAt(0).toUpperCase()}</span>}
              </span>
              <span className="story-name">{person.displayName.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="discover-grid" aria-busy="true" aria-label="Loading introductions">
          {[1, 2, 3].map((i) => (
            <div className="card" key={i} style={{ minHeight: 360, opacity: 0.72 }}>
              <div style={{ height: 190, background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", marginBottom: 16 }} />
              <div style={{ height: 24, width: "60%", background: "var(--surface-sunken)", borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 16, width: "85%", background: "var(--surface-sunken)", borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : filteredPeople.length === 0 ? (
        <div>
          <div className="empty-state-card" style={{ marginBottom: 36 }}>
            <div className="empty-state-icon">✦</div>
            <h2>{normalizedSearch || filterStyle !== "all" ? "No introductions match that view" : "You’re all caught up"}</h2>
            <p className="muted" style={{ maxWidth: 560, margin: "8px auto 18px" }}>
              {normalizedSearch || filterStyle !== "all"
                ? "Try a broader filter or clear the search. Your privacy settings and the other person’s privacy choices still apply."
                : "You’ve explored everyone currently matching your interests and privacy settings. New people will appear as the community grows."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {(normalizedSearch || filterStyle !== "all") && (
                <button className="secondary compact" onClick={() => { setSearch(""); setFilterStyle("all"); }}>Clear filters</button>
              )}
              <button className="secondary compact" onClick={() => void load()}>Refresh matches</button>
            </div>
          </div>

          <div className="card invite-card">
            <h2>Grow your circle</h2>
            <p className="muted">Invite someone you already know, or add more interests and prompts so Sidle has better context for future introductions.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => {
                const text = "Join me on Sidle — a calm place to find people, conversations and plans at your pace.";
                if (navigator.share) {
                  void navigator.share({ title: "Sidle", text, url: window.location.origin }).catch(() => undefined);
                } else {
                  void navigator.clipboard?.writeText(`${text} ${window.location.origin}`);
                  setNotice("Invite link copied.");
                }
              }}>Invite a friend</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="discover-grid">
          {filteredPeople.map((card) => {
            const isOpen = open === card.userId;
            const isGreeting = greeting === card.userId;
            const photoUrl = photos[card.userId];
            const isSaved = savedIds.has(card.userId);

            return (
              <article className="profile-card" id={`card-${card.userId}`} key={card.userId}>
                <div className="profile-card-cover">
                  {photoUrl ? (
                    <img src={photoUrl} alt={`${card.displayName}'s profile`} loading="lazy" />
                  ) : (
                    <span className="profile-card-initial" aria-hidden="true">{card.displayName.charAt(0).toUpperCase()}</span>
                  )}
                  <div className="profile-card-scrim" />
                  <div className="profile-card-cover-badges">
                    <span className="social-style-tag">
                      {card.socialStyles.map((style) => STYLE_LABELS[style]).join(" · ") || "Community member"}
                    </span>
                    {card.sharedInterests.length > 0 && (
                      <span className="social-style-tag" style={{ background: "var(--accent)" }}>
                        {card.sharedInterests.length} shared {card.sharedInterests.length === 1 ? "interest" : "interests"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="profile-card-body">
                  <div className="profile-name-row" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div className="profile-card-name">{card.displayName}</div>
                    {card.verificationLevel === "student_verified" && (
                      <span className="campus-badge" title="Academic email confirmed">✓ Academic email</span>
                    )}
                    {card.verificationLevel === "trusted" && (
                      <span className="campus-badge trusted" title="Trusted community standing">★ Trusted</span>
                    )}
                  </div>

                  {card.bio && <p className="profile-card-bio">{card.bio}</p>}

                  <div className="shared-interests-row">
                    {card.interests.slice(0, isOpen ? 12 : 5).map((interest) => {
                      const isShared = card.sharedInterests.some((shared) => shared.id === interest.id);
                      return (
                        <span key={interest.id} className={`shared-chip ${isShared ? "highlight" : ""}`}>
                          {interest.name}
                        </span>
                      );
                    })}
                  </div>

                  <details
                    className="sidle-why"
                    onToggle={(event) => {
                      if (event.currentTarget.open) trackProductEvent("why_recommendation_opened");
                    }}
                  >
                    <summary>Why you’re seeing {card.displayName.split(" ")[0]}</summary>
                    <ul className="sidle-why-list">
                      {card.reasons.slice(0, 4).map((reason) => <li key={`${reason.code}-${reason.text}`}>{reason.text}</li>)}
                    </ul>
                    <p className="muted" style={{ margin: "8px 0 0", fontSize: ".76rem" }}>
                      Sidle explains positive matching context here. It does not show a public popularity score.
                    </p>
                  </details>

                  {card.prompts.length > 0 && card.prompts[0] && (
                    <div className="prompt-quote-box">
                      <div className="prompt-question">✦ {card.prompts[0].prompt}</div>
                      <p className="prompt-answer">“{card.prompts[0].answer}”</p>
                    </div>
                  )}

                  {isOpen && card.prompts.length > 1 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                      {card.prompts.slice(1).map((prompt) => (
                        <div key={prompt.promptId} className="prompt-quote-box">
                          <div className="prompt-question">✦ {prompt.prompt}</div>
                          <p className="prompt-answer">“{prompt.answer}”</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {isOpen && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }} aria-label="Profile safety actions">
                      <button className="link" type="button" onClick={() => setReportingProfile({ id: card.userId, displayName: card.displayName })}>Report profile</button>
                      <button className="link" type="button" onClick={() => void block(card)}>Block</button>
                    </div>
                  )}

                  <div className="profile-card-footer">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {card.relation === "none" && card.messagePermission !== "nobody" && (
                        <button className="compact" onClick={() => setGreeting(isGreeting ? null : card.userId)}>Say hi</button>
                      )}
                      <button className="secondary compact" onClick={() => toggle(card)}>{isOpen ? "Less" : "Profile"}</button>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {webFeatureFlags.savedIntroductions && (
                        <button
                          type="button"
                          className="secondary compact sidle-save-button"
                          aria-pressed={isSaved}
                          onClick={() => toggleSaved(card)}
                          title={isSaved ? "Remove from saved introductions" : "Save privately on this device"}
                        >
                          {isSaved ? "Saved" : "Save"}
                        </button>
                      )}
                      <button
                        type="button"
                        className="secondary compact"
                        onClick={() => setSharingProfile({ id: card.userId, displayName: card.displayName, bio: card.bio })}
                      >
                        Share
                      </button>
                      <button className="secondary compact" onClick={() => skip(card)} title="Hide this introduction for now">Hide</button>
                    </div>
                  </div>
                </div>

                {isGreeting && (
                  <SayHi
                    card={card}
                    onClose={() => setGreeting(null)}
                    onSent={(message) => {
                      setGreeting(null);
                      setNotice(message);
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

      {!loading && hasMore && filterStyle !== "saved" && !normalizedSearch && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button className="secondary" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Loading more people…" : "Show more people"}
          </button>
        </div>
      )}

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
        <section className="card" style={{ marginTop: 20, maxWidth: 600, marginInline: "auto" }}>
          <span className="eyebrow">SAFETY</span>
          <h3>Blocked members</h3>
          <p className="muted">Blocked members cannot see your profile or message you. Unblocking does not restore an old connection automatically.</p>
          {blocks.length === 0 ? (
            <p className="muted" style={{ fontStyle: "italic" }}>You have not blocked anyone.</p>
          ) : (
            <ul className="blocked-account-list" style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
              {blocks.map((blocked) => (
                <li key={blocked.userId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 650 }}>{blocked.displayName}</span>
                  <button className="secondary compact" onClick={() => void unblock(blocked.userId)}>Unblock</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
