'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_PHOTO_EDIT, PHOTO_FILTERS, photoGeometry, renderPhoto } from '../lib/photo-editor';
import { PROFILE_MEDIA_MAX_BYTES, PROFILE_MEDIA_MAX_DIMENSION } from '../lib/profile';
import { errorMessage } from '../lib/auth';
import { UiIcon } from './ui-icon';

export default function PhotoEditor({
  file,
  replacing,
  onSave,
  onClose,
}: {
  file: File;
  replacing: boolean;
  onSave: (file: File) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null);
  const [edit, setEdit] = useState({ ...DEFAULT_PHOTO_EDIT });
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    rangeX: number;
    rangeY: number;
  } | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = oldOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size < 1 ||
      file.size > PROFILE_MEDIA_MAX_BYTES
    ) {
      setError('Choose a JPG, PNG or WebP image, up to 5 MB.');
      return;
    }
    let active = true;
    const url = URL.createObjectURL(file),
      source = new Image();
    setSourceUrl(url);
    source.onload = () => {
      if (!active) return;
      if (
        !source.naturalWidth ||
        !source.naturalHeight ||
        Math.max(source.naturalWidth, source.naturalHeight) > PROFILE_MEDIA_MAX_DIMENSION
      ) {
        setError('Choose an image with dimensions up to 8000 pixels.');
        return;
      }
      image.current = source;
      setReady(true);
    };
    source.onerror = () => {
      if (active) setError('That image could not be opened. Choose a different photo.');
    };
    source.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
      image.current = null;
    };
  }, [file]);
  useEffect(() => {
    if (ready && canvas.current && image.current)
      renderPhoto(canvas.current, image.current, edit, 700);
  }, [ready, edit]);
  async function save() {
    if (!image.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const output = document.createElement('canvas');
      renderPhoto(output, image.current, edit, 1400);
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('The photo could not be processed.')),
          'image/jpeg',
          0.9,
        ),
      );
      await onSave(new File([blob], 'sidle-profile.jpg', { type: 'image/jpeg' }));
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="photo-editor-dialog"
      aria-labelledby="photo-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="photo-editor-header">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h2 id="photo-editor-title">Edit your photo</h2>
        </div>
        <button
          type="button"
          className="icon-control"
          aria-label="Close photo editor"
          disabled={busy}
          onClick={onClose}
        >
          <UiIcon name="close" />
        </button>
      </header>
      <div className="photo-editor-layout">
        <div className="photo-editor-preview">
          <div className="photo-crop-stage">
            <canvas
              ref={canvas}
              aria-label="Cropped photo preview"
              onPointerDown={(event) => {
                if (!ready || busy || !image.current) return;
                const geometry = photoGeometry(
                  image.current.naturalWidth,
                  image.current.naturalHeight,
                  event.currentTarget.clientWidth,
                  edit,
                );
                drag.current = {
                  x: edit.x,
                  y: edit.y,
                  startX: event.clientX,
                  startY: event.clientY,
                  rangeX: geometry.rangeX,
                  rangeY: geometry.rangeY,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = drag.current;
                if (!start) return;
                setEdit((value) => ({
                  ...value,
                  x: start.rangeX
                    ? Math.max(
                        -1,
                        Math.min(1, start.x + (event.clientX - start.startX) / start.rangeX),
                      )
                    : 0,
                  y: start.rangeY
                    ? Math.max(
                        -1,
                        Math.min(1, start.y + (event.clientY - start.startY) / start.rangeY),
                      )
                    : 0,
                }));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            />
            <div className="photo-crop-guides" aria-hidden="true" />
            {!ready && (
              <span className="photo-loading">
                {error ? 'Choose another photo to continue' : 'Opening photo…'}
              </span>
            )}
          </div>
          <p className="muted">Drag to reposition. The circle shows your avatar crop.</p>
        </div>
        <div className="photo-editor-controls">
          <fieldset disabled={!ready || busy}>
            <legend className="sidle-sr-only">Photo adjustments</legend>
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={edit.zoom}
                onChange={(event) => setEdit({ ...edit, zoom: Number(event.target.value) })}
              />
            </label>
            <div className="photo-position-controls">
              <label>
                Horizontal position
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={edit.x}
                  onChange={(event) => setEdit({ ...edit, x: Number(event.target.value) })}
                />
              </label>
              <label>
                Vertical position
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={edit.y}
                  onChange={(event) => setEdit({ ...edit, y: Number(event.target.value) })}
                />
              </label>
            </div>
            <div className="photo-transform-actions">
              <button
                type="button"
                className="secondary compact"
                onClick={() =>
                  setEdit({ ...edit, rotation: (edit.rotation + 90) % 360, x: 0, y: 0 })
                }
              >
                <UiIcon name="rotate" size={17} />
                Rotate
              </button>
              <button
                type="button"
                className="secondary compact"
                aria-pressed={edit.flip}
                onClick={() => setEdit({ ...edit, flip: !edit.flip })}
              >
                <UiIcon name="flip" size={17} />
                Flip
              </button>
            </div>
            <label>
              Brightness
              <input
                type="range"
                min="0.65"
                max="1.35"
                step="0.01"
                value={edit.brightness}
                onChange={(event) => setEdit({ ...edit, brightness: Number(event.target.value) })}
              />
            </label>
            <div>
              <strong className="photo-filter-heading">Filters</strong>
              <div className="photo-filter-grid" role="group" aria-label="Photo filters">
                {PHOTO_FILTERS.map((filter) => (
                  <button
                    type="button"
                    key={filter.id}
                    aria-pressed={edit.filter === filter.id}
                    className="photo-filter"
                    onClick={() => setEdit({ ...edit, filter: filter.id })}
                  >
                    <span
                      style={{
                        backgroundImage: sourceUrl
                          ? `url(${sourceUrl})`
                          : 'linear-gradient(135deg, #f0b87b, #9184bb 55%, #3b6e72)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        filter: filter.value,
                      }}
                      aria-hidden="true"
                    />
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="link"
              onClick={() => setEdit({ ...DEFAULT_PHOTO_EDIT })}
            >
              Reset adjustments
            </button>
          </fieldset>
        </div>
      </div>
      {error && (
        <p className="notice err" role="alert">
          {error}
        </p>
      )}
      <footer className="photo-editor-footer">
        <p className="muted">
          {replacing
            ? 'Your current photo stays until you save.'
            : 'Preview first. Upload only when you save.'}
        </p>
        <div>
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={!ready || busy} onClick={() => void save()}>
            {busy ? 'Saving photo…' : 'Save photo'}
          </button>
        </div>
      </footer>
    </dialog>
  );
}
