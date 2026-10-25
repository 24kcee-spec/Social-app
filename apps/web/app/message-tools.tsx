'use client';
import { useEffect, useRef, useState } from 'react';
import type { RichMessage } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { uploadSocialMedia, SOCIAL_MEDIA_TYPES, supportedRecordingMime } from '../lib/media-upload';
import { errorMessage } from '../lib/auth';
import { SocialMedia } from './social-media';

export function MessageDetails({
  message,
  mine,
  onReply,
  onChanged,
}: {
  message: RichMessage;
  mine: boolean;
  onReply: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChanged();
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  if (message.deleted) return <small>Message removed</small>;
  return (
    <div className="message-tools">
      {message.replyTo && <blockquote>{message.replyBody ?? 'Earlier message'}</blockquote>}
      {message.asset && <SocialMedia asset={message.asset} />}
      <div className="card-actions">
        {message.reactions.map((reaction) => (
          <button
            type="button"
            className="link"
            disabled={busy}
            key={reaction.reaction}
            onClick={() =>
              void act(() =>
                getPlatformClient().reactMessage(
                  message.id,
                  reaction.mine ? null : reaction.reaction,
                ),
              )
            }
          >
            {reaction.reaction} {reaction.count}
          </button>
        ))}
        <button type="button" className="link" onClick={onReply}>
          Reply
        </button>
        <button
          type="button"
          className="link"
          disabled={busy}
          onClick={() => void act(() => getPlatformClient().reactMessage(message.id, 'love'))}
        >
          ♡
        </button>
        {mine && (
          <>
            <button type="button" className="link" onClick={() => setEditing((value) => !value)}>
              Edit
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Remove this message for everyone?'))
                  void act(() => getPlatformClient().deleteMessage(message.id));
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
      {message.editedAt && <small>Edited</small>}
      {editing && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(() => getPlatformClient().editMessage(message.id, text));
          }}
        >
          <label>
            Replacement text
            <input
              required
              value={text}
              maxLength={2000}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <p className="muted">Editing is available for 15 minutes after sending.</p>
          <button disabled={busy}>Save edit</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function RichComposer({
  conversationId,
  replyTo,
  onCancelReply,
  onSent,
}: {
  conversationId: string;
  replyTo: { id: string; body: string } | null;
  onCancelReply: () => void;
  onSent: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rights, setRights] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tag = useRef(crypto.randomUUID());
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const key = `sidle-rich-draft:${conversationId}`;
  useEffect(() => {
    tag.current = crypto.randomUUID();
  }, [replyTo?.id]);
  useEffect(() => {
    try {
      setText(sessionStorage.getItem(key) ?? '');
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [key]);
  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(key, text);
      else sessionStorage.removeItem(key);
    } catch {}
  }, [text, key]);
  async function record() {
    tag.current = crypto.randomUUID();
    setError(null);
    try {
      const mime = supportedRecordingMime();
      if (!mime || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Voice recording is unavailable in this browser. You can attach an audio file.',
        );
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const instance = new MediaRecorder(stream.current, { mimeType: mime });
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      const started = Date.now();
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setSeconds(Math.max(1, Math.ceil((Date.now() - started) / 1000)));
        const type = mime.split(';')[0]!;
        setFile(
          new File(
            chunks,
            `voice-${Date.now()}.${type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm'}`,
            { type },
          ),
        );
        setVoice(true);
        setRights(true);
      };
      instance.start(1000);
      setRecording(true);
      timer.current = setTimeout(() => instance.state === 'recording' && instance.stop(), 119000);
    } catch (err) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(errorMessage(err));
    }
  }
  async function send() {
    setBusy(true);
    setError(null);
    try {
      let assetId: string | undefined;
      if (file) {
        if (!rights) throw new Error('Confirm that you can share this attachment.');
        if (uploaded.current?.file === file) assetId = uploaded.current.id;
        else {
          const asset = await uploadSocialMedia(file, {
            rights: 'permission',
            voice,
            durationSeconds: voice ? seconds : undefined,
            onProgress: setNotice,
          });
          uploaded.current = { file, id: asset.id };
          assetId = asset.id;
        }
      }
      setNotice('Sending…');
      await getPlatformClient().sendRichMessage({
        conversationId,
        clientId: tag.current,
        body: text.trim(),
        assetId,
        replyTo: replyTo?.id,
      });
      tag.current = crypto.randomUUID();
      setText('');
      setFile(null);
      uploaded.current = null;
      setNotice('');
      onCancelReply();
      await onSent().catch(() => setNotice('Message sent. Refresh the conversation to load it.'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rich-composer">
      {replyTo && (
        <div className="card-actions">
          <blockquote>Replying to: {replyTo.body.slice(0, 100)}</blockquote>
          <button className="link" onClick={onCancelReply}>
            Cancel reply
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sidle-sr-only" htmlFor="rich-message-text">
          Message
        </label>
        <textarea
          id="rich-message-text"
          value={text}
          maxLength={2000}
          disabled={busy}
          onChange={(event) => {
            setText(event.target.value);
            tag.current = crypto.randomUUID();
          }}
          placeholder="Write a message…"
          rows={2}
        />
        <div className="card-actions">
          <label className="secondary compact">
            Attach
            <input
              type="file"
              accept={SOCIAL_MEDIA_TYPES.join(',')}
              disabled={busy || recording}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                tag.current = crypto.randomUUID();
                setVoice(false);
                setRights(false);
              }}
            />
          </label>
          <button
            type="button"
            className="secondary compact"
            disabled={busy}
            onClick={() => (recording ? recorder.current?.stop() : void record())}
          >
            {recording ? 'Stop recording' : 'Record voice'}
          </button>
          <button disabled={busy || recording || (!text.trim() && !file)}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        {file && (
          <p>
            {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB{' '}
            <button type="button" className="link" disabled={busy} onClick={() => setFile(null)}>
              Remove attachment
            </button>
          </p>
        )}
        {file && (
          <label>
            <input
              type="checkbox"
              checked={rights}
              disabled={busy}
              onChange={(event) => setRights(event.target.checked)}
            />{' '}
            I created this attachment or have permission to share it.
          </label>
        )}
        {recording && <p role="status">Microphone recording. Stops after two minutes.</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="notice err">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
