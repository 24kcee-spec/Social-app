import { describe, expect, it } from 'vitest';
import {
  clearChatStorage,
  dayLabel,
  nearLatest,
  readOutgoing,
  saveOutgoing,
} from '../lib/chat-state';
function storage() {
  const values: Record<string, string> = {};
  return Object.assign(values, {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  }) as unknown as Storage;
}
describe('conversation recovery and reading position', () => {
  it('preserves the exact sender-scoped retry ID after a reload', () => {
    const store = storage();
    const item = {
      conversationId: 'conversation',
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      body: 'Hello',
      senderId: 'member',
      createdAt: new Date().toISOString(),
      assetId: 'owned-upload',
    };
    saveOutgoing(store, 'member', 'conversation', item);
    expect(readOutgoing(store, 'member', 'conversation')).toEqual(item);
    expect(readOutgoing(store, 'other-member', 'conversation')).toBeNull();
    saveOutgoing(store, 'member', 'conversation', null);
    expect(readOutgoing(store, 'member', 'conversation')).toBeNull();
  });
  it('rejects stale/corrupt drafts and clears chat data on sign-out', () => {
    const store = storage();
    store.setItem('sidle-outbox:m:c', '{broken');
    store.setItem('sidle-rich-draft:m:c', 'private');
    store.setItem('theme', 'dark');
    expect(readOutgoing(store, 'm', 'c')).toBeNull();
    clearChatStorage(store);
    expect(store.getItem('sidle-rich-draft:m:c')).toBeNull();
    expect(store.getItem('theme')).toBe('dark');
  });
  it('only follows arrivals while near the latest message', () => {
    expect(nearLatest(0, 1500, 600)).toBe(false);
    expect(nearLatest(850, 1500, 600)).toBe(true);
  });
  it('labels days without treating a midnight boundary as 24 hours', () => {
    const today = new Date(2026, 9, 26, 0, 2);
    expect(dayLabel(new Date(2026, 9, 26, 0, 1).toISOString(), today)).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 25, 23, 59).toISOString(), today)).toBe('Yesterday');
  });
});
