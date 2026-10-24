'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { BlockedUser, Profile } from '@sp/types';
import { errorMessage } from '../lib/auth';
import { getDiscoveryClient } from '../lib/discovery';
import { getProfileClient } from '../lib/profile';

export function PrivacySettings({
  profile,
  onSaved,
  onBack,
  onDirtyChange,
  renderControls,
}: {
  profile: Profile;
  onSaved: (profile: Profile) => void;
  onBack: () => void;
  onDirtyChange: (dirty: boolean, busy?: boolean) => void;
  renderControls: (
    privacy: Profile['privacy'],
    setPrivacy: (value: Profile['privacy']) => void,
  ) => ReactNode;
}) {
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [saving, setSaving] = useState(false);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = JSON.stringify(privacy) !== JSON.stringify(profile.privacy);

  useEffect(() => {
    onDirtyChange(dirty, saving);
  }, [dirty, saving, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);

  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    setError(null);
    try {
      setBlocks(await getDiscoveryClient().listBlocks());
    } catch (err) {
      setError(errorMessage(err));
      setBlocks(null);
    } finally {
      setBlocksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  const updateDraft = (next: Profile['privacy']) => {
    setPrivacy(next);
    setNotice(null);
  };

  return (
    <section
      className="settings-page"
      id="privacy-settings"
      tabIndex={-1}
      aria-labelledby="privacy-title"
    >
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">YOUR BOUNDARIES</span>
          <h1 id="privacy-title">Privacy & safety</h1>
          <p className="muted">Control discovery, message permissions and blocked accounts. Draft changes are not active until you save them.</p>
        </div>
        <button type="button" className="secondary compact" onClick={onBack} disabled={saving}>
          Back to Settings
        </button>
      </header>

      {dirty && (
        <p className="notice" role="status" aria-live="polite">
          You have unsaved privacy changes.
        </p>
      )}
      {error && (
        <p className="notice err" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice ok" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <section className="settings-panel" aria-labelledby="visibility-contact-title" aria-busy={saving}>
        <h2 id="visibility-contact-title">Visibility and contact</h2>
        <p className="muted">These choices affect future discovery and contact checks. Existing blocks always take priority.</p>
        <fieldset
          aria-label="Privacy controls"
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          {renderControls(privacy, updateDraft)}
        </fieldset>
        <div className="card-actions">
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={async () => {
              setSaving(true);
              setError(null);
              setNotice(null);
              try {
                const saved = await getProfileClient().updateProfile({ privacy });
                onSaved(saved);
                setPrivacy(saved.privacy);
                setNotice('Privacy settings saved.');
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save privacy settings'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!dirty || saving}
            onClick={() => {
              setPrivacy(profile.privacy);
              setError(null);
              setNotice('Unsaved privacy changes discarded.');
            }}
          >
            Discard
          </button>
        </div>
      </section>

      <section className="settings-panel" aria-labelledby="blocked-title" aria-busy={blocksLoading || unblocking !== null}>
        <div className="settings-panel-heading">
          <div>
            <h2 id="blocked-title">Blocked accounts</h2>
            <p className="muted">Blocking is immediate. Unblocking does not restore a previous connection or conversation permission.</p>
          </div>
          {blocks && <span className="settings-status">{blocks.length} blocked</span>}
        </div>
        {blocks === null ? (
          <>
            <p role="status" aria-live="polite">
              {blocksLoading
                ? 'Loading blocked accounts…'
                : 'Blocked accounts could not be loaded.'}
            </p>
            {!blocksLoading && (
              <button type="button" className="secondary" onClick={() => void loadBlocks()}>
                Retry
              </button>
            )}
          </>
        ) : blocks.length === 0 ? (
          <p className="muted">You have no blocked accounts.</p>
        ) : (
          <ul className="blocked-account-list">
            {blocks.map((block) => (
              <li key={block.userId}>
                <span>{block.displayName}</span>{' '}
                <button
                  type="button"
                  className="secondary compact"
                  disabled={unblocking !== null}
                  aria-busy={unblocking === block.userId}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Unblock ${block.displayName}? This does not restore your previous connection.`,
                      )
                    )
                      return;
                    setUnblocking(block.userId);
                    setError(null);
                    setNotice(null);
                    try {
                      await getDiscoveryClient().unblock(block.userId);
                      setBlocks(
                        (current) => current?.filter((b) => b.userId !== block.userId) ?? null,
                      );
                      setNotice('Account unblocked. Previous connections are not restored.');
                    } catch (err) {
                      setError(errorMessage(err));
                    } finally {
                      setUnblocking(null);
                    }
                  }}
                >
                  {unblocking === block.userId ? 'Unblocking…' : 'Unblock'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
