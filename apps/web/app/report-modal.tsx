"use client";

import { useState } from "react";
import type { ReportReason, ReportTargetType } from "@sp/types";
import { getSafetyClient } from "../lib/safety";
import { errorMessage } from "../lib/auth";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "spam", label: "Spam or automated messages" },
  { value: "inappropriate_content", label: "Inappropriate or explicit content" },
  { value: "hate_speech", label: "Hate speech or discrimination" },
  { value: "impersonation", label: "Impersonation or fake account" },
  { value: "safety_concern", label: "Immediate safety concern" },
  { value: "other", label: "Other issue" },
];

export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel?: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [blockUser, setBlockUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const client = getSafetyClient();
      await client.report({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
        blockUser,
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div className="card" style={{ maxWidth: 480, width: "100%", margin: 0, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Report {targetLabel ?? targetType}</h3>
          <button className="link" onClick={onClose} style={{ margin: 0 }}>Close</button>
        </div>
        {done ? (
          <div>
            <p className="ok">Thank you for letting us know. Our safety moderators have received this report.</p>
            {blockUser && <p className="muted">This user has also been blocked from your feed and messages.</p>}
            <button onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="field">
              <label htmlFor="rep-reason">Why are you reporting this?</label>
              <select id="rep-reason" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="rep-details">Additional details (optional)</label>
              <textarea
                id="rep-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Give us context to help our moderation team investigate…"
              />
            </div>
            {(targetType === "profile" || targetType === "message" || targetType === "event_message") && (
              <label className="check" style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
                <input
                  type="checkbox"
                  checked={blockUser}
                  onChange={(e) => setBlockUser(e.target.checked)}
                />
                <span>Also block this person so they can never see you or contact you</span>
              </label>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="secondary compact" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="compact" disabled={busy}>{busy ? "Submitting…" : "Submit report"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
