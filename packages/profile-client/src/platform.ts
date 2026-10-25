import type { ProductClientConfig } from './product';

export type Audience = 'public' | 'connections' | 'private';
export type ContentKind = 'post' | 'reel' | 'story' | 'music';
export type MediaKind = 'image' | 'video' | 'audio' | 'voice';
export type MediaRights = 'original' | 'permission' | 'public_domain' | 'cc0' | 'cc_by';
export interface SocialAsset {
  id: string;
  path: string;
  kind: MediaKind;
  mime: string;
  sizeBytes: number;
  durationSeconds: number | null;
  rights: MediaRights;
  attribution: string;
  status?: string;
}
export interface SocialPost {
  id: string;
  userId: string;
  displayName: string;
  kind: ContentKind;
  body: string;
  title: string;
  audience: Audience;
  createdAt: string;
  expiresAt: string | null;
  asset: SocialAsset | null;
  likeCount: number;
  commentCount: number;
  myReaction: string | null;
  bookmarked: boolean;
  following: boolean;
}
export interface FeedPage {
  items: SocialPost[];
  cursor: string | null;
}
export interface PostComment {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
}
export interface MemberPreferences {
  labels: Record<string, string>;
  mutedUsers: string[];
  archivedConversations: string[];
  readReceipts: boolean;
  analyticsConsent: boolean;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
}
export interface ProfileDetails {
  userId: string;
  displayName: string;
  bio: string;
  handle: string | null;
  pronouns: string | null;
  campus: string | null;
  course: string | null;
  year: string | null;
  website: string | null;
  audience?: Audience;
  posts: number;
  followers: number;
  following: number;
}
export interface ActivityItem {
  id: string;
  kind: string;
  targetId: string | null;
  label: string;
  seenAt: string | null;
  createdAt: string;
}
export interface Playlist {
  id: string;
  name: string;
  tracks: SocialPost[];
}
export interface LocationShare {
  id: string;
  userId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  expiresAt: string;
  updatedAt: string;
}
export interface CallRoom {
  id: string;
  callerId: string;
  recipientId: string;
  otherName: string;
  mode: 'audio' | 'video';
  state: 'ringing' | 'accepted' | 'declined' | 'ended';
  createdAt: string;
  expiresAt: string;
}
export interface CallSignal {
  id: number;
  kind: 'offer' | 'answer' | 'ice';
  payload: unknown;
}
export interface Usage {
  uploadsEnabled: boolean;
  mediaReviewRequired: boolean;
  usedBytes: number;
  limitBytes: number;
  maxFileBytes: number;
}
export interface SearchResults {
  people: { userId: string; name: string; bio: string }[];
  groups: { id: string; name: string; description: string }[];
  plans: { id: string; name: string; startsAt: string; generalArea: string }[];
}
export interface PlanInvitation {
  id: string;
  eventId: string;
  status: string;
  expiresAt: string;
  title: string;
  startsAt: string;
  generalArea: string;
  senderName: string;
}
export interface RichMessage {
  id: string;
  replyTo: string | null;
  replyBody: string | null;
  editedAt: string | null;
  deleted: boolean;
  asset: SocialAsset | null;
  reactions: { reaction: string; count: number; mine: boolean }[];
}
export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export function createPlatformClient(config: ProductClientConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  async function call<T>(action: string, input: Record<string, unknown> = {}): Promise<T> {
    const token = await config.getAccessToken();
    if (!token) throw new PlatformError('signed_out', 401, 'Sign in to continue.');
    let response: Response;
    try {
      response = await doFetch(
        `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/sidle_platform`,
        {
          method: 'POST',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            apikey: config.publishableKey,
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ action, input }),
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      throw new PlatformError(
        'network',
        503,
        'The connection was interrupted. Your change has not been confirmed. Retry when you are online.',
      );
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { code?: string };
      const code = error.code ?? 'unavailable';
      throw new PlatformError(
        code,
        response.status,
        code === '42501'
          ? 'This content or action is unavailable with your current account and permissions.'
          : code === '54000'
            ? 'The current allowance has been reached. Try later or review your storage and activity limits.'
            : code === '23505'
              ? 'That handle or item is already in use.'
              : code.startsWith('22') || code.startsWith('23')
                ? 'Check the form, file type, size, duration and selected audience, then try again.'
                : 'Sidle could not complete this action. Please try again.',
      );
    }
    return (await response.json()) as T;
  }
  return {
    call,
    getPreferences: () => call<MemberPreferences>('preferences.get'),
    setPreferences: (input: Partial<MemberPreferences>) =>
      call<MemberPreferences>('preferences.set', input),
    getProfile: (userId?: string) => call<ProfileDetails>('profile.details.get', { userId }),
    setProfile: (input: Partial<ProfileDetails>) =>
      call<ProfileDetails>('profile.details.set', input),
    reserveMedia: (input: {
      clientId: string;
      kind: MediaKind;
      mime: string;
      sizeBytes: number;
      durationSeconds: number;
      rights: MediaRights;
      attribution: string;
    }) =>
      call<{ id: string; path: string; bucket: string; status: string }>('media.reserve', input),
    finalizeMedia: (id: string) => call<SocialAsset>('media.finalize', { id }),
    removeMedia: (id: string) => call<{ removed: boolean }>('media.remove', { id }),
    createPost: (input: {
      clientId: string;
      kind: ContentKind;
      body: string;
      title?: string;
      assetId?: string;
      audience: Audience;
    }) => call<SocialPost>('posts.create', input),
    listPosts: (
      input: {
        kind?: ContentKind | 'all';
        scope?: 'everyone' | 'following' | 'saved';
        cursor?: string | null;
        limit?: number;
        userId?: string;
      } = {},
    ) => call<FeedPage>('posts.list', input),
    getPost: (id: string) => call<SocialPost | null>('posts.get', { id }),
    deletePost: (id: string) => call<{ deleted: boolean }>('posts.delete', { id }),
    react: (id: string, reaction: string | null) =>
      call<SocialPost>('posts.react', { id, reaction }),
    bookmark: (id: string, saved: boolean) =>
      call<{ saved: boolean }>('posts.bookmark', { id, saved }),
    listComments: (id: string) => call<PostComment[]>('posts.comments', { id }),
    comment: (id: string, body: string, clientId: string) =>
      call<PostComment[]>('posts.comment', { id, body, clientId }),
    deleteComment: (id: string) => call<{ deleted: boolean }>('posts.comment.delete', { id }),
    follow: (userId: string, following: boolean) =>
      call<{ following: boolean }>('people.follow', { userId, following }),
    listPlaylists: () => call<Playlist[]>('music.playlists'),
    createPlaylist: (name: string) => call<{ id: string }>('music.playlist.create', { name }),
    playlistTrack: (playlistId: string, postId: string, added = true) =>
      call('music.playlist.track', { playlistId, postId, added }),
    deletePlaylist: (id: string) => call('music.playlist.delete', { id }),
    listActivity: () => call<ActivityItem[]>('activity.list'),
    readActivity: (id?: string) => call('activity.read', { id }),
    inviteToPlan: (eventId: string, userId: string) => call('plans.invite', { eventId, userId }),
    listInvitations: () => call<PlanInvitation[]>('plans.invitations'),
    respondInvitation: (id: string, status: 'accepted' | 'declined') =>
      call('plans.invitation.respond', { id, status }),
    startLocation: (input: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      minutes: 15 | 30 | 60;
      recipients: string[];
    }) => call<{ id: string; expiresAt: string }>('location.start', input),
    updateLocation: (id: string, latitude: number, longitude: number, accuracy: number | null) =>
      call('location.update', { id, latitude, longitude, accuracy }),
    stopLocation: () => call('location.stop'),
    listLocations: () => call<LocationShare[]>('location.list'),
    startCall: (userId: string, mode: 'audio' | 'video') =>
      call<{ id: string }>('calls.start', { userId, mode }),
    listCalls: () => call<CallRoom[]>('calls.list'),
    setCallState: (id: string, state: 'accepted' | 'declined' | 'ended') =>
      call<{ updated: boolean }>('calls.state', { id, state }),
    signalCall: (id: string, kind: CallSignal['kind'], payload: unknown) =>
      call('calls.signal', { id, kind, payload }),
    getCallSignals: (id: string, after = 0) => call<CallSignal[]>('calls.signals', { id, after }),
    search: (query: string) => call<SearchResults>('search', { query }),
    report: (postId: string, reason: string, details: string) =>
      call('reports.create', { postId, reason, details }),
    usage: () => call<Usage>('usage'),
    exportAccount: () => call<Record<string, unknown>>('account.export'),
    getMessageDetails: (ids: string[]) =>
      call<RichMessage[]>('messages.details', { ids: ids.slice(0, 100) }),
    sendRichMessage: (input: {
      conversationId: string;
      clientId: string;
      body: string;
      assetId?: string;
      replyTo?: string;
    }) => call<{ id: string }>('messages.send', input),
    editMessage: (id: string, body: string) => call('messages.edit', { id, body }),
    deleteMessage: (id: string) => call('messages.delete', { id }),
    reactMessage: (id: string, reaction: string | null) => call('messages.react', { id, reaction }),
  };
}
export type PlatformClient = ReturnType<typeof createPlatformClient>;
