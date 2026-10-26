'use client';
import { useState } from 'react';
import { getPlatformClient } from '../lib/platform';
import { errorMessage } from '../lib/auth';
import { SocialMedia } from './social-media';
type Result = Awaited<
  ReturnType<ReturnType<typeof getPlatformClient>['conversationTools']>
>['items'][number];
export function ConversationTools({
  id,
  onJump,
}: {
  id: string;
  onJump: (message: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'search' | 'media'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  async function find(append = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    const last = append ? results.at(-1) : null;
    try {
      const page = await getPlatformClient().conversationTools(
        id,
        mode,
        query,
        last ? { beforeAt: last.createdAt, beforeId: last.id } : undefined,
      );
      setResults((current) =>
        append
          ? [
              ...current,
              ...page.items.filter((item) => !current.some((existing) => existing.id === item.id)),
            ]
          : page.items,
      );
      setLoaded(true);
      setMore(page.items.length === 30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Conversation search and shared media" className="conversation-search">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <label>
          Find in this conversation
          <select
            disabled={busy}
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as 'search' | 'media');
              setResults([]);
              setLoaded(false);
              setMore(false);
            }}
          >
            <option value="search">Messages</option>
            <option value="media">Shared media</option>
          </select>
        </label>
        {mode === 'search' && (
          <label>
            Search messages
            <input
              type="search"
              minLength={2}
              maxLength={100}
              required
              value={query}
              disabled={busy}
              onChange={(event) => {
                setQuery(event.target.value);
                setLoaded(false);
                setResults([]);
                setMore(false);
              }}
            />
          </label>
        )}
        <button disabled={busy || (mode === 'search' && query.trim().length < 2)}>
          {busy ? 'Searching…' : mode === 'media' ? 'Show shared media' : 'Search'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {loaded && !results.length && (
        <p role="status">
          {mode === 'media' ? 'No shared attachments yet.' : 'No messages match that search.'}
        </p>
      )}
      {results.map((item) => (
        <article key={item.id} className="conversation-result">
          <button className="link" onClick={() => void onJump(item.id)}>
            {item.body}
            <small> · {new Date(item.createdAt).toLocaleString()}</small>
          </button>
          {item.asset && <SocialMedia asset={item.asset} />}
        </article>
      ))}
      {more && (
        <button type="button" className="secondary" disabled={busy} onClick={() => void find(true)}>
          Load more results
        </button>
      )}
    </section>
  );
}
