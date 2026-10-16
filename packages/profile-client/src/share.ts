import type { EventSharePreview, GroupSharePreview, ProfileSharePreview, ShareTargetType } from "@sp/types";

export class ShareClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ShareClientError";
  }
}

export interface ShareClientConfig {
  apiUrl: string;
  fetchImpl?: typeof fetch;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse deep link (socialapp://...) or web link (https://.../share/...) into targetType and id */
export function parseShareUrl(url: string): { targetType: ShareTargetType; id: string } | null {
  if (!url || typeof url !== "string") return null;

  // Custom scheme: socialapp://(group|event|profile)/:id
  const schemeMatch = url.match(/^socialapp:\/\/(group|event|profile)\/([0-9a-f-]+)/i);
  if (schemeMatch && schemeMatch[1] && schemeMatch[2]) {
    const targetType = schemeMatch[1];
    const id = schemeMatch[2];
    if (UUID_REGEX.test(id)) {
      return { targetType: targetType.toLowerCase() as ShareTargetType, id };
    }
  }

  // Web path or full URL: .../share/(group|event|profile)/:id
  const pathMatch = url.match(/\/share\/(group|event|profile)\/([0-9a-f-]+)/i);
  if (pathMatch && pathMatch[1] && pathMatch[2]) {
    const targetType = pathMatch[1];
    const id = pathMatch[2];
    if (UUID_REGEX.test(id)) {
      return { targetType: targetType.toLowerCase() as ShareTargetType, id };
    }
  }

  return null;
}

export function buildDeepLink(targetType: ShareTargetType, id: string): string {
  return `socialapp://${targetType}/${id}`;
}

export function buildShareUrl(targetType: ShareTargetType, id: string, origin = "https://social-app.local"): string {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/share/${targetType}/${id}`;
}

/** Validates that a redirect path is internal and safe, preventing open redirects. */
export function validateSafeRedirect(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  // Must start with exactly one '/' and not be protocol-relative ('//') or backslash ('/\')
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.startsWith("/\\")) {
    return trimmed;
  }
  return null;
}

export function createShareClient(config: ShareClientConfig) {
  const doFetch = config.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const api = config.apiUrl.replace(/\/+$/, "");

  async function getPreview<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${api}${path}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
    } catch {
      throw new ShareClientError(
        503,
        "service_unavailable",
        "Could not reach the server to load share preview."
      );
    }

    if (res.ok) {
      const data = (await res.json()) as { preview: T };
      return data.preview;
    }

    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = (await res.json()) as typeof errBody;
    } catch {}

    const code = errBody.error ?? "preview_failed";
    const message = errBody.message ?? `Preview unavailable (${res.status})`;
    throw new ShareClientError(res.status, code, message);
  }

  return {
    async getGroupPreview(id: string): Promise<GroupSharePreview> {
      if (!UUID_REGEX.test(id)) throw new ShareClientError(400, "bad_request", "Invalid group ID");
      return getPreview<GroupSharePreview>(`/share/groups/${id}`);
    },

    async getEventPreview(id: string): Promise<EventSharePreview> {
      if (!UUID_REGEX.test(id)) throw new ShareClientError(400, "bad_request", "Invalid event ID");
      return getPreview<EventSharePreview>(`/share/events/${id}`);
    },

    async getProfilePreview(id: string): Promise<ProfileSharePreview> {
      if (!UUID_REGEX.test(id)) throw new ShareClientError(400, "bad_request", "Invalid profile ID");
      return getPreview<ProfileSharePreview>(`/share/profiles/${id}`);
    },
  };
}

export type ShareClient = ReturnType<typeof createShareClient>;
