"use client";

import { useEffect, useMemo, useState } from "react";
import type { Profile } from "@sp/types";
import { getSignedMediaUrl } from "../lib/profile";

interface MyProfileViewProps {
  profile: Profile;
  onBack: () => void;
  onEdit: () => void;
}

const SOCIAL_STYLE_LABELS: Record<string, string> = {
  small_group: "Small groups",
  one_to_one: "One-to-one",
  text_first: "Text-first",
  voice_first: "Voice-first",
  low_pressure: "Low pressure",
};

const VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  connections: "Connections only",
  private: "Private",
};

const MESSAGE_LABELS: Record<string, string> = {
  everyone: "Messages allowed from eligible members",
  connections: "Messages from connections only",
  nobody: "New messages disabled",
};

export function MyProfileView({ profile, onBack, onEdit }: MyProfileViewProps) {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setMediaLoading(true);
    void Promise.all(
      profile.media.map(async (media) => {
        try {
          return [media.id, await getSignedMediaUrl(media.thumbnailPath)] as const;
        } catch {
          return [media.id, ""] as const;
        }
      }),
    ).then((pairs) => {
      if (active) setMediaUrls(Object.fromEntries(pairs.filter(([, url]) => url)));
    }).finally(() => {
      if (active) setMediaLoading(false);
    });
    return () => { active = false; };
  }, [profile.media]);

  const answeredPrompts = useMemo(
    () => profile.prompts.filter((prompt) => prompt.answer.trim()),
    [profile.prompts],
  );
  const completeness = [
    profile.displayName.trim().length >= 2,
    Boolean(profile.bio.trim()),
    profile.socialStyles.length > 0,
    profile.interests.length >= 3,
    answeredPrompts.length > 0,
    profile.media.length > 0,
  ].filter(Boolean).length;

  return (
    <section className="my-profile-page" aria-labelledby="my-profile-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">PROFILE PREVIEW</span>
          <h1 id="my-profile-title">Your profile</h1>
          <p className="muted">A read-only view of the saved profile fields Sidle uses for introductions. Privacy rules still decide who can see them.</p>
        </div>
        <div className="settings-page-actions">
          <button className="secondary compact" type="button" onClick={onBack}>← Back to Sidle</button>
          <button className="compact" type="button" onClick={onEdit}>Edit profile</button>
        </div>
      </header>

      <section className="settings-account-summary" aria-label="Profile completeness">
        <div className="settings-summary-avatar" aria-hidden="true">{completeness}/6</div>
        <div>
          <h2>Profile readiness</h2>
          <p>{completeness === 6 ? "Your core profile is complete." : `${6 - completeness} core profile item${6 - completeness === 1 ? "" : "s"} can still be added.`}</p>
          <span className="settings-status">This is guidance only; Sidle does not rank people by profile completion.</span>
        </div>
      </section>

      <article className="my-profile-card" aria-busy={mediaLoading}>
        <div className="my-profile-cover">
          {profile.media[0] && mediaUrls[profile.media[0].id] ? (
            <img src={mediaUrls[profile.media[0].id]} alt={`${profile.displayName}'s primary profile photo`} />
          ) : (
            <div className="my-profile-initial" aria-hidden="true">{profile.displayName.trim().charAt(0).toUpperCase() || "S"}</div>
          )}
        </div>
        <div className="my-profile-body">
          <span className="eyebrow">MEMBER PROFILE</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 10px" }}>
            <h2 style={{ margin: 0 }}>{profile.displayName}</h2>
            {profile.verificationLevel === "student_verified" && (
              <span className="campus-badge" title="Academic email confirmed">✓ Academic email</span>
            )}
            {profile.verificationLevel === "trusted" && (
              <span className="campus-badge trusted" title="Trusted Community Member">★ Trusted</span>
            )}
          </div>
          <p className="my-profile-bio">{profile.bio || "No bio added yet."}</p>

          {profile.media.length > 1 && (
            <section className="my-profile-section" aria-labelledby="my-profile-photos">
              <h3 id="my-profile-photos">Photos</h3>
              <div className="my-profile-photo-grid">
                {profile.media.slice(1).map((media, index) => mediaUrls[media.id] ? (
                  <img key={media.id} src={mediaUrls[media.id]} alt={`${profile.displayName}'s profile photo ${index + 2}`} />
                ) : null)}
              </div>
            </section>
          )}

          <section className="my-profile-section" aria-labelledby="my-profile-style">
            <h3 id="my-profile-style">How I like to connect</h3>
            <div className="my-profile-chip-list">
              {profile.socialStyles.length ? profile.socialStyles.map((style) => (
                <span className="my-profile-chip" key={style}>{SOCIAL_STYLE_LABELS[style] ?? style}</span>
              )) : <span className="muted">No connection preferences added yet.</span>}
            </div>
          </section>

          <section className="my-profile-section" aria-labelledby="my-profile-interests">
            <h3 id="my-profile-interests">Interests</h3>
            <div className="my-profile-chip-list">
              {profile.interests.length ? profile.interests.map((interest) => (
                <span className="my-profile-chip" key={interest.id}>{interest.name}</span>
              )) : <span className="muted">No interests added yet.</span>}
            </div>
          </section>

          <section className="my-profile-section" aria-labelledby="my-profile-prompts">
            <h3 id="my-profile-prompts">Conversation starters</h3>
            {answeredPrompts.length ? (
              answeredPrompts.map((prompt) => (
                <div className="my-profile-prompt" key={prompt.promptId}>
                  <strong>{prompt.prompt}</strong>
                  <p>{prompt.answer}</p>
                </div>
              ))
            ) : <p className="muted">Add a prompt answer to make it easier for people to start a conversation.</p>}
          </section>

          <section className="my-profile-section" aria-labelledby="my-profile-privacy">
            <h3 id="my-profile-privacy">Current privacy boundary</h3>
            <div className="my-profile-chip-list">
              <span className="my-profile-chip">{profile.privacy.discoverable ? "Included in eligible discovery" : "Hidden from discovery"}</span>
              <span className="my-profile-chip">{MESSAGE_LABELS[profile.privacy.messagePermission] ?? profile.privacy.messagePermission}</span>
              <span className="my-profile-chip">Stories: {VISIBILITY_LABELS[profile.privacy.storyVisibility] ?? profile.privacy.storyVisibility}</span>
              <span className="my-profile-chip">Activity: {VISIBILITY_LABELS[profile.privacy.activityVisibility] ?? profile.privacy.activityVisibility}</span>
            </div>
            <p className="muted" style={{ marginTop: 10 }}>These controls are not public profile claims; they explain the saved rules currently protecting this profile.</p>
          </section>
        </div>
      </article>
    </section>
  );
}
