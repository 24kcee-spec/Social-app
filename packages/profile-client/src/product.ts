/** Supabase-hosted product APIs: publishable key + the current user's JWT only. */
export const SOCIAL_INTENTS = [
  'study',
  'coffee_chat',
  'gaming',
  'networking',
  'sport',
  'just_browsing',
] as const;
export type SocialIntent = (typeof SOCIAL_INTENTS)[number];
export type Availability = 'open_to_plans' | 'study_together' | 'coffee_chat';
export interface SocialContext {
  intents: SocialIntent[];
  availability: Availability | null;
  expiresAt: string | null;
  audience: 'connections' | 'discoverable';
}
export interface PeopleContext extends Omit<SocialContext, 'audience'> {
  userId: string;
}
export interface ProductFeedback {
  id: string;
  category: 'idea' | 'bug' | 'other';
  body: string;
  status: 'received' | 'reviewed' | 'closed';
  createdAt: string;
}
export interface SavedPerson {
  userId: string;
  displayName: string;
  bio: string;
  thumbnailPath: string | null;
  connected: boolean;
}
export interface ProductClientConfig {
  supabaseUrl: string;
  publishableKey: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export function createProductClient(config: ProductClientConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  async function rpc<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
    const token = await config.getAccessToken();
    if (!token) throw new Error('Sign in to use this control.');
    let response: Response;
    try {
      response = await doFetch(`${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${name}`, {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          apikey: config.publishableKey,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(
        'Sidle could not connect. Your changes have not been confirmed; please try again.',
      );
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { code?: string };
      if (payload.code === '54000')
        throw new Error(
          'This account has reached the limit. Try again later or remove an older saved introduction.',
        );
      if (response.status === 401 || payload.code === '42501')
        throw new Error('This action is unavailable. Check your session and try again.');
      if (payload.code === '22023')
        throw new Error(
          'Check your choices and try again. Feedback must have 10 to 2000 characters.',
        );
      throw new Error('Sidle could not save that change. Please try again.');
    }
    return (await response.json()) as T;
  }
  return {
    getContext: () => rpc<SocialContext>('sidle_get_context'),
    setContext: (
      input: Pick<SocialContext, 'intents' | 'availability' | 'audience'> & {
        durationHours: number;
      },
    ) =>
      rpc<SocialContext>('sidle_set_context', {
        intents: input.intents,
        availability: input.availability,
        duration_hours: input.durationHours,
        audience: input.audience,
      }),
    getPeopleContext: async (userIds: string[]): Promise<PeopleContext[]> => {
      const ids = [...new Set(userIds)];
      const result: PeopleContext[] = [];
      for (let start = 0; start < ids.length; start += 50)
        result.push(
          ...(await rpc<PeopleContext[]>('sidle_people_context', {
            user_ids: ids.slice(start, start + 50),
          })),
        );
      return result;
    },
    listSaved: () => rpc<string[]>('sidle_saved_introductions'),
    listSavedPeople: () => rpc<SavedPerson[]>('sidle_saved_people'),
    setSaved: (userId: string, saved: boolean) =>
      rpc<boolean>('sidle_save_introduction', { target_id: userId, saved }),
    submitFeedback: (clientId: string, category: ProductFeedback['category'], body: string) =>
      rpc<Pick<ProductFeedback, 'id' | 'status' | 'createdAt'>>('sidle_submit_feedback', {
        client_id: clientId,
        category,
        body,
      }),
    listFeedback: () => rpc<ProductFeedback[]>('sidle_feedback_queue'),
    reviewFeedback: (id: string, status: 'reviewed' | 'closed') =>
      rpc<boolean>('sidle_review_feedback', { feedback_id: id, status }),
  };
}
export type ProductClient = ReturnType<typeof createProductClient>;
