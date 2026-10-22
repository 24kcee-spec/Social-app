"use client";

import { useEffect, useState } from "react";
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

export function MyProfileView({ profile, onBack, onEdit }: MyProfileViewProps) {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
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
    });
    return () => { active = false; };
  }, [profile.media]);

  return (
    <section className="my-profile-page" aria-labelledby="my-profile-title">
      <header className="settings-page-header">
        <div>
          <span className="eyebrow">PROFILE PREVIEW</span>
          <h1 id="my-profile-title">Your profile</h1>
          <p className="muted">A read-only view of your saved profile details. Edit them separately when something changes.</p>
        </div>
        <div className="settings-page-actions">
          <button className="secondary compact" type="button" onClick={onBack}>← Back to Social</button>
          <button className="compact" type="button" onClick={onEdit}>Edit profile</button>
        </div>
      </header>

      <article className="my-profile-card">
        <div className="my-profile-cover">
          {profile.media[0] && mediaUrls[profile.media[0].id] ? (
            <img src={mediaUrls[profile.media[0].id]} alt={`${profile.displayName}'s profile`} />
          ) : (
            <div className="my-profile-initial" aria-hidden="true">{profile.displayName.trim().charAt(0).toUpperCase() || "S"}</div>
          )}
        </div>
        <div className="my-profile-body">
          <span className="eyebrow">MEMBER PROFILE</span>
          <h2>{profile.displayName}</h2>
          <p className="my-profile-bio">{profile.bio || "No bio added yet."}</p>

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
            {profile.prompts.filter((prompt) => prompt.answer.trim()).length ? (
              profile.prompts.filter((prompt) => prompt.answer.trim()).map((prompt) => (
                <div className="my-profile-prompt" key={prompt.promptId}>
                  <strong>{prompt.prompt}</strong>
                  <p>{prompt.answer}</p>
                </div>
              ))
            ) : <p className="muted">Add a prompt answer to make it easier for people to start a conversation.</p>}
          </section>
        </div>
      </article>
    </section>
  );
}
