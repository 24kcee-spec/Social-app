'use client';
import { SponsoredPosts } from './sponsored-post';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentKind, PostComment, SocialPost } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { errorMessage, getAuth } from '../lib/auth';
import { SocialMedia } from './social-media';

export function SocialFeed({
  kind = 'all',
  userId,
  compact = false,
}: {
  kind?: ContentKind | 'all';
  userId?: string;
  compact?: boolean;
}) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [scope, setScope] = useState<'everyone' | 'following' | 'saved'>('everyone');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await getPlatformClient().listPosts({ kind, scope, userId });
      setPosts(page.items);
      setCursor(page.cursor);
      setMe((await getAuth().fetchMe()).id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [kind, scope, userId]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section
      className={`social-feed ${kind === 'reel' ? 'reels-feed' : ''}`}
      aria-label={kind === 'all' ? 'Social feed' : `${kind} feed`}
    >
      {!compact && (
        <div className="feed-toolbar">
          <div className="filter-chips" aria-label="Feed audience">
            {(['everyone', 'following', 'saved'] as const).map((value) => (
              <button
                key={value}
                className={`chip-btn ${scope === value ? 'on' : ''}`}
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
              >
                {value === 'everyone'
                  ? 'For everyone'
                  : value === 'following'
                    ? 'Following'
                    : 'Saved'}
              </button>
            ))}
          </div>
          <button className="secondary compact" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          <a className="secondary compact" href={`/studio?kind=${kind === 'all' ? 'post' : kind}`}>
            Create {kind === 'all' ? 'post' : kind}
          </a>
        </div>
      )}
      {error && (
        <p role="alert" className="notice err">
          {error}
          <button className="link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      {loading && posts.length === 0 ? (
        <div className="empty-state-card" aria-busy="true">
          Loading updates…
        </div>
      ) : posts.length === 0 ? (
        <div className="empty-state-card">
          <h2>
            {scope === 'saved'
              ? 'Your saved posts will appear here'
              : scope === 'following'
                ? 'Your people, in one place'
                : userId
                  ? 'Your first post starts here'
                  : 'Be part of the first conversation'}
          </h2>
          <p>
            {scope === 'saved'
              ? 'Save a post with its bookmark action and find it here later.'
              : scope === 'following'
                ? 'Follow people whose updates you want to see.'
                : 'Share a moment, a creative work or something your community can join.'}
          </p>
          {(scope === 'following' || scope === 'saved') && (
            <a className="secondary" href="/discover">
              Find your people
            </a>
          )}
          <a className="secondary" href="/studio">
            Create an update
          </a>
        </div>
      ) : (
        <div className="social-feed-items">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              me={me}
              vertical={kind === 'reel'}
              onChange={(updated) =>
                setPosts((current) =>
                  current.map((item) => (item.id === updated.id ? updated : item)),
                )
              }
              onRemove={() => setPosts((current) => current.filter((item) => item.id !== post.id))}
            />
          ))}
        </div>
      )}
      {!compact && kind === 'all' && scope === 'everyone' && <SponsoredPosts />}
      {cursor && (
        <button
          className="secondary load-more"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const page = await getPlatformClient().listPosts({ kind, scope, userId, cursor });
              setPosts((current) => [
                ...current,
                ...page.items.filter(
                  (item) => !current.some((existing) => existing.id === item.id),
                ),
              ]);
              setCursor(page.cursor);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
export function PostCard({
  post,
  me,
  vertical = false,
  onChange,
  onRemove,
}: {
  post: SocialPost;
  me: string;
  vertical?: boolean;
  onChange: (post: SocialPost) => void;
  onRemove: () => void;
}) {
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('inappropriate');
  const [details, setDetails] = useState('');
  const clientId = useRef<string | null>(null);
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={`social-post ${vertical ? 'social-post-reel' : ''}`}>
      <header className="social-post-header">
        <a href={`/u/${post.userId}`} className="post-author">
          <span className="post-avatar" aria-hidden="true">
            {post.displayName[0]}
          </span>
          <span>
            <strong>{post.displayName}</strong>
            <small>
              {new Date(post.createdAt).toLocaleString()} ·{' '}
              {post.audience === 'public'
                ? 'Public'
                : post.audience === 'connections'
                  ? 'Connections'
                  : 'Only me'}
              {post.expiresAt ? ' · Expires ' + new Date(post.expiresAt).toLocaleTimeString() : ''}
            </small>
          </span>
        </a>
        {me !== post.userId && (
          <button
            className="secondary compact"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await getPlatformClient().follow(post.userId, !post.following);
                onChange({ ...post, following: !post.following });
              })
            }
          >
            {post.following ? 'Following' : 'Follow'}
          </button>
        )}
      </header>
      {post.title && <h2 className="social-post-title">{post.title}</h2>}
      {post.body && <p className="social-post-body">{post.body}</p>}
      {post.asset && (
        <SocialMedia asset={post.asset} expiresAt={post.expiresAt} vertical={vertical} />
      )}
      <div className="social-post-actions">
        <button
          className="link"
          aria-pressed={!!post.myReaction}
          disabled={busy}
          onClick={() =>
            void act(async () =>
              onChange(await getPlatformClient().react(post.id, post.myReaction ? null : 'like')),
            )
          }
        >
          {post.myReaction ? '♥' : '♡'} {post.likeCount}{' '}
          <span className="sidle-sr-only">likes</span>
        </button>
        <button
          className="link"
          disabled={busy}
          onClick={() =>
            void act(async () =>
              setComments(comments ? null : await getPlatformClient().listComments(post.id)),
            )
          }
        >
          ◯ {post.commentCount} comments
        </button>
        <button
          className="link"
          aria-pressed={post.bookmarked}
          disabled={busy}
          onClick={() =>
            void act(async () => {
              await getPlatformClient().bookmark(post.id, !post.bookmarked);
              onChange({ ...post, bookmarked: !post.bookmarked });
            })
          }
        >
          {post.bookmarked ? 'Saved' : 'Save'}
        </button>
        <button
          className="link"
          onClick={() =>
            void act(async () => {
              const url = new URL(`/post/${post.id}`, location.origin).toString();
              if (navigator.share)
                await navigator.share({ title: post.title || `${post.displayName} on Sidle`, url });
              else {
                await navigator.clipboard.writeText(url);
                setNotice('Link copied. Audience rules still apply.');
              }
            })
          }
        >
          Share
        </button>
        {post.userId === me ? (
          <button
            className="link danger-text"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Remove this post from Sidle?'))
                void act(async () => {
                  await getPlatformClient().deletePost(post.id);
                  onRemove();
                });
            }}
          >
            Delete
          </button>
        ) : (
          <button className="link" onClick={() => setReporting((value) => !value)}>
            Report
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="notice ok">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="notice err">
          {error}
        </p>
      )}
      {reporting && (
        <form
          className="post-report"
          onSubmit={(event) => {
            event.preventDefault();
            void act(async () => {
              await getPlatformClient().report(post.id, reason, details);
              setReporting(false);
              setNotice('Report saved for review. Use Block separately if needed.');
            });
          }}
        >
          <label>
            Reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="inappropriate">Inappropriate content</option>
              <option value="harassment">Harassment</option>
              <option value="spam">Spam</option>
              <option value="copyright">Copyright</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Details
            <textarea
              value={details}
              maxLength={1000}
              onChange={(event) => setDetails(event.target.value)}
            />
          </label>
          <button disabled={busy}>Submit report</button>
        </form>
      )}
      {comments && (
        <section className="post-comments" aria-label="Comments">
          {comments.map((comment) => (
            <div key={comment.id} className="post-comment">
              <a href={`/u/${comment.userId}`}>
                <strong>{comment.displayName}</strong>
              </a>
              <p>{comment.body}</p>
              {comment.userId === me && (
                <button
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await getPlatformClient().deleteComment(comment.id);
                      setComments(
                        (current) => current?.filter((item) => item.id !== comment.id) ?? [],
                      );
                      onChange({ ...post, commentCount: Math.max(0, post.commentCount - 1) });
                    })
                  }
                >
                  Delete comment
                </button>
              )}
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!clientId.current) clientId.current = crypto.randomUUID();
              void act(async () => {
                setComments(await getPlatformClient().comment(post.id, body, clientId.current!));
                const fresh = await getPlatformClient().getPost(post.id);
                if (fresh) onChange(fresh);
                setBody('');
                clientId.current = null;
              });
            }}
          >
            <label className="sidle-sr-only" htmlFor={`comment-${post.id}`}>
              Write a comment
            </label>
            <input
              id={`comment-${post.id}`}
              value={body}
              maxLength={1000}
              placeholder="Write a comment…"
              onChange={(event) => {
                setBody(event.target.value);
                clientId.current = null;
              }}
            />
            <button disabled={busy || !body.trim()}>Post</button>
          </form>
        </section>
      )}
    </article>
  );
}
