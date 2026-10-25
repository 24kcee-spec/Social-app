'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { SocialPost } from '@sp/profile-client';
import { PlatformShell } from '../../platform-shell';
import { PostCard } from '../../social-feed';
import { getPlatformClient } from '../../../lib/platform';
import { getAuth, errorMessage } from '../../../lib/auth';
export default function PostPage() {
  const params = useParams<{ id: string }>();
  return (
    <PlatformShell title="Post">
      <PostDetail id={params.id} />
    </PlatformShell>
  );
}
function PostDetail({ id }: { id: string }) {
  const [post, setPost] = useState<SocialPost | null>(null);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([getPlatformClient().getPost(id), getAuth().fetchMe()])
      .then(([item, user]) => {
        if (alive) {
          setPost(item);
          setMe(user.id);
        }
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return error ? (
    <p role="alert">{error}</p>
  ) : loading ? (
    <p>Loading post…</p>
  ) : post ? (
    <PostCard post={post} me={me} onChange={setPost} onRemove={() => setPost(null)} />
  ) : (
    <section className="empty-state-card">
      <h2>This post is unavailable</h2>
      <p>It may have expired, been removed or have a different audience.</p>
      <a href="/feed">Back to feed</a>
    </section>
  );
}
