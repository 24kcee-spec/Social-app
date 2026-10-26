'use client';
import { useEffect, useRef } from 'react';
export function PhotoViewer({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label="Photo viewer"
      onCancel={onClose}
      onClose={onClose}
    >
      <button
        type="button"
        className="secondary"
        onClick={() => {
          dialog.current?.close();
          onClose();
        }}
      >
        Close photo
      </button>
      <img src={url} alt={alt} />
    </dialog>
  );
}
