"use client";

import type { DiscoveryCard, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import { useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getConnectionsClient } from "../lib/connections";

/** Pick-a-starter panel: the person chooses an opener, they never have to invent one. */
export function SayHi({ card, onSent, onClose }: { card: DiscoveryCard; onSent: (message: string) => void; onClose: () => void }) {
  const client = getConnectionsClient();
  const [starters, setStarters] = useState<StarterSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    let alive = true;
    client.getStarters(card.userId).then((s) => alive && setStarters(s)).catch((e) => alive && setError(errorMessage(e)));
    return () => { alive = false; };
  }, [client, card.userId]);

  async function send(intro: IntroInput) {
    setBusy(true); setError(null);
    try {
      const result = await client.sendRequest(card.userId, intro);
      onSent(result.status === "connected" ? `You and ${card.displayName} are now connected!` : `Hi sent to ${card.displayName}. No pressure, they can reply whenever they like.`);
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }

  return <div className="say-hi" role="dialog" aria-label={`Say hi to ${card.displayName}`}>
    <p className="muted">Pick an opener. {card.displayName} sees it with your profile and can reply when they are ready.</p>
    {error && <div className="notice err" role="alert">{error}</div>}
    {!starters && !error && <p className="muted">Finding good openers…</p>}
    {starters && <>
      {starters.icebreakers.length > 0 && <><h4>About what you share</h4>{starters.icebreakers.map((s) => <button className="starter" key={s.ref} disabled={busy} onClick={() => void send({ kind: "icebreaker", ref: s.ref })}>{s.text}</button>)}</>}
      {starters.questions.length > 0 && <><h4>Question cards</h4>{starters.questions.map((s) => <button className="starter" key={s.ref} disabled={busy} onClick={() => void send({ kind: "question", ref: s.ref })}>{s.text}</button>)}</>}
      {starters.games.length > 0 && <><h4>This or that</h4>{starters.games.map((g) => <div className="game" key={g.ref}><span className="muted">I pick…</span><button className="starter" disabled={busy} onClick={() => void send({ kind: "this_or_that", ref: g.ref, choice: "a" })}>{g.optionA}</button><span className="muted">or</span><button className="starter" disabled={busy} onClick={() => void send({ kind: "this_or_that", ref: g.ref, choice: "b" })}>{g.optionB}</button></div>)}</>}
      {starters.allowCustom && (writing
        ? <div><label htmlFor={`note-${card.userId}`}>Your own short note (optional)</label><textarea id={`note-${card.userId}`} maxLength={240} rows={2} value={custom} onChange={(e) => setCustom(e.target.value)} /><button disabled={busy || custom.trim().length < 2} onClick={() => void send({ kind: "custom", text: custom })}>Send note</button></div>
        : <button className="link" onClick={() => setWriting(true)}>Write my own instead</button>)}
      {!starters.allowCustom && <p className="muted">{card.displayName} prefers a low-pressure start, so only these openers are available.</p>}
    </>}
    <button className="link" onClick={onClose}>Cancel</button>
  </div>;
}
