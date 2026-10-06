"use client";

import type { ConnectionRequestView, ConnectionView, PersonSummary } from "@sp/types";
import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "../lib/auth";
import { getConnectionsClient } from "../lib/connections";
import { getSignedMediaUrl } from "../lib/profile";

function Avatar({ person, url }: { person: PersonSummary; url?: string }) {
  return url ? <img className="avatar small" src={url} alt={`${person.displayName}'s profile`} /> : <div className="avatar small placeholder" aria-hidden="true">{person.displayName.slice(0, 1).toUpperCase()}</div>;
}
const STATUS_TEXT = { pending: "Waiting. They can reply any time in the next two weeks.", accepted: "Connected", no_reply: "No reply yet. That is okay, people reply on their own time." } as const;

export function Connections({ onCount, onMessage }: { onCount?: (pending: number) => void; onMessage?: (userId: string) => void }) {
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
    setLoading(true); setError(null);
    try {
      const [inc, out, con, settings] = await Promise.all([client.listRequests("incoming"), client.listRequests("outgoing"), client.listConnections(), client.getSettings()]);
      setIncoming(inc); setOutgoing(out); setConnections(con); setLowPressure(settings.lowPressureMode); onCount?.(inc.length);
      const people = [...inc.map((r) => r.other), ...out.map((r) => r.other), ...con.map((c) => c.other)].filter((p) => p.thumbnailPath);
      const pairs = await Promise.all(people.map(async (p) => { try { return [p.userId, await getSignedMediaUrl(p.thumbnailPath!)] as const; } catch { return null; } }));
      setPhotos(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => p !== null)));
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }, [client, onCount]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: () => Promise<unknown>, message: string) {
    setError(null);
    try { await fn(); setNotice(message); await load(); } catch (err) { setError(errorMessage(err)); }
  }
  async function toggleLowPressure(next: boolean) {
    setError(null);
    try { setLowPressure((await client.setLowPressure(next)).lowPressureMode); setNotice(next ? "Low-pressure mode is on." : "Low-pressure mode is off."); } catch (err) { setError(errorMessage(err)); }
  }

  return <section aria-label="Connections">
    {error && <div className="notice err" role="alert">{error} <button className="link" onClick={() => void load()}>Try again</button></div>}
    {notice && <div className="notice ok" role="status">{notice}</div>}
    <div className="card">
      <label className="check"><input type="checkbox" checked={lowPressure} onChange={(e) => void toggleLowPressure(e.target.checked)} /> <span><strong>Low-pressure mode</strong><br /><span className="muted">People can only send you a suggested opener (no free text). You never have to answer: requests quietly expire after two weeks, and a "Not now" is never shown to the sender.</span></span></label>
    </div>
    {loading ? <div className="card skeleton" aria-busy="true" /> : <>
      <h2>Said hi to you {incoming.length > 0 && <span className="tag">{incoming.length}</span>}</h2>
      {incoming.length === 0 ? <div className="card"><p className="muted">Nothing waiting. When someone says hi, it shows up here, and there is no rush to answer.</p></div>
        : incoming.map((r) => <div className="card request" key={r.id}>
          <div className="person-head"><Avatar person={r.other} url={photos[r.other.userId]} /><div><h3>{r.other.displayName}</h3><p className="muted">{r.other.bio}</p></div></div>
          <blockquote className="intro">{r.intro.text}</blockquote>
          <div className="card-actions"><button onClick={() => void act(() => client.accept(r.id), `You are now connected with ${r.other.displayName}.`)}>Connect</button><button className="secondary" onClick={() => void act(() => client.decline(r.id), "Done. They will not be told.")}>Not now</button></div>
        </div>)}
      <h2>Your connections</h2>
      {connections.length === 0 ? <div className="card"><p className="muted">No connections yet. Say hi to someone in Discover. Pick an opener and you are done.</p></div>
        : connections.map((c) => <div className="card request" key={c.other.userId}>
          <div className="person-head"><Avatar person={c.other} url={photos[c.other.userId]} /><div><h3>{c.other.displayName}</h3><p className="muted">{c.other.bio}</p></div></div>
          <div className="card-actions">{onMessage && <button onClick={() => onMessage(c.other.userId)}>Message</button>}<button className="link danger" onClick={() => { if (window.confirm(`Remove ${c.other.displayName} from your connections?`)) void act(() => client.removeConnection(c.other.userId), "Connection removed."); }}>Remove</button></div>
        </div>)}
      {outgoing.length > 0 && <><h2>Your hellos</h2>{outgoing.map((r) => <div className="card request" key={r.id}>
        <div className="person-head"><Avatar person={r.other} url={photos[r.other.userId]} /><div><h3>{r.other.displayName}</h3><p className="muted">{STATUS_TEXT[r.status]}</p></div></div>
        <blockquote className="intro">{r.intro.text}</blockquote>
        {r.status === "pending" && <div className="card-actions"><button className="secondary compact" onClick={() => void act(() => client.withdraw(r.id), "Hello withdrawn.")}>Withdraw</button></div>}
      </div>)}</>}
    </>}
  </section>;
}
