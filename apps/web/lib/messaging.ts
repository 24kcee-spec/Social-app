import { createMessagingClient, subscribeToConversationMessages, type ConversationSubscription, type ConversationSubscriptionOptions, type MessagingClient, type RealtimeChannelLike } from "@sp/profile-client";
import { getAuth } from "./auth";

let client: MessagingClient | null = null;

export function getMessagingClient(): MessagingClient {
  client ??= createMessagingClient({
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    getAccessToken: () => getAuth().getAccessToken(),
  });
  return client;
}

/** Live message stream for one conversation (Supabase Realtime; the publishable key + RLS keep it member-only). */
export function subscribeToConversation(conversationId: string, opts: Omit<ConversationSubscriptionOptions, "conversationId">): ConversationSubscription {
  const supabase = getAuth().getSupabaseClient();
  return subscribeToConversationMessages((name) => supabase.channel(name) as unknown as RealtimeChannelLike, { conversationId, ...opts });
}
