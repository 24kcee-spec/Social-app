'use client';

import { useEffect, useRef, useState } from 'react';
import type { SocialAsset } from '@sp/profile-client';
import { mediaUrl } from '../lib/platform';

export function SocialMedia({
  asset,
  expiresAt,
  vertical = false,
}: {
  asset: SocialAsset;
  expiresAt?: string | null;
  vertical?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { rootMargin: '150px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    const remaining = expiresAt ? Math.floor((Date.parse(expiresAt) - Date.now()) / 1000) : 60;
    if (remaining <= 0) {
      setError(true);
      return;
    }
    setError(false);
    void mediaUrl(asset.path, Math.max(1, Math.min(60, remaining)))
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [asset.path, visible, expiresAt, retry]);
  return (
    <div ref={ref} className={`social-media ${vertical ? 'social-media-vertical' : ''}`}>
      {error ? (
        <div className="media-unavailable">
          <p>Media unavailable or link expired.</p>
          <button className="secondary compact" onClick={() => setRetry((value) => value + 1)}>
            Reload media
          </button>
        </div>
      ) : !url ? (
        <div className="media-placeholder" aria-busy="true">
          {visible ? 'Loading media…' : 'Media'}
        </div>
      ) : asset.kind === 'image' ? (
        <img src={url} alt="Member-shared media" loading="lazy" onError={() => setError(true)} />
      ) : asset.kind === 'video' ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          onError={() => setError(true)}
          onPlay={(event) => {
            document.querySelectorAll('video,audio').forEach((element) => {
              if (element !== event.currentTarget) (element as HTMLMediaElement).pause();
            });
          }}
        />
      ) : (
        <audio
          src={url}
          controls
          preload="none"
          onError={() => setError(true)}
          onPlay={(event) => {
            document.querySelectorAll('video,audio').forEach((element) => {
              if (element !== event.currentTarget) (element as HTMLMediaElement).pause();
            });
          }}
        />
      )}
      {asset.attribution && (
        <small className="media-attribution">
          {asset.attribution} · {asset.rights.replaceAll('_', ' ')}
        </small>
      )}
    </div>
  );
}
