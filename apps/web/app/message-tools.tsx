'use client';
import { useEffect, useRef, useState } from 'react';
import type { RichMessage } from '@sp/profile-client';
import { getPlatformClient } from '../lib/platform';
import { uploadSocialMedia, SOCIAL_MEDIA_TYPES, supportedRecordingMime } from '../lib/media-upload';
import { errorMessage, getAuth } from '../lib/auth';
import { readOutgoing, saveOutgoing, type OutgoingMessage } from '../lib/chat-state';
import { attachmentDraft } from '../lib/chat-attachments';
import { confirmAction } from '../lib/confirm-action';
import { SocialMedia } from './social-media';
import { UiIcon } from './ui-icon';

export function MessageDetails({
  message,
  mine,
  body,
  onReply,
  onChanged,
}: {
  message: RichMessage;
  mine: boolean;
  body: string;
  onReply: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const menu = useRef<HTMLDetailsElement>(null);
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
  if (message.deleted) return null;
  return (
    <div className="message-tools">
      {message.asset && <SocialMedia asset={message.asset} />}
      {message.reactions.length > 0 && (
        <div className="message-reactions">
          {message.reactions.map((reaction) => (
            <button
              type="button"
              key={reaction.reaction}
              aria-pressed={reaction.mine}
              aria-label={`${reaction.reaction}, ${reaction.count} reactions`}
              disabled={busy}
              onClick={() =>
                void act(() =>
                  getPlatformClient().reactMessage(
                    message.id,
                    reaction.mine ? null : reaction.reaction,
                  ),
                )
              }
            >
              <UiIcon name="heart" size={13} />
              {reaction.count}
            </button>
          ))}
        </div>
      )}
      <details
        className="message-action-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menu.current) {
            menu.current.open = false;
            menu.current.querySelector('summary')?.focus();
          }
        }}
      >
        <summary aria-label="Message actions" title="Message actions">
          <UiIcon name="more" size={18} />
        </summary>
        <div className="message-action-list">
          <button
            type="button"
            onClick={() => {
              onReply();
              if (menu.current) menu.current.open = false;
            }}
          >
            <UiIcon name="reply" size={16} />
            Reply
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (menu.current) menu.current.open = false;
              void act(() =>
                getPlatformClient().reactMessage(
                  message.id,
                  message.reactions.some(
                    (reaction) => reaction.mine && reaction.reaction === 'love',
                  )
                    ? null
                    : 'love',
                ),
              );
            }}
          >
            <UiIcon name="heart" size={16} />
            React with love
          </button>
          {mine && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setText(body);
                  setEditing(true);
                  if (menu.current) menu.current.open = false;
                }}
              >
                <UiIcon name="edit" size={16} />
                Edit message
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  void confirmAction('Remove this message for everyone?', 'Remove message').then(
                    (confirmed) => {
                      if (confirmed) void act(() => getPlatformClient().deleteMessage(message.id));
                    },
                  );
                }}
              >
                <UiIcon name="trash" size={16} />
                Remove message
              </button>
            </>
          )}
        </div>
      </details>
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
          <button type="button" className="link" onClick={() => setEditing(false)}>
            Cancel
          </button>
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
  onOutgoing,
}: {
  conversationId: string;
  replyTo: { id: string; body: string } | null;
  onCancelReply: () => void;
  onSent: () => Promise<void>;
  onOutgoing: (item: OutgoingMessage | null) => void;
}) {
  const [text, setText] = useState('');
  const [owner, setOwner] = useState('');
  const [attachmentsReady, setAttachmentsReady] = useState(false);
  const [queued, setQueued] = useState<OutgoingMessage | null>(null);
  const queuedRef = useRef<OutgoingMessage | null>(null);
  const onOutgoingRef = useRef(onOutgoing);
  onOutgoingRef.current = onOutgoing;
  const cancelledRecording = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const picker = useRef<HTMLInputElement>(null);
  const attachMenu = useRef<HTMLDivElement>(null);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [recordStarting, setRecordStarting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!attachmentMenu) return;
    const close = (event: PointerEvent) => {
      if (!attachMenu.current?.contains(event.target as Node)) setAttachmentMenu(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [attachmentMenu]);
  const key = `sidle-rich-draft:${owner}:${conversationId}`;
  useEffect(() => {
    let active = true;
    void getAuth()
      .getSupabaseClient()
      .auth.getSession()
      .then(async ({ data }) => {
        const user = data.session?.user.id;
        if (!user || !active) return;
        setOwner(user);
        const pending = readOutgoing(sessionStorage, user, conversationId);
        if (pending) {
          const failed = { ...pending, failed: true };
          queuedRef.current = failed;
          setQueued(failed);
          tag.current = failed.clientId;
          onOutgoingRef.current(failed);
        }
        const saved = await attachmentDraft(`${user}:${conversationId}`).catch(() => null);
        if (active) {
          if (saved) {
            setFile(saved.file);
            setVoice(saved.voice);
            setSeconds(saved.seconds);
            setRights(saved.rights);
          }
          setAttachmentsReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [conversationId]);
  useEffect(() => {
    if (owner && attachmentsReady)
      void attachmentDraft(
        `${owner}:${conversationId}`,
        file ? { file, voice, seconds, rights } : null,
      ).catch(() => undefined);
  }, [owner, conversationId, file, voice, seconds, rights, attachmentsReady]);
  useEffect(() => {
    if (!queuedRef.current) tag.current = crypto.randomUUID();
  }, [replyTo?.id]);
  useEffect(() => {
    if (!owner) return;
    try {
      setText(sessionStorage.getItem(key) ?? '');
    } catch {}
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (tick.current) clearInterval(tick.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [key, owner]);
  useEffect(() => {
    if (!owner) return;
    try {
      if (text) sessionStorage.setItem(key, text);
      else sessionStorage.removeItem(key);
    } catch {}
  }, [text, key, owner]);
  async function record() {
    if (busy || recording || recordStarting) return;
    cancelledRecording.current = false;
    setSeconds(0);
    setRecordStarting(true);
    tag.current = crypto.randomUUID();
    setError(null);
    try {
      const mime = supportedRecordingMime();
      if (!mime || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'Voice recording is unavailable in this browser. You can attach an audio file.',
        );
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.current.getTracks().forEach((track) => track.stop());
        return;
      }
      const instance = new MediaRecorder(stream.current, { mimeType: mime });
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      const started = Date.now();
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        stream.current?.getTracks().forEach((track) => track.stop());
        if (timer.current) clearTimeout(timer.current);
        if (tick.current) clearInterval(tick.current);
        if (!mounted.current) return;
        if (cancelledRecording.current) {
          setRecording(false);
          return;
        }
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
      tick.current = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
      setRecording(true);
      timer.current = setTimeout(() => instance.state === 'recording' && instance.stop(), 119000);
    } catch (err) {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (mounted.current) setError(errorMessage(err));
    } finally {
      if (mounted.current) setRecordStarting(false);
    }
  }
  async function send() {
    if (
      !owner ||
      busy ||
      recording ||
      recordStarting ||
      (!queuedRef.current && !text.trim() && !file)
    )
      return;
    setBusy(true);
    setError(null);
    let outgoing: OutgoingMessage = queuedRef.current ?? {
      conversationId,
      clientId: tag.current,
      body: text.trim(),
      replyTo: replyTo?.id,
      createdAt: new Date().toISOString(),
      senderId: owner,
    };
    outgoing = { ...outgoing, failed: false };
    tag.current = outgoing.clientId;
    queuedRef.current = outgoing;
    setQueued(outgoing);
    saveOutgoing(sessionStorage, owner, conversationId, outgoing);
    onOutgoingRef.current(outgoing);
    try {
      let assetId = outgoing.assetId;
      if (file && !assetId) {
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
      outgoing = { ...outgoing, assetId };
      queuedRef.current = outgoing;
      saveOutgoing(sessionStorage, owner, conversationId, outgoing);
      setNotice('Sending…');
      await getPlatformClient().sendRichMessage({
        conversationId,
        clientId: tag.current,
        body: outgoing.body,
        assetId: outgoing.assetId,
        replyTo: outgoing.replyTo,
      });
      saveOutgoing(sessionStorage, owner, conversationId, null);
      queuedRef.current = null;
      setQueued(null);
      await attachmentDraft(`${owner}:${conversationId}`, null).catch(() => undefined);
      tag.current = crypto.randomUUID();
      setText('');
      setFile(null);
      setRights(false);
      setVoice(false);
      uploaded.current = null;
      setNotice('');
      onCancelReply();
      onOutgoingRef.current(null);
      await onSent().catch(() => setNotice('Message sent. Refresh the conversation to load it.'));
    } catch (err) {
      const failed = { ...outgoing, failed: true };
      queuedRef.current = failed;
      setQueued(failed);
      saveOutgoing(sessionStorage, owner, conversationId, failed);
      onOutgoingRef.current(failed);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const retry = () => {
      if (queuedRef.current) void send();
    };
    window.addEventListener('sidle:retry-message', retry);
    return () => window.removeEventListener('sidle:retry-message', retry);
  });
  function chooseAttachment(accept: string) {
    setAttachmentMenu(false);
    if (picker.current) {
      picker.current.accept = accept;
      picker.current.click();
    }
  }
  return (
    <section className="rich-composer" aria-label="Write a message">
      {replyTo && (
        <div className="composer-reply">
          <UiIcon name="reply" size={17} />
          <div>
            <strong>Replying to a message</strong>
            <p>{replyTo.body.slice(0, 100) || 'Attachment'}</p>
          </div>
          <button
            type="button"
            className="icon-control"
            aria-label="Cancel reply"
            onClick={onCancelReply}
          >
            <UiIcon name="close" size={17} />
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        {file && (
          <div className="composer-attachment">
            <div className="composer-attachment-preview">
              {file.type.startsWith('image/') && preview ? (
                <img src={preview} alt="Attachment preview" />
              ) : (
                <UiIcon
                  name={
                    voice || file.type.startsWith('audio/')
                      ? 'microphone'
                      : file.type.startsWith('video/')
                        ? 'video'
                        : 'file'
                  }
                  size={24}
                />
              )}
            </div>
            <div>
              <strong>{voice ? 'Voice message' : file.name}</strong>
              <small>
                {(file.size / 1024 / 1024).toFixed(2)} MB{voice ? ` · ${seconds}s` : ''}
              </small>
            </div>
            <button
              type="button"
              className="icon-control"
              disabled={busy}
              aria-label="Remove attachment"
              onClick={() => {
                setFile(null);
                setVoice(false);
                setRights(false);
                uploaded.current = null;
                tag.current = crypto.randomUUID();
              }}
            >
              <UiIcon name="close" size={17} />
            </button>
          </div>
        )}
        {file && voice && preview && (
          <audio src={preview} controls preload="metadata" aria-label="Preview voice message" />
        )}
        {file && !voice && (
          <label className="attachment-permission">
            <input
              type="checkbox"
              checked={rights}
              disabled={busy}
              onChange={(event) => setRights(event.target.checked)}
            />
            I created this attachment or have permission to share it.
          </label>
        )}
        <div className="composer-input-row">
          <div
            className="composer-attach-control"
            ref={attachMenu}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setAttachmentMenu(false);
                attachMenu.current?.querySelector('button')?.focus();
              }
            }}
          >
            <button
              type="button"
              className="icon-control composer-attach-button"
              aria-label="Add attachment"
              title="Add attachment"
              aria-expanded={attachmentMenu}
              aria-controls="attachment-options"
              disabled={busy || !!queued || recording || recordStarting}
              onClick={() => setAttachmentMenu(!attachmentMenu)}
            >
              <UiIcon name="clip" size={22} />
            </button>
            {attachmentMenu && (
              <div
                className="attachment-options"
                id="attachment-options"
                aria-label="Attachment options"
              >
                <button
                  type="button"
                  onClick={() =>
                    chooseAttachment(
                      SOCIAL_MEDIA_TYPES.filter(
                        (type) => type.startsWith('image/') || type.startsWith('video/'),
                      ).join(','),
                    )
                  }
                >
                  <UiIcon name="image" />
                  <span>
                    <strong>Photo or video</strong>
                    <small>Share a moment</small>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    chooseAttachment(
                      SOCIAL_MEDIA_TYPES.filter((type) => type.startsWith('audio/')).join(','),
                    )
                  }
                >
                  <UiIcon name="microphone" />
                  <span>
                    <strong>Audio file</strong>
                    <small>Music or a recording</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          <input
            ref={picker}
            className="sidle-file-input"
            type="file"
            aria-label="Choose an attachment"
            accept={SOCIAL_MEDIA_TYPES.join(',')}
            disabled={busy || !!queued || recording || recordStarting}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              event.currentTarget.value = '';
              if (!chosen) return;
              const maxBytes = chosen.type.startsWith('video/')
                ? 20 * 1024 * 1024
                : chosen.type.startsWith('image/')
                  ? 5 * 1024 * 1024
                  : 10 * 1024 * 1024;
              if (
                !SOCIAL_MEDIA_TYPES.includes(chosen.type) ||
                chosen.size < 1 ||
                chosen.size > maxBytes
              ) {
                setError(
                  'Choose a supported photo up to 5 MB, video up to 20 MB or audio up to 10 MB.',
                );
                return;
              }
              setFile(chosen);
              tag.current = crypto.randomUUID();
              uploaded.current = null;
              setVoice(false);
              setRights(false);
              setError(null);
            }}
          />
          <label className="sidle-sr-only" htmlFor="rich-message-text">
            Message
          </label>
          <textarea
            id="rich-message-text"
            value={text}
            maxLength={2000}
            disabled={busy || !!queued}
            rows={1}
            placeholder="Message…"
            onChange={(event) => {
              setText(event.target.value);
              tag.current = crypto.randomUUID();
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 130)}px`;
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                !window.matchMedia('(pointer: coarse)').matches
              ) {
                event.preventDefault();
                if (!busy && !recording && (text.trim() || file))
                  event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button
            type="button"
            className={`icon-control composer-mic ${recording ? 'recording' : ''}`}
            aria-label={recording ? 'Stop recording' : 'Record voice'}
            title={recording ? 'Stop recording' : 'Record voice'}
            disabled={busy || recordStarting}
            onClick={() => (recording ? recorder.current?.stop() : void record())}
          >
            {recording ? (
              <span className="recording-stop" />
            ) : (
              <UiIcon name="microphone" size={21} />
            )}
          </button>
          <button
            type="submit"
            className="composer-send"
            aria-label={busy ? 'Sending message' : 'Send'}
            title="Send message"
            disabled={busy || recording || recordStarting || (!text.trim() && !file)}
          >
            <UiIcon name="send" size={20} />
          </button>
        </div>
        {recording && (
          <p className="recording-status" role="status">
            <span />
            Recording {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            <button
              type="button"
              className="link"
              onClick={() => {
                cancelledRecording.current = true;
                recorder.current?.stop();
              }}
            >
              Cancel recording
            </button>
          </p>
        )}
        {recordStarting && <p role="status">Waiting for microphone permission…</p>}
        {queued?.failed && (
          <div className="outbox-recovery" role="status">
            <span>This send is not confirmed. Retry uses the same ID to prevent duplicates.</span>
            <button type="button" disabled={busy} onClick={() => void send()}>
              Retry message
            </button>
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    'Clear this pending send? A message already received by the server cannot be unsent here.',
                  )
                )
                  return;
                saveOutgoing(sessionStorage, owner, conversationId, null);
                queuedRef.current = null;
                setQueued(null);
                window.dispatchEvent(
                  new CustomEvent('sidle:discard-outgoing', { detail: tag.current }),
                );
                tag.current = crypto.randomUUID();
              }}
            >
              Clear pending send
            </button>
          </div>
        )}
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
