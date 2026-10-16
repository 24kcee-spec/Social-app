import type { Metadata } from "next";
import type { EventSharePreview, GroupSharePreview, ProfileSharePreview, ShareTargetType } from "@sp/types";
import { ShareClientView } from "./share-view";

interface Props {
  params: Promise<{ targetType: string; id: string }>;
}

async function fetchPreview(
  targetType: string,
  id: string
): Promise<{
  preview: GroupSharePreview | EventSharePreview | ProfileSharePreview | null;
  error: string | null;
}> {
  const apiUrl = process.env.PUBLIC_API_URL || "http://localhost:4000";
  const plural =
    targetType === "group" ? "groups" : targetType === "event" ? "events" : "profiles";

  try {
    const res = await fetch(`${apiUrl}/share/${plural}/${id}`, {
      next: { revalidate: 60 },
      headers: { accept: "application/json" },
    });

    if (res.status === 403) return { preview: null, error: "private" };
    if (!res.ok) return { preview: null, error: "not_found" };

    const data = (await res.json()) as {
      preview: GroupSharePreview | EventSharePreview | ProfileSharePreview;
    };
    return { preview: data.preview, error: null };
  } catch {
    return { preview: null, error: "offline" };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { targetType, id } = await params;
  const { preview } = await fetchPreview(targetType, id);

  if (!preview) {
    return {
      title: "Shared Link · Social App",
      description: "Find people, conversations and activities at your pace.",
    };
  }

  const title =
    targetType === "group"
      ? `${(preview as GroupSharePreview).name} · Social Group`
      : targetType === "event"
      ? `${(preview as EventSharePreview).title} · Social Event`
      : `${(preview as ProfileSharePreview).displayName} · Social App Profile`;

  const description =
    ("description" in preview ? preview.description : preview.bio) ||
    "Join the conversation on Social App.";

  const baseUrl = process.env.PUBLIC_WEB_URL || "https://social-app.local";
  const canonicalUrl = `${baseUrl}/share/${targetType}/${id}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "Social App",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { targetType, id } = await params;
  const validTypes: ShareTargetType[] = ["group", "event", "profile"];
  const safeTarget = validTypes.includes(targetType as ShareTargetType)
    ? (targetType as ShareTargetType)
    : "group";

  const { preview, error } = await fetchPreview(targetType, id);
  const baseUrl = process.env.PUBLIC_WEB_URL || "https://social-app.local";
  const canonicalUrl = `${baseUrl}/share/${safeTarget}/${id}`;
  const deepLink = `socialapp://${safeTarget}/${id}`;

  return (
    <ShareClientView
      targetType={safeTarget}
      id={id}
      preview={preview}
      error={error}
      canonicalUrl={canonicalUrl}
      deepLink={deepLink}
    />
  );
}
