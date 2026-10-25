'use client';
import { useEffect, useState } from 'react';
import type { SocialAsset } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { errorMessage } from '../lib/auth';
import { SocialMedia } from './social-media';
interface Ad {
  id: string;
  title: string;
  body: string;
  advertiser: string;
  asset: SocialAsset | null;
}
export function SponsoredPosts() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch('/api/platform/capabilities')
      .then((response) => response.json())
      .then((cap) => (cap.commercialApproval ? getPlatformClient().call<Ad[]>('ads.serve') : []))
      .then(setAds)
      .catch(() => undefined);
  }, []);
  if (!ads.length) return null;
  return (
    <aside aria-label="Sponsored posts">
      {ads.map((ad) => (
        <article className="social-post" key={ad.id}>
          <span className="eyebrow">Sponsored · {ad.advertiser}</span>
          <h3>{ad.title}</h3>
          <p>{ad.body}</p>
          {ad.asset && <SocialMedia asset={ad.asset} />}
          <button
            className="secondary"
            onClick={async () => {
              try {
                const result = await getPlatformClient().call<{ url: string }>('ads.click', {
                  id: ad.id,
                });
                const url = new URL(result.url);
                if (url.protocol !== 'https:') throw new Error('Destination unavailable.');
                window.open(url.href, '_blank', 'noopener,noreferrer');
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            Visit advertiser ↗
          </button>
          <button
            className="link"
            onClick={() => setAds((current) => current.filter((item) => item.id !== ad.id))}
          >
            Hide
          </button>
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
