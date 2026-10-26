export type OutgoingMessage = {
  conversationId: string;
  clientId: string;
  body: string;
  assetId?: string;
  replyTo?: string;
  createdAt: string;
  senderId: string;
  failed?: boolean;
};

export function nearLatest(top: number, height: number, viewport: number) {
  return height - top - viewport < 100;
}

export function dayLabel(value: string, now = new Date()) {
  const date = new Date(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (day.getTime() === today.getTime()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return day.getTime() === yesterday.getTime()
    ? 'Yesterday'
    : date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
      });
}

const queueKey = (user: string, conversation: string) => `sidle-outbox:${user}:${conversation}`;
export function readOutgoing(
  storage: Pick<Storage, 'getItem'>,
  user: string,
  conversation: string,
): OutgoingMessage | null {
  try {
    const value = JSON.parse(storage.getItem(queueKey(user, conversation)) ?? 'null');
    if (
      value &&
      value.senderId === user &&
      value.conversationId === conversation &&
      /^[0-9a-f-]{36}$/i.test(value.clientId) &&
      typeof value.body === 'string' &&
      value.body.length <= 2000 &&
      Number.isFinite(Date.parse(value.createdAt)) &&
      Date.now() - Date.parse(value.createdAt) < 7 * 86400_000
    )
      return value;
  } catch {}
  return null;
}
export function saveOutgoing(
  storage: Pick<Storage, 'setItem' | 'removeItem'>,
  user: string,
  conversation: string,
  value: OutgoingMessage | null,
) {
  try {
    if (value) storage.setItem(queueKey(user, conversation), JSON.stringify(value));
    else storage.removeItem(queueKey(user, conversation));
  } catch {
    /* A private-browsing storage failure never discards the live draft. */
  }
}

export function clearChatStorage(storage: Storage) {
  try {
    for (const key of Object.keys(storage))
      if (key.startsWith('sidle-outbox:') || key.startsWith('sidle-rich-draft:'))
        storage.removeItem(key);
  } catch {}
}
