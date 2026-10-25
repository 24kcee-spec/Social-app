import type { MediaKind, MediaRights, SocialAsset } from '@sp/profile-client';
import { getAuth } from './auth';
import { getPlatformClient } from './platform';

export const SOCIAL_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
];
export function mediaKind(file: File, voice = false): MediaKind {
  return voice
    ? 'voice'
    : file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : 'audio';
}
export async function mediaDuration(file: File): Promise<number> {
  if (file.type.startsWith('image/')) return 0;
  return await new Promise((resolve, reject) => {
    const element = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => finish(new Error('Could not read this media duration.')), 10000);
    function finish(error?: Error) {
      clearTimeout(timer);
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else resolve(Math.ceil(element.duration));
    }
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) {
        finish(new Error('Use a media file with a finite duration.'));
        return;
      }
      const value = Math.ceil(element.duration);
      clearTimeout(timer);
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    element.onerror = () => finish(new Error('This browser cannot read this media format.'));
    element.src = url;
  });
}
export async function compressSocialImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap === 'undefined') return file;
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 40000000)
      throw new Error('Choose an image smaller than 40 megapixels.');
    const ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Could not prepare this image.'))),
        'image/jpeg',
        0.85,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    image.close();
  }
}
export async function uploadSocialMedia(
  file: File,
  options: {
    rights: MediaRights;
    attribution?: string;
    voice?: boolean;
    durationSeconds?: number;
    clientId?: string;
    onProgress?: (label: string) => void;
  },
): Promise<SocialAsset> {
  if (!SOCIAL_MEDIA_TYPES.includes(file.type) || file.size < 1 || file.size > 20 * 1024 * 1024)
    throw new Error('Choose a supported image, video or audio file no larger than 20 MB.');
  file = await compressSocialImage(file);
  const kind = mediaKind(file, options.voice);
  const duration = options.durationSeconds ?? (await mediaDuration(file));
  if (
    (kind === 'video' && duration > 180) ||
    (kind === 'audio' && (duration > 600 || file.size > 10 * 1024 * 1024)) ||
    (kind === 'voice' && (duration > 120 || file.size > 2 * 1024 * 1024)) ||
    (kind === 'image' && file.size > 5 * 1024 * 1024)
  )
    throw new Error(
      'Images: 5 MB. Videos: 20 MB / 3 minutes. Audio: 10 MB / 10 minutes. Voice: 2 MB / 2 minutes.',
    );
  const client = getPlatformClient();
  options.onProgress?.('Reserving media space…');
  const reservation = await client.reserveMedia({
    clientId: options.clientId ?? crypto.randomUUID(),
    kind,
    mime: file.type,
    sizeBytes: file.size,
    durationSeconds: duration,
    rights: options.rights,
    attribution: options.attribution ?? '',
  });
  if (reservation.status === 'ready') return await client.finalizeMedia(reservation.id);
  const bucket = getAuth().getSupabaseClient().storage.from(reservation.bucket);
  try {
    options.onProgress?.('Uploading media…');
    const signed = await bucket.createSignedUploadUrl(reservation.path);
    if (signed.error || !signed.data?.token) throw new Error('Could not prepare a secure upload.');
    const uploaded = await bucket.uploadToSignedUrl(reservation.path, signed.data.token, file, {
      contentType: file.type,
      cacheControl: '60',
      upsert: false,
    });
    if (uploaded.error) throw new Error('Upload interrupted. Retry with the same file.');
    options.onProgress?.('Verifying uploaded file…');
    return await client.finalizeMedia(reservation.id);
  } catch (error) {
    await bucket.remove([reservation.path]).catch(() => undefined);
    await client.removeMedia(reservation.id).catch(() => undefined);
    throw error;
  }
}
export function supportedRecordingMime() {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
    (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
  );
}
