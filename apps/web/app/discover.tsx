"use client";

import type { BlockedUser, DiscoveryCard, SocialStyle } from "@sp/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getDiscoveryClient } from "../lib/discovery";
import { getSignedMediaUrl } from "../lib/profile";
import { SayHi } from "./say-hi";

const STYLE_LABELS: Record<SocialStyle, string> = { small_group: "Small groups", one_to_one: "One-to-one", text_first: "Text-first", voice_first: "Voice-first", low_pressure: "Low pressure" };
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
  const seen = useRef<Set<string>>(new Set());

  const loadPhotos = useCallback(async (cards: DiscoveryCard[]) => {
    const pairs = await Promise.all(cards.filter((c) => c.thumbnailPath).map(async (c) => { try { return [c.userId, await getSignedMediaUrl(c.thumbnailPath!)] as const; } catch { return null; } }));
    setPhotos((current) => ({ ...current, ...Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)) }));
  }, []);

  const track = useCallback((cards: DiscoveryCard[]) => {
    const fresh = cards.filter((c) => !seen.current.has(c.userId));
    fresh.forEach((c) => seen.current.add(c.userId));
    if (fresh.length) void client.recordEvents(fresh.map((c) => ({ candidateId: c.userId, type: "impression" as const }))).catch(() => undefined);
  }, [client]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const feed = await client.getPeople(PAGE, 0);
      setPeople(feed.people); setHasMore(feed.hasMore); track(feed.people); void loadPhotos(feed.people);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, loadPhotos, track]);
  useEffect(() => { void load(); }, [load]);

  async function more() {
    setLoadingMore(true); setError(null);
    try {
      const feed = await client.getPeople(PAGE, people.length);
      const known = new Set(people.map((p) => p.userId));
      const added = feed.people.filter((p) => !known.has(p.userId));
      setPeople([...people, ...added]); setHasMore(feed.hasMore); track(added); void loadPhotos(added);
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoadingMore(false); }
  }

  function toggle(card: DiscoveryCard) {
    const next = open === card.userId ? null : card.userId;
    setOpen(next);
    if (next) void client.recordEvents([{ candidateId: card.userId, type: "open" }]).catch(() => undefined);
  }
  function skip(card: DiscoveryCard) {
    setPeople((p) => p.filter((x) => x.userId !== card.userId));
    void client.recordEvents([{ candidateId: card.userId, type: "ignore" }]).catch(() => undefined);
    setNotice(`${card.displayName} will show up less often.`);
  }
  async function block(card: DiscoveryCard) {
    if (!window.confirm(`Block ${card.displayName}? You will not see each other anywhere in the app.`)) return;
    try { await client.block(card.userId); setPeople((p) => p.filter((x) => x.userId !== card.userId)); setNotice(`${card.displayName} is blocked. You can undo this under "Blocked people".`); if (blocks) setBlocks(await client.listBlocks()); }
    catch (err) { setError(errorMessage(err)); }
  }
  async function showBlocks() { try { setBlocks(await client.listBlocks()); } catch (err) { setError(errorMessage(err)); } }
  async function unblock(id: string) { try { await client.unblock(id); setBlocks((b) => (b ?? []).filter((x) => x.userId !== id)); setNotice("Unblocked. They can appear in your feed again."); void load(); } catch (err) { setError(errorMessage(err)); } }

  return <section aria-label="Discover people">
    <div className="notice-row">
      <p className="muted">People are suggested from what you share. Every card tells you why. Nobody is shown your exact location.</p>
      <button className="secondary compact" onClick={() => void load()} disabled={loading}>Refresh</button>
    </div>
    {error && <div className="notice err" role="alert">{error} <button className="link" onClick={() => void load()}>Try again</button></div>}
    {notice && <div className="notice ok" role="status">{notice}</div>}
    {loading ? <div className="feed-grid" aria-busy="true">{[0, 1, 2].map((i) => <div className="card skeleton" key={i} />)}</div>
      : people.length === 0 && !error ? <div className="card empty"><h2>No one new right now</h2><p className="muted">You have seen everyone who fits for now. Add more interests or prompts to your profile, or check back soon as new people join.</p></div>
      : <div className="feed-grid">{people.map((card) => <article className="card person" key={card.userId}>
        <div className="person-head">
          {photos[card.userId] ? <img className="avatar" src={photos[card.userId]} alt={`${card.displayName}'s profile`} /> : <div className="avatar placeholder" aria-hidden="true">{card.displayName.slice(0, 1).toUpperCase()}</div>}
          <div><h2>{card.displayName}</h2><div className="tag-row">{card.socialStyles.map((s) => <span className="tag soft" key={s}>{STYLE_LABELS[s]}</span>)}</div></div>
        </div>
        <ul className="reasons">{card.reasons.slice(0, open === card.userId ? 5 : 2).map((r) => <li key={r.code}>{r.text}</li>)}</ul>
        {card.bio && <p className="bio">{card.bio}</p>}
        <div className="tag-row">{card.interests.slice(0, open === card.userId ? 12 : 5).map((i) => <span className={card.sharedInterests.some((s) => s.id === i.id) ? "tag" : "tag soft"} key={i.id}>{i.name}</span>)}</div>
        {open === card.userId && card.prompts.map((p) => <div className="preview-prompt" key={p.promptId}><strong>{p.prompt}</strong><p>{p.answer}</p></div>)}
        {greeting === card.userId && <SayHi card={card} onClose={() => setGreeting(null)} onSent={(message) => { setGreeting(null); setNotice(message); void load(); }} />}
        {card.relation === "pending_in" && <p className="muted"><strong>{card.displayName} said hi to you.</strong> See Connections to reply.</p>}
        {card.relation === "pending_out" && <p className="muted">You said hi. No pressure, they can reply any time.</p>}
        <div className="card-actions">
          {card.relation === "none" && (card.messagePermission === "nobody" ? <span className="muted">Not accepting new connections</span> : <button className="compact" onClick={() => setGreeting(greeting === card.userId ? null : card.userId)}>Say hi</button>)}
          <button className="secondary compact" onClick={() => toggle(card)} aria-expanded={open === card.userId}>{open === card.userId ? "Show less" : "View profile"}</button>
          <button className="secondary compact" onClick={() => skip(card)}>Not now</button>
          <button className="link danger" onClick={() => void block(card)}>Block</button>
        </div>
      </article>)}</div>}
    {!loading && hasMore && <div className="center"><button className="secondary" onClick={() => void more()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Show more people"}</button></div>}
    <div className="center"><button className="link" onClick={() => void (blocks ? setBlocks(null) : showBlocks())}>{blocks ? "Hide blocked people" : "Blocked people"}</button></div>
    {blocks && <section className="card"><h3>Blocked people</h3>{blocks.length === 0 ? <p className="muted">You have not blocked anyone.</p> : <ul className="device-list">{blocks.map((b) => <li key={b.userId}><span>{b.displayName}</span><button className="secondary compact" onClick={() => void unblock(b.userId)}>Unblock</button></li>)}</ul>}</section>}
  </section>;
}
