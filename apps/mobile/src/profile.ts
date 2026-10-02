import type { Profile, ProfileMedia } from "@sp/types";
import { createProfileClient, type ProfileClient } from "@sp/profile-client";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { auth, config } from "./auth";

let client: ProfileClient | null = null;
export const PROFILE_MEDIA_BUCKET = "profile-media";
export const PROFILE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export function getProfileClient(): ProfileClient {
  client ??= createProfileClient({ apiUrl: config.apiUrl, getAccessToken: () => auth.getAccessToken() });
  return client;
}

export async function getSignedMediaUrl(path: string): Promise<string> {
  const { data, error } = await auth.getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw new Error("We could not load that image yet. Please try again.");
  return data.signedUrl;
}

async function blobFromUri(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the prepared image.");
  return response.arrayBuffer();
}

export async function pickAndUploadProfileImage(existing: ProfileMedia[]): Promise<ProfileMedia | null> {
  if (existing.length >= 6) throw new Error("You can keep up to 6 profile images.");
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.mimeType && !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) throw new Error("Use a JPG, PNG or WebP image.");
  if (asset.fileSize !== undefined && (asset.fileSize < 1 || asset.fileSize > PROFILE_MEDIA_MAX_BYTES)) throw new Error("Images must be 5 MB or smaller.");
  if (asset.width > 8000 || asset.height > 8000 || asset.width < 1 || asset.height < 1) throw new Error("That image has unsupported dimensions.");

  const me = await auth.fetchMe();
  const side = 1400;
  const originalRef = await ImageManipulator.manipulate(asset.uri).resize({ width: side, height: side }).renderAsync();
  const original = await originalRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const thumbRef = await ImageManipulator.manipulate(asset.uri).resize({ width: 512, height: 512 }).renderAsync();
  const thumbnail = await thumbRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  const originalData = await blobFromUri(original.uri);
  if (originalData.byteLength > PROFILE_MEDIA_MAX_BYTES) throw new Error("The processed image is still too large. Try a smaller image.");
  const thumbnailData = await blobFromUri(thumbnail.uri);

  const taken = new Set(existing.map((m) => m.sortOrder));
  const sortOrder = Array.from({ length: 6 }, (_, i) => i).find((i) => !taken.has(i));
  if (sortOrder === undefined) throw new Error("You can keep up to 6 profile images.");

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `${me.id}/${id}.jpg`;
  const thumbnailPath = `${me.id}/${id}-thumb.jpg`;
  const storage = auth.getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET);
  try {
    const first = await storage.upload(storagePath, originalData, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (first.error) throw new Error("Image upload failed. Please try again.");
    const second = await storage.upload(thumbnailPath, thumbnailData, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (second.error) { await storage.remove([storagePath]).catch(() => undefined); throw new Error("Image upload failed. Please try again."); }
    try {
      return await getProfileClient().registerMedia({ kind: "avatar", storagePath, thumbnailPath, contentType: "image/jpeg", sizeBytes: originalData.byteLength, width: 1400, height: 1400, sortOrder });
    } catch (err) {
      await storage.remove([storagePath, thumbnailPath]).catch(() => undefined);
      throw err;
    }
  } finally {
    // Prepared files live in the platform cache directory; no persistent copy is created by this helper.
  }
}

export async function deleteProfileImage(media: ProfileMedia): Promise<void> {
  await getProfileClient().deleteMedia(media.id);
  const { error } = await auth.getSupabaseClient().storage.from(PROFILE_MEDIA_BUCKET).remove([media.storagePath, media.thumbnailPath]);
  if (error) throw new Error("The profile record was removed, but the old image could not be cleaned up. Please try again later.");
}

export type { Profile };
