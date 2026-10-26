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
  const issuedAt = useRef(0);
  const automaticRetry = useRef(false);
  const playback = useRef({ at: 0, playing: false });
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
        if (alive) {
          issuedAt.current = Date.now();
          setUrl(value);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [asset.path, visible, expiresAt, retry]);
  function renew(event: React.SyntheticEvent<HTMLMediaElement>) {
    playback.current = {
      at: event.currentTarget.currentTime,
      playing: !event.currentTarget.paused,
    };
    if (!automaticRetry.current) {
      automaticRetry.current = true;
      setRetry((value) => value + 1);
    } else setError(true);
  }
  function restore(event: React.SyntheticEvent<HTMLMediaElement>) {
    if (playback.current.at > 0) event.currentTarget.currentTime = playback.current.at;
    if (playback.current.playing) void event.currentTarget.play().catch(() => undefined);
  }
  return (
    <div ref={ref} className={`social-media ${vertical ? 'social-media-vertical' : ''}`}>
      {error ? (
        <div className="media-unavailable">
          <p>Media unavailable or link expired.</p>
          <button
            className="secondary compact"
            onClick={() => {
              automaticRetry.current = false;
              setRetry((value) => value + 1);
            }}
          >
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
          onError={renew}
          onLoadedMetadata={restore}
          onSeeking={(event) => {
            if (Date.now() - issuedAt.current > 50_000) renew(event);
          }}
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
          onError={renew}
          onLoadedMetadata={restore}
          onPlay={(event) => {
            if (Date.now() - issuedAt.current > 50_000) {
              renew(event);
              return;
            }
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
