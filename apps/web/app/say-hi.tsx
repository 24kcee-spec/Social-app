"use client";

import type { DiscoveryCard, StarterSet } from "@sp/types";
import type { IntroInput } from "@sp/validation";
import { useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getConnectionsClient } from "../lib/connections";

/** Pick-a-starter panel: the person chooses an opener, they never have to invent one. */
export function SayHi({
  card,
  onSent,
  onClose,
}: {
  card: DiscoveryCard;
  onSent: (message: string) => void;
  onClose: () => void;
}) {
  const client = getConnectionsClient();
  const [starters, setStarters] = useState<StarterSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState("");
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    let alive = true;
    client
      .getStarters(card.userId)
      .then((s) => alive && setStarters(s))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [client, card.userId]);

  async function send(intro: IntroInput) {
    setBusy(true);
    setError(null);
    try {
      const result = await client.sendRequest(card.userId, intro);
      onSent(
        result.status === "connected"
          ? `You and ${card.displayName} are now connected!`
          : `Hi sent to ${card.displayName}! No pressure—they can reply whenever they like.`
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="say-hi-modal-wrap" onClick={onClose}>
      <div
        className="say-hi-dialog"
        role="dialog"
        aria-label={`Say hi to ${card.displayName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <span className="eyebrow">LOW-PRESSURE GREETING</span>
            <h2 style={{ margin: "2px 0 0" }}>Say Hi to {card.displayName}</h2>
          </div>
          <button className="secondary compact" onClick={onClose} style={{ borderRadius: "50%", width: 32, height: 32, padding: 0 }}>
            ✕
          </button>
        </div>

        <p className="muted" style={{ marginBottom: 20 }}>
          Pick a conversation opener. {card.displayName} will see it alongside your profile and can reply whenever they have free time.
        </p>

        {error && (
          <div className="notice err" role="alert">
            <span>{error}</span>
          </div>
        )}

        {!starters && !error && (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <p className="muted">Finding great shared openers…</p>
          </div>
        )}

        {starters && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {starters.icebreakers.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px" }}>About what you share</h4>
                {starters.icebreakers.map((s) => (
                  <button
                    className="starter-btn"
                    key={s.ref}
                    disabled={busy}
                    onClick={() => void send({ kind: "icebreaker", ref: s.ref })}
                  >
                    <span>💬</span> <span>{s.text}</span>
                  </button>
                ))}
              </div>
            )}

            {starters.questions.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px" }}>Fun question cards</h4>
                {starters.questions.map((s) => (
                  <button
                    className="starter-btn"
                    key={s.ref}
                    disabled={busy}
                    onClick={() => void send({ kind: "question", ref: s.ref })}
                  >
                    <span>✨</span> <span>{s.text}</span>
                  </button>
                ))}
              </div>
            )}

            {starters.games.length > 0 && (
              <div>
                <h4 style={{ margin: "0 0 10px" }}>This or That</h4>
                {starters.games.map((g) => (
                  <div className="game-row" key={g.ref}>
                    <button
                      className="starter-btn"
                      disabled={busy}
                      onClick={() => void send({ kind: "this_or_that", ref: g.ref, choice: "a" })}
                    >
                      {g.optionA}
                    </button>
                    <span className="muted" style={{ fontWeight: 700, fontSize: "0.8rem" }}>vs</span>
                    <button
                      className="starter-btn"
                      disabled={busy}
                      onClick={() => void send({ kind: "this_or_that", ref: g.ref, choice: "b" })}
                    >
                      {g.optionB}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {starters.allowCustom && (
              <div style={{ marginTop: 6 }}>
                {writing ? (
                  <div>
                    <label htmlFor={`note-${card.userId}`}>Write a personalized short message</label>
                    <textarea
                      id={`note-${card.userId}`}
                      maxLength={240}
                      rows={2}
                      value={custom}
                      placeholder="Hi! I saw we both love Afrobeats..."
                      onChange={(e) => setCustom(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        disabled={busy || custom.trim().length < 2}
                        onClick={() => void send({ kind: "custom", text: custom })}
                      >
                        Send custom opener
                      </button>
                      <button className="secondary" onClick={() => setWriting(false)}>
                        Back to suggested openers
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="link" onClick={() => setWriting(true)}>
                    ✍️ Write your own opener instead
                  </button>
                )}
              </div>
            )}

            {!starters.allowCustom && (
              <p className="muted" style={{ fontSize: "0.84rem", fontStyle: "italic" }}>
                {card.displayName} has Low-Pressure mode active, so only gentle suggested openers are available.
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "right" }}>
          <button className="secondary compact" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
