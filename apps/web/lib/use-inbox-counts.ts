'use client';
import { useEffect, useState } from 'react';
import { getAuth } from './auth';
import { getMessagingClient } from './messaging';
import { getConnectionsClient } from './connections';

/** Realtime uses the same member-only opaque signal as the open thread. */
export function useInboxCounts(enabled: boolean) {
  const [counts, setCounts] = useState({ unread: 0, pending: 0 });
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      running = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      if (!alive || running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const [messages, requests] = await Promise.all([
          getMessagingClient().listConversations(),
          getConnectionsClient().listRequests('incoming'),
        ]);
        if (alive)
          setCounts({
            unread: messages.reduce((sum, item) => sum + item.unreadCount, 0),
            pending: requests.length,
          });
      } catch {
        /* Retain known counts during a transient outage. */
      } finally {
        running = false;
      }
    };
    const schedule = () => {
      if (!timer)
        timer = setTimeout(() => {
          timer = null;
          void refresh();
        }, 250);
    };
    const channel = getAuth()
      .getSupabaseClient()
      .channel('sidle-inbox-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_changes' },
        schedule,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') schedule();
      });
    void refresh();
    const interval = setInterval(schedule, 30_000);
    window.addEventListener('sidle:messages-changed', schedule);
    window.addEventListener('online', schedule);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      alive = false;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
      void channel.unsubscribe();
      window.removeEventListener('sidle:messages-changed', schedule);
      window.removeEventListener('online', schedule);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [enabled]);
  return counts;
}
