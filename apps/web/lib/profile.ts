import type { Profile, ProfileMedia } from "@sp/types";
import { createProfileClient, type ProfileClient } from "@sp/profile-client";
import type { OnboardingInput, ProfileMediaRegistrationInput } from "@sp/validation";
import { getAuth } from "./auth";

let client: ProfileClient | null = null;

export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_MEDIA_MAX_DIMENSION = 8000;

export function getProfileClient(): ProfileClient {
  client ??= createProfileClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}

export async function getSignedMediaUrl(path: string): Promise<string> {
  const { data, error } = await getAuth().getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error("We could not load that image yet. Please try again.");
  return data.signedUrl;
}

function blobFromCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image processing failed")), "image/jpeg", quality));
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be read.")); };
    image.src = url;
  });
}

export async function prepareProfileImage(file: File): Promise<{ original: Blob; thumbnail: Blob; width: number; height: number }> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error("Use a JPG, PNG or WebP image.");
  if (file.size < 1 || file.size > PROFILE_MEDIA_MAX_BYTES) throw new Error("Images must be 5 MB or smaller.");
  const image = await loadImage(file);
  if (image.width < 1 || image.height < 1 || image.width > PROFILE_MEDIA_MAX_DIMENSION || image.height > PROFILE_MEDIA_MAX_DIMENSION) throw new Error("That image has unsupported dimensions.");
  const side = Math.min(image.width, image.height);
  const sx = Math.floor((image.width - side) / 2);
  const sy = Math.floor((image.height - side) / 2);

  async function render(size: number, quality: number) {
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser cannot process images.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
    return blobFromCanvas(canvas, quality);
  }

  const original = await render(1400, 0.9);
  const thumbnail = await render(512, 0.82);
  if (original.size > PROFILE_MEDIA_MAX_BYTES) throw new Error("The processed image is still too large. Try a smaller image.");
  return { original, thumbnail, width: 1400, height: 1400 };
}

async function uploadBlob(path: string, blob: Blob) {
  const { error } = await getAuth().getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Image upload failed. Please try again.");
}

export async function uploadProfileImage(file: File, existing: ProfileMedia[]): Promise<ProfileMedia> {
  const me = await getAuth().fetchMe();
  const prepared = await prepareProfileImage(file);
  const taken = new Set(existing.map((m) => m.sortOrder));
  const sortOrder = Array.from({ length: 6 }, (_, i) => i).find((i) => !taken.has(i));
  if (sortOrder === undefined) throw new Error("You can keep up to 6 profile images.");
  const id = crypto.randomUUID();
  const storagePath = `${me.id}/${id}.jpg`;
  const thumbnailPath = `${me.id}/${id}-thumb.jpg`;
  try {
    await uploadBlob(storagePath, prepared.original);
    try { await uploadBlob(thumbnailPath, prepared.thumbnail); } catch (err) { await getAuth().getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).remove([storagePath]).catch(() => undefined); throw err; }
    const registration: ProfileMediaRegistrationInput = { kind: "avatar", storagePath, thumbnailPath, contentType: "image/jpeg", sizeBytes: prepared.original.size, width: prepared.width, height: prepared.height, sortOrder };
    try { return await getProfileClient().registerMedia(registration); }
    catch (err) {
      await getAuth().getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).remove([storagePath, thumbnailPath]).catch(() => undefined);
      throw err;
    }
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Image upload failed. Please try again.");
  }
}

export async function deleteProfileImage(media: ProfileMedia): Promise<void> {
  await getProfileClient().deleteMedia(media.id);
  const { error } = await getAuth().getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).remove([media.storagePath, media.thumbnailPath]);
  if (error) throw new Error("The profile record was removed, but the old image could not be cleaned up. Please try again later.");
}

export type { OnboardingInput, Profile };
