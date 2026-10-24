'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductFeedback } from '@sp/profile-client';
import { errorMessage, getAuth } from '../lib/auth';
import { getProductClient } from '../lib/product';

export function ProductFeedbackForm() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [category, setCategory] = useState<ProductFeedback['category']>('idea');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const attempt = useRef<{ id: string; category: string; body: string } | null>(null);
  useEffect(() => {
    void getAuth()
      .getAccessToken()
      .then((token) => setSignedIn(Boolean(token)))
      .catch(() => setSignedIn(false));
  }, []);
  return (
    <section className="settings-panel" aria-labelledby="feedback-title">
      <h2 id="feedback-title">Help improve Sidle</h2>
      <p className="muted">
        Share a product idea or bug. This saves feedback for the admin review queue; it is not an
        emergency or abuse-report channel. Do not include passwords or private conversations.
      </p>
      {signedIn === null ? (
        <p>Checking your session…</p>
      ) : !signedIn ? (
        <p>
          <a href="/discover">Sign in to share feedback</a>
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setReceipt(null);
            const text = body.trim();
            if (
              !attempt.current ||
              attempt.current.body !== text ||
              attempt.current.category !== category
            )
              attempt.current = { id: crypto.randomUUID(), category, body: text };
            try {
              const saved = await getProductClient().submitFeedback(
                attempt.current.id,
                category,
                text,
              );
              setReceipt(saved.id);
              setBody('');
              attempt.current = null;
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <label>
              Feedback type
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as ProductFeedback['category'])}
              >
                <option value="idea">Idea</option>
                <option value="bug">Bug</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Your feedback
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <p className="muted">
              10–2000 characters. Up to five submissions per day. Admins can review it; response
              times are not guaranteed.
            </p>
            <button type="submit" disabled={busy || body.trim().length < 10}>
              {busy ? 'Saving feedback…' : 'Submit feedback'}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="notice err">
          {error} Your feedback remains in the form.
        </p>
      )}
      {receipt && (
        <p role="status" className="notice ok">
          Feedback saved. Reference: {receipt}
        </p>
      )}
    </section>
  );
}

export function FeedbackQueue() {
  const [items, setItems] = useState<ProductFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getProductClient().listFeedback());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="settings-panel" aria-labelledby="feedback-queue-title">
      <h2 id="feedback-queue-title">Product feedback</h2>
      <p className="muted">
        Latest 100 submissions. Status updates record review; they do not send a response to the
        member.
      </p>
      <button className="secondary" onClick={() => void load()} disabled={loading || busy !== null}>
        Refresh feedback
      </button>
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading feedback…</p>
      ) : items.length === 0 ? (
        <p>No feedback received yet.</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="card" style={{ marginTop: 16 }}>
            <p>
              <strong>{item.category}</strong> · {item.status} ·{' '}
              {new Date(item.createdAt).toLocaleString()}
            </p>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.body}</p>
            <div className="card-actions">
              {(['reviewed', 'closed'] as const).map((status) => (
                <button
                  key={status}
                  className="secondary"
                  disabled={busy !== null || item.status === status}
                  onClick={async () => {
                    setBusy(item.id);
                    setError(null);
                    try {
                      if (!(await getProductClient().reviewFeedback(item.id, status)))
                        throw new Error('This feedback is no longer available. Refresh the queue.');
                      setItems((current) =>
                        current.map((existing) =>
                          existing.id === item.id ? { ...existing, status } : existing,
                        ),
                      );
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  Mark {status}
                </button>
              ))}
            </div>
          </article>
        ))
      )}
    </section>
  );
}
