"use client";

import React, { useState } from "react";
import type { ShareTargetType } from "@sp/types";

export function ShareModal({
  targetType,
  targetId,
  title,
  description,
  areaOrLocation,
  onClose,
}: {
  targetType: ShareTargetType;
  targetId: string;
  title: string;
  description?: string;
  areaOrLocation?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"link" | "qr">("link");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://social-app.local";
  const shareUrl = `${baseUrl}/share/${targetType}/${targetId}`;

  const whatsappMessage = encodeURIComponent(
    `Check out "${title}" on Social App (${areaOrLocation || "Bulawayo"}):\n${shareUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleNativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: description, url: shareUrl });
      } catch {}
    } else {
      handleCopy();
    }
  }

  return (
    <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div className="card" style={{ maxWidth: 440, width: "100%", margin: 0, background: "#fff", borderRadius: 20, padding: 24, color: "#0f172a" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", letterSpacing: "0.05em", textTransform: "uppercase" }}>SHARE {targetType}</div>
            <h3 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700 }}>{title}</h3>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", background: "#f8fafc", borderRadius: 10, padding: 4, marginBottom: 16 }}>
          <button onClick={() => setActiveTab("link")} style={{ flex: 1, border: "none", background: activeTab === "link" ? "#fff" : "transparent", color: activeTab === "link" ? "#4f46e5" : "#64748b", fontWeight: 600, padding: "8px 0", borderRadius: 8, cursor: "pointer" }}>🔗 Invite Link</button>
          <button onClick={() => setActiveTab("qr")} style={{ flex: 1, border: "none", background: activeTab === "qr" ? "#fff" : "transparent", color: activeTab === "qr" ? "#4f46e5" : "#64748b", fontWeight: 600, padding: "8px 0", borderRadius: 8, cursor: "pointer" }}>📷 QR Code</button>
        </div>

        {activeTab === "link" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8, background: "#f1f5f9", padding: "8px 12px", borderRadius: 10 }}>
              <input readOnly value={shareUrl} style={{ flex: 1, background: "transparent", border: "none", fontSize: 12, fontFamily: "monospace", outline: "none" }} />
              <button onClick={handleCopy} style={{ background: copied ? "#10b981" : "#4f46e5", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{copied ? "Copied!" : "Copy"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px", background: "#25d366", color: "#fff", borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600 }}>WhatsApp</a>
              <button onClick={handleNativeShare} style={{ padding: "10px", background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>More Apps…</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", textAlign: "center" }}>Scan with any phone camera to view and join.</p>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`} alt="QR Code" style={{ borderRadius: 12, border: "1px solid #e2e8f0", width: 180, height: 180 }} />
          </div>
        )}
      </div>
    </div>
  );
}
