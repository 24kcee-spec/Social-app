'use client';
import { MemberActions } from '../../member-actions';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { ProfileDetails } from '@sp/profile-client';
import { PlatformShell } from '../../platform-shell';
import { SocialFeed } from '../../social-feed';
import { getPlatformClient } from '../../../lib/platform';
import { errorMessage } from '../../../lib/auth';
export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <PlatformShell title="Member profile">
      <Member id={id} />
    </PlatformShell>
  );
}
function Member({ id }: { id: string }) {
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getPlatformClient()
      .getProfile(id)
      .then((value) => {
        if (alive) setDetails(value);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err));
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return error ? (
    <p role="alert" className="notice err">
      {error}
    </p>
  ) : !details ? (
    <p>Loading profile…</p>
  ) : (
    <>
      <header className="profile-identity">
        <div className="profile-identity-photo profile-identity-initial" aria-hidden="true">
          {details.displayName[0]}
        </div>
        <div>
          <h1>{details.displayName}</h1>
          {details.handle && <p className="profile-handle">@{details.handle}</p>}
          <p>{details.bio}</p>
          {details.campus && (
            <p>{[details.campus, details.course, details.year].filter(Boolean).join(' · ')}</p>
          )}
          {details.website && (
            <a href={details.website} rel="noopener noreferrer" target="_blank">
              Website
            </a>
          )}
          <div className="profile-statistics">
            <span>
              <strong>{details.posts}</strong>Posts
            </span>
            <span>
              <strong>{details.followers}</strong>Followers
            </span>
            <span>
              <strong>{details.following}</strong>Following
            </span>
          </div>
        </div>
        <a className="secondary" href={`/share/profile/${id}`}>
          View introduction
        </a>
      </header>
      <MemberActions id={id} name={details.displayName} />
      <div style={{ marginTop: 24 }}>
        <SocialFeed userId={id} compact />
      </div>
    </>
  );
}
