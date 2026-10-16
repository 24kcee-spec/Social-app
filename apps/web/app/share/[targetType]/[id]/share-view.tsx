"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventSharePreview, GroupSharePreview, ProfileSharePreview, ShareTargetType } from "@sp/types";

export interface ShareViewProps {
  targetType: ShareTargetType;
  id: string;
  preview: GroupSharePreview | EventSharePreview | ProfileSharePreview | null;
  error?: string | null;
  canonicalUrl: string;
  deepLink: string;
}

export function ShareClientView({
  targetType,
  id,
  preview,
  error,
  canonicalUrl,
  deepLink,
}: ShareViewProps) {
  const [copied, setCopied] = useState(false);
  const [attemptedApp, setAttemptedApp] = useState(false);

  function copyLink() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function openApp() {
    setAttemptedApp(true);
    window.location.href = deepLink;
    // If app is not installed, fallback after short timeout
    setTimeout(() => {
      setAttemptedApp(false);
    }, 2000);
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share && preview) {
      const title =
        targetType === "group"
          ? (preview as GroupSharePreview).name
          : targetType === "event"
          ? (preview as EventSharePreview).title
          : (preview as ProfileSharePreview).displayName;
      const desc = "description" in preview ? preview.description : preview.bio;
      try {
        await navigator.share({
          title: `${title} · Social App`,
          text: desc || undefined,
          url: canonicalUrl,
        });
      } catch {}
    } else {
      copyLink();
    }
  }

  if (error || !preview) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card-editorial" style={{ textAlign: "center" }}>
          <div className="auth-brand-badge">✦ Social Connection</div>
          <h2 style={{ margin: "12px 0 6px" }}>
            {error === "private" ? "Private content" : "Link unavailable"}
          </h2>
          <p className="muted" style={{ margin: "0 auto 20px", maxWidth: 360 }}>
            {error === "private"
              ? "This user or space is not publicly discoverable."
              : "This share link may have expired, been removed, or does not exist."}
          </p>
          <Link href="/" className="auth-submit-btn" style={{ textDecoration: "none" }}>
            Explore Social App
          </Link>
        </div>
      </div>
    );
  }

  const isGroup = targetType === "group";
  const isEvent = targetType === "event";
  const isProfile = targetType === "profile";

  const group = isGroup ? (preview as GroupSharePreview) : null;
  const event = isEvent ? (preview as EventSharePreview) : null;
  const profile = isProfile ? (preview as ProfileSharePreview) : null;

  const returnUrl = `/?next=${encodeURIComponent(`/share/${targetType}/${id}`)}`;

  return (
    <div className="auth-wrapper">
      <div className="auth-card-editorial" style={{ maxWidth: 540 }}>
        <header style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="auth-brand-badge">
              ✦ {targetType.toUpperCase()} INVITATION
            </span>
            <button type="button" className="link" onClick={nativeShare} style={{ margin: 0 }}>
              Share ↗
            </button>
          </div>

          <h1 style={{ fontSize: "1.75rem", margin: "12px 0 6px" }}>
            {group?.name || event?.title || profile?.displayName}
          </h1>

          {event && (
            <p className="muted" style={{ margin: "0 0 4px", fontWeight: 600 }}>
              Hosted by {event.groupName} · {event.generalArea}
            </p>
          )}

          {group && (
            <p className="muted" style={{ margin: "0 0 4px", fontWeight: 600 }}>
              {group.generalArea} · {group.memberCount}/{group.capacity} members
            </p>
          )}

          {profile && (
            <p className="muted" style={{ margin: "0 0 4px" }}>
              {profile.verificationLevel === "student_verified"
                ? "✓ Campus verified"
                : "Verified profile"}
            </p>
          )}
        </header>

        {/* Content details */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(group?.description || event?.description) && (
            <blockquote className="intro-quote" style={{ margin: 0 }}>
              "{group?.description || event?.description}"
            </blockquote>
          )}

          {profile?.bio && (
            <blockquote className="intro-quote" style={{ margin: 0 }}>
              "{profile.bio}"
            </blockquote>
          )}

          {/* Event metadata card */}
          {event && (
            <div
              style={{
                background: "var(--surface-sunken)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                fontSize: "0.88rem",
              }}
            >
              <div>
                <span className="muted">Time:</span>{" "}
                <strong>
                  {new Date(event.startsAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </strong>
              </div>
              <div>
                <span className="muted">Availability:</span>{" "}
                <strong>{event.isFull ? "Waitlist only" : `${event.spotsLeft} spots left`}</strong>
              </div>
            </div>
          )}

          {/* Activities / Interests */}
          {group && group.activities.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {group.activities.map((a) => (
                <span key={a} className="chip-neutral">
                  {a}
                </span>
              ))}
            </div>
          )}

          {profile && profile.interests.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {profile.interests.map((i) => (
                <span key={i} className="chip-neutral">
                  {i}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          <button
            type="button"
            className="auth-submit-btn"
            onClick={openApp}
            style={{ margin: 0 }}
          >
            {attemptedApp ? "Opening app…" : "Open in Social App"}
          </button>

          <Link
            href={returnUrl}
            className="auth-submit-btn secondary"
            style={{ textDecoration: "none", margin: 0 }}
          >
            {isGroup
              ? "Continue on Web & Join Group"
              : isEvent
              ? "Continue on Web & RSVP"
              : "Continue on Web & Say Hi"}
          </Link>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <input
              readOnly
              value={canonicalUrl}
              style={{ flex: 1, fontSize: "0.82rem", fontFamily: "monospace" }}
            />
            <button
              type="button"
              className="secondary compact"
              onClick={copyLink}
              style={{ minWidth: 80 }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <footer style={{ marginTop: 20, textAlign: "center" }}>
          <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
            Social App is a low-pressure community platform. Your exact location is never shared.
          </p>
        </footer>
      </div>
    </div>
  );
}
