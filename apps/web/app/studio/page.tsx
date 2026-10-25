'use client';

import { useEffect, useRef, useState } from 'react';
import type { Audience, ContentKind, MediaRights, SocialAsset, Usage } from '@sp/profile-client';
import { PlatformShell } from '../platform-shell';
import { getPlatformClient } from '../../lib/platform';
import { uploadSocialMedia } from '../../lib/media-upload';
import { errorMessage } from '../../lib/auth';

export default function StudioPage() {
  return (
    <PlatformShell
      title="Creator studio"
      description="Publish a post, reel, story or music you have the right to share."
    >
      <Composer />
    </PlatformShell>
  );
}
function Composer() {
  const [kind, setKind] = useState<ContentKind>('post');
  const [audience, setAudience] = useState<Audience>('public');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState<MediaRights>('original');
  const [attribution, setAttribution] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const asset = useRef<SocialAsset | null>(null);
  const clientId = useRef<string | null>(null);
  const uploadId = useRef<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(location.search).get('kind');
    if (value && ['post', 'reel', 'story', 'music'].includes(value)) setKind(value as ContentKind);
    void getPlatformClient()
      .usage()
      .then(setUsage)
      .catch(() => undefined);
  }, []);
  return (
    <div className="studio-layout">
      <section className="social-post">
        <div className="filter-chips" role="group" aria-label="Publication format">
          {(['post', 'reel', 'story', 'music'] as const).map((value) => (
            <button
              key={value}
              className={`chip-btn ${kind === value ? 'on' : ''}`}
              aria-pressed={kind === value}
              disabled={busy}
              onClick={() => {
                setKind(value);
                clientId.current = null;
              }}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            clientId.current ??= crypto.randomUUID();
            uploadId.current ??= crypto.randomUUID();
            try {
              if (file && !asset.current) {
                if (!confirmed)
                  throw new Error('Confirm that you have the right to publish this media.');
                asset.current = await uploadSocialMedia(file, {
                  rights,
                  attribution,
                  clientId: uploadId.current,
                  onProgress: setProgress,
                });
                if (asset.current.status === 'quarantined')
                  throw new Error(
                    'Your media is awaiting moderation. Keep this tab open and retry after approval.',
                  );
              }
              setProgress('Publishing…');
              const post = await getPlatformClient().createPost({
                clientId: clientId.current,
                kind,
                body,
                title,
                assetId: asset.current?.id,
                audience,
              });
              setNotice(
                `Published. ${post.kind === 'story' ? 'This story expires in 24 hours.' : 'Your update is live.'}`,
              );
              setBody('');
              setTitle('');
              setFile(null);
              asset.current = null;
              clientId.current = null;
              uploadId.current = null;
              setConfirmed(false);
              setUsage(await getPlatformClient().usage());
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
              setProgress('');
            }
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            {(kind === 'music' || kind === 'reel') && (
              <label>
                {kind === 'music' ? 'Track title' : 'Video title'}
                <input
                  value={title}
                  maxLength={120}
                  required={kind === 'music'}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clientId.current = null;
                  }}
                />
              </label>
            )}
            <label>
              {kind === 'music' ? 'About this track' : 'What would you like to share?'}
              <textarea
                value={body}
                maxLength={3000}
                rows={5}
                placeholder="A moment, an idea, a conversation…"
                onChange={(event) => {
                  setBody(event.target.value);
                  clientId.current = null;
                }}
              />
            </label>
            <label>
              Audience
              <select
                aria-label="Audience"
                value={audience}
                onChange={(event) => {
                  setAudience(event.target.value as Audience);
                  clientId.current = null;
                }}
              >
                <option value="public">Everyone on Sidle</option>
                <option value="connections">My connections</option>
                <option value="private">Only me</option>
              </select>
            </label>
            <p className="muted">
              A public post shares your display name and its content with other signed-in members,
              even when your profile is hidden from Discover.
            </p>
            <label>
              {kind === 'music'
                ? 'Audio file'
                : kind === 'reel'
                  ? 'Video file'
                  : 'Photo, video or audio'}
              <input
                type="file"
                required={kind !== 'post' && !asset.current}
                accept={
                  kind === 'music'
                    ? 'audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav'
                    : kind === 'reel'
                      ? 'video/mp4,video/webm'
                      : 'image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav'
                }
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  asset.current = null;
                  uploadId.current = null;
                  clientId.current = null;
                }}
              />
            </label>
            {file && (
              <div className="media-upload-details">
                <p>
                  <strong>{file.name}</strong> · {(file.size / 1048576).toFixed(2)} MB
                </p>
                <label>
                  Media rights
                  <select
                    value={rights}
                    onChange={(event) => setRights(event.target.value as MediaRights)}
                  >
                    <option value="original">My original work</option>
                    <option value="permission">I have permission / a licence</option>
                    <option value="public_domain">Public domain</option>
                    <option value="cc0">CC0</option>
                    <option value="cc_by">Creative Commons attribution</option>
                  </select>
                </label>
                <label>
                  Artist, creator and required attribution
                  <input
                    value={attribution}
                    maxLength={500}
                    required={rights === 'cc_by'}
                    onChange={(event) => setAttribution(event.target.value)}
                  />
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I have the rights to publish this file and any music it contains.
                </label>
              </div>
            )}
            <div className="card-actions">
              <button
                disabled={
                  busy ||
                  (!body.trim() && !file && !asset.current) ||
                  (usage?.uploadsEnabled === false && !!file)
                }
              >
                {busy ? progress || 'Working…' : `Publish ${kind}`}
              </button>
              <a
                className="secondary"
                href={
                  kind === 'music'
                    ? '/music'
                    : kind === 'reel'
                      ? '/reels'
                      : kind === 'story'
                        ? '/stories'
                        : '/feed'
                }
              >
                View {kind === 'post' ? 'feed' : kind + 's'}
              </a>
            </div>
          </fieldset>
        </form>
        {error && (
          <p className="notice err" role="alert">
            {error} Your draft remains here.
          </p>
        )}
        {notice && (
          <p className="notice ok" role="status">
            {notice}
          </p>
        )}
      </section>
      <aside className="settings-panel">
        <h2>Publishing essentials</h2>
        <p>
          Stories expire after 24 hours. Videos can be up to 3 minutes / 20 MB. Audio can be up to
          10 minutes / 10 MB. Images can be up to 5 MB.
        </p>
        <p>
          Sidle streams files you upload. Adaptive video processing and a licensed commercial music
          catalogue require configured hosting and rights.
        </p>
        {usage && (
          <p>
            {(usage.usedBytes / 1048576).toFixed(1)} MB of {(usage.limitBytes / 1048576).toFixed(0)}{' '}
            MB personal media allowance reserved.
            {!usage.uploadsEnabled ? ' Uploads are paused.' : ''}
            {usage.mediaReviewRequired ? ' New media requires review.' : ''}
          </p>
        )}
        <a href="/community-guidelines">Community and copyright rules</a>
      </aside>
    </div>
  );
}
