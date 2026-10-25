'use client';
import { useEffect, useState } from 'react';
import type { Profile } from '@sp/types';
import type { ProfileDetails } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { getSignedMediaUrl } from '../lib/profile';
import { SocialFeed } from './social-feed';

export function ProfileDashboard({
  profile,
  onEdit,
  onSettings,
}: {
  profile: Profile;
  onEdit: () => void;
  onSettings?: () => void;
}) {
  const [tab, setTab] = useState<'posts' | 'photos' | 'about'>('posts');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  useEffect(() => {
    let alive = true;
    void getPlatformClient()
      .getProfile()
      .then((value) => {
        if (alive) setDetails(value);
      })
      .catch(() => undefined);
    void Promise.all(
      profile.media.map(async (media) => {
        try {
          return [media.id, await getSignedMediaUrl(media.thumbnailPath)] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      if (alive) setUrls(Object.fromEntries(pairs.filter((pair) => pair !== null)));
    });
    return () => {
      alive = false;
    };
  }, [profile.userId, profile.media]);
  return (
    <section className="profile-dashboard" aria-label="Your profile">
      <header className="profile-identity">
        {profile.media[0] && urls[profile.media[0].id] ? (
          <img
            className="profile-identity-photo"
            src={urls[profile.media[0].id]}
            alt={`${profile.displayName}'s profile photo`}
          />
        ) : (
          <div className="profile-identity-photo profile-identity-initial" aria-hidden="true">
            {profile.displayName[0]}
          </div>
        )}
        <div>
          <h1>{profile.displayName}</h1>
          {details?.handle && <div className="profile-handle">@{details.handle}</div>}
          <div className="profile-statistics">
            <span>
              <strong>{details?.posts ?? '—'}</strong>Posts
            </span>
            <span>
              <strong>{details?.followers ?? '—'}</strong>Followers
            </span>
            <span>
              <strong>{details?.following ?? '—'}</strong>Following
            </span>
          </div>
          <p className="profile-bio">{profile.bio || 'Tell people a little about yourself.'}</p>
          {details?.campus && (
            <p className="muted">
              {[details.campus, details.course, details.year].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="card-actions">
          <button onClick={onEdit}>Edit profile</button>
          {onSettings && (
            <button className="secondary" onClick={onSettings}>
              Settings
            </button>
          )}
          <a className="secondary" href="/studio">
            ＋ Create
          </a>
        </div>
      </header>
      <div className="feature-hub">
        <a href="/feed">▦ Feed</a>
        <a href="/reels">▷ Reels</a>
        <a href="/stories">◉ Stories</a>
        <a href="/music">♫ Music</a>
        <a href="/activity">♧ Activity</a>
        <a href="/billing">Billing & ads</a>
      </div>
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {(['posts', 'photos', 'about'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value[0]!.toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'posts' ? (
        <SocialFeed userId={profile.userId} compact />
      ) : tab === 'photos' ? (
        <section className="settings-panel">
          <h2>Profile photos</h2>
          {profile.media.length ? (
            <div className="profile-gallery">
              {profile.media.map((media) =>
                urls[media.id] ? (
                  <img
                    key={media.id}
                    src={urls[media.id]}
                    alt="Your saved profile photo"
                    loading="lazy"
                  />
                ) : null,
              )}
            </div>
          ) : (
            <p>No profile photos yet.</p>
          )}
          <button className="secondary" onClick={onEdit}>
            Manage photos
          </button>
        </section>
      ) : (
        <div className="profile-about-grid">
          <section className="settings-panel">
            <h2>Interests</h2>
            <div className="my-profile-chip-list">
              {profile.interests.map((interest) => (
                <span className="my-profile-chip" key={interest.id}>
                  {interest.name}
                </span>
              ))}
            </div>
            <h3>About your profile</h3>
            <p className="muted">
              {profile.privacy.discoverable
                ? 'Eligible members can find you in Discover.'
                : 'Your profile is hidden from Discover.'}{' '}
              Individual posts have their own audience.
            </p>
            <a href="/settings/privacy">Manage privacy</a>
          </section>
          <section className="settings-panel">
            <h2>Conversation starters</h2>
            {profile.prompts.map((prompt) => (
              <div className="my-profile-prompt" key={prompt.promptId}>
                <strong>{prompt.prompt}</strong>
                <p>{prompt.answer}</p>
              </div>
            ))}
            <button className="secondary" onClick={onEdit}>
              Update answers
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
