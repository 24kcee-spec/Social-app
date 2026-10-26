import type { Page } from '@playwright/test';
import { signedIn, userId } from './fixtures';

export async function chatFixture(page: Page) {
  await signedIn(page);
  const conversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const other = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const history = Array.from({ length: 60 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    conversationId,
    senderId: other,
    kind: 'text',
    body: index === 59 ? 'Original synchronized message' : `Earlier message ${index}`,
    clientTag: crypto.randomUUID(),
    createdAt: new Date(Date.now() - (60 - index) * 60_000).toISOString(),
    read: false,
  }));
  const sendIds: string[] = [];
  let interrupt = false;
  const broadcasts: ((table: string, row: Record<string, unknown>) => void)[] = [];
  await page.routeWebSocket('wss://browser-fixture.supabase.co/realtime/v1/**', (socket) => {
    const subscriptions = new Map<
      string,
      { join: string; filters: { id: number; table: string }[] }
    >();
    let topic = '',
      join = '';
    let filters: { id: number; table: string }[] = [];
    const sendFrame = (frame: Record<string, unknown>) =>
      socket.send(
        JSON.stringify([
          frame.join_ref ?? null,
          frame.ref ?? null,
          frame.topic,
          frame.event,
          frame.payload,
        ]),
      );
    socket.onMessage((data) => {
      const decoded = JSON.parse(String(data));
      const message = Array.isArray(decoded)
        ? {
            join_ref: decoded[0],
            ref: decoded[1],
            topic: decoded[2],
            event: decoded[3],
            payload: decoded[4],
          }
        : decoded;
      if (message.event === 'phx_join') {
        topic = message.topic;
        join = message.join_ref;
        filters = message.payload.config.postgres_changes.map(
          (filter: Record<string, unknown>, index: number) => ({ ...filter, id: index + 1 }),
        );
        subscriptions.set(topic, { join, filters });
        sendFrame({
          topic,
          event: 'phx_reply',
          ref: message.ref,
          join_ref: join,
          payload: { status: 'ok', response: { postgres_changes: filters } },
        });
      } else if (message.event === 'heartbeat')
        sendFrame({
          topic: 'phoenix',
          event: 'phx_reply',
          ref: message.ref,
          payload: { status: 'ok', response: {} },
        });
    });
    broadcasts.push((table, row) => {
      for (const [topic, { join, filters }] of subscriptions) {
        const filter = filters.find((item) => item.table === table);
        if (filter)
          sendFrame({
            topic,
            event: 'postgres_changes',
            join_ref: join,
            payload: {
              ids: [filter.id],
              data: {
                schema: 'public',
                table,
                type: table === 'messages' ? 'INSERT' : 'UPDATE',
                commit_timestamp: new Date().toISOString(),
                columns: [],
                record: row,
                old_record: {},
                errors: null,
              },
            },
          });
      }
    });
  });
  const signal = () =>
    broadcasts.forEach((send) =>
      send('conversation_changes', {
        conversation_id: conversationId,
        revision: crypto.randomUUID(),
      }),
    );
  await page.route('**/api/sidle/conversations**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/read')) return route.fulfill({ status: 204 });
    if (url.pathname.endsWith('/messages')) {
      const messages = url.searchParams.has('before') ? history.slice(0, 10) : history.slice(-50);
      return route.fulfill({
        json: {
          messages,
          hasMore: !url.searchParams.has('before'),
          nextCursor: history[10]!.createdAt + '|' + history[10]!.id,
        },
      });
    }
    return route.fulfill({
      json: {
        conversations: [
          {
            id: conversationId,
            kind: 'direct',
            createdAt: history[0]!.createdAt,
            other: { userId: other, displayName: 'Chat partner', thumbnailPath: null },
            unreadCount: 0,
            lastMessage: history.at(-1),
          },
        ],
      },
    });
  });
  await page.route(
    'https://browser-fixture.supabase.co/rest/v1/rpc/sidle_platform',
    async (route) => {
      const { action, input } = route.request().postDataJSON();
      if (action === 'messages.search')
        return route.fulfill({
          json: {
            items: history
              .filter((item) => item.body.toLowerCase().includes(input.query.toLowerCase()))
              .slice(0, 30)
              .map((item) => ({ ...item, asset: null })),
          },
        });
      if (action === 'messages.media') return route.fulfill({ json: { items: [] } });
      if (action === 'messages.lookup')
        return route.fulfill({ json: history.find((item) => item.id === input.id) });
      if (action === 'messages.details')
        return route.fulfill({
          json: input.ids.map((id: string) => ({
            id,
            replyTo: null,
            replyBody: null,
            editedAt: null,
            deleted: false,
            asset: null,
            reactions: [],
          })),
        });
      if (action === 'messages.send') {
        sendIds.push(input.clientId);
        let message = history.find((item) => item.clientTag === input.clientId);
        if (!message) {
          message = {
            id: crypto.randomUUID(),
            conversationId,
            senderId: userId,
            kind: 'text',
            body: input.body,
            clientTag: input.clientId,
            createdAt: new Date().toISOString(),
            read: false,
          };
          history.push(message);
        }
        if (interrupt) {
          interrupt = false;
          await route.abort();
          return;
        }
        return route.fulfill({ json: { id: message.id } });
      }
      return route.fulfill({ json: {} });
    },
  );
  return {
    history,
    sendIds,
    interruptNextSend: () => {
      interrupt = true;
    },
    updateMessage: (body: string) => {
      history[59]!.body = body;
      signal();
    },
    incomingMessage: () => {
      const message = {
        id: crypto.randomUUID(),
        conversationId,
        senderId: other,
        kind: 'text',
        body: 'New arrival while reading',
        clientTag: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        read: false,
      };
      history.push(message);
      broadcasts.forEach((send) =>
        send('messages', {
          id: message.id,
          conversation_id: conversationId,
          sender_id: other,
          kind: 'text',
          body: message.body,
          client_tag: message.clientTag,
          created_at: message.createdAt,
        }),
      );
      signal();
    },
  };
}
