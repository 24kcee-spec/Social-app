'use client';

import React, { useEffect, useState } from 'react';
import type { ShareTargetType } from '@sp/types';

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
  const [qr, setQr] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'qr'>('link');

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://social-app.local';
  const shareUrl = `${baseUrl}/share/${targetType}/${targetId}`;

  const whatsappMessage = encodeURIComponent(
    `Check out "${title}" on Sidle (${areaOrLocation || 'Bulawayo'}):\n${shareUrl}`,
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (activeTab !== 'qr') return;
    let active = true;
    void import('qrcode')
      .then((module) =>
        module.toDataURL(shareUrl, { width: 200, margin: 2, errorCorrectionLevel: 'M' }),
      )
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => setShareError('Could not generate the QR code. Copy the link instead.'));
    return () => {
      active = false;
    };
  }, [activeTab, shareUrl]);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareError('Copy failed. Select and copy the link manually.');
    }
  }

  async function handleNativeShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: description, url: shareUrl });
      } catch {}
    } else {
      handleCopy();
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">SHARE {targetType}</div>
            <h3 id="share-modal-title" style={{ margin: '2px 0 0' }}>
              {title}
            </h3>
          </div>
          <button className="link" onClick={onClose} style={{ margin: 0 }}>
            ✕
          </button>
        </div>

        <div className="auth-nav-switch" role="tablist" style={{ margin: '16px 0' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'link'}
            className={`auth-nav-btn ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            🔗 Invite Link
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'qr'}
            className={`auth-nav-btn ${activeTab === 'qr' ? 'active' : ''}`}
            onClick={() => setActiveTab('qr')}
          >
            📷 QR Code
          </button>
        </div>

        {shareError && <p role="alert">{shareError}</p>}
        {activeTab === 'link' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                readOnly
                value={shareUrl}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <button type="button" className="compact" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px',
                  background: '#25d366',
                  color: '#fff',
                  borderRadius: 'var(--radius-sm)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 650,
                }}
              >
                WhatsApp
              </a>
              <button
                type="button"
                className="secondary"
                onClick={handleNativeShare}
                style={{ padding: '10px', fontSize: '0.9rem' }}
              >
                More Apps…
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
            }}
          >
            <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
              Scan with any phone camera to view and join.
            </p>
            <div
              style={{
                padding: 12,
                background: '#FFFFFF',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
              }}
            >
              <img
                src={qr ?? undefined}
                alt="QR Code"
                style={{ display: 'block', width: 180, height: 180 }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
