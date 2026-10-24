import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { registerAuth } from '../src/auth/plugin';
import { AuthError } from '../src/auth/verify';
import { createAuthStore } from '../src/auth/store';
import { registerProfile } from '../src/profile/plugin';
import { createProfileStore } from '../src/profile/store';
import { registerDiscovery } from '../src/discovery/plugin';
import { createDiscoveryStore } from '../src/discovery/store';
import { registerConnections } from '../src/connections/plugin';
import { createConnectionsStore } from '../src/connections/store';
import { registerMessaging } from '../src/messaging/plugin';
import { createMessagingStore } from '../src/messaging/store';
import { registerCommunity } from '../src/community/plugin';
import { createCommunityStore } from '../src/community/store';
import { registerSafety } from '../src/safety/plugin';
import { createSafetyStore } from '../src/safety/store';
import { registerShare } from '../src/share/plugin';
import { createShareStore } from '../src/share/store';
import { runMigrations } from '../src/migrate';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stranger = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let db: PGlite;
let app: ReturnType<typeof buildApp>;
beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations'));
  app = buildApp({
    readinessChecks: {
      database: async () => {
        await db.query('select 1');
      },
    },
  });
  // Only provider authentication is substituted; actual auth/session handling,
  // HTTP validation, authorization, migrations and all domain SQL run unchanged.
  const { requireAuth, requireRole } = registerAuth(app, {
    store: createAuthStore(db),
    verify: async (token) => {
      if (![A, B, stranger].includes(token)) throw new AuthError('invalid_token');
      return {
        userId: token,
        email: `${token}@example.com`,
        phone: null,
        sessionId: `test-${token}`,
        isAnonymous: false,
      };
    },
  });
  registerProfile(app, { requireAuth, store: createProfileStore(db) });
  registerDiscovery(app, { requireAuth, requireRole, store: createDiscoveryStore(db) });
  registerConnections(app, { requireAuth, requireRole, store: createConnectionsStore(db) });
  registerMessaging(app, { requireAuth, store: createMessagingStore(db) });
  registerCommunity(app, { requireAuth, store: createCommunityStore(db) });
  registerSafety(app, {
    requireAuth,
    requireRole,
    store: createSafetyStore(db, { withTransaction: (work) => db.transaction(work) }),
  });
  registerShare(app, { store: createShareStore(db) });
});
afterAll(async () => {
  await app?.close();
  await db?.close();
});

async function request(
  user: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  expected = 200,
) {
  const response = await app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${user}` },
    ...(payload ? { payload } : {}),
  });
  expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(expected);
  return response.statusCode === 204 ? undefined : response.json();
}

it('two accounts complete discovery, connection, chat/retry/read, group/event/waitlist, report/block and revocation', async () => {
  for (const user of [A, B, stranger]) await request(user, 'GET', '/me');
  const interests = (await request(A, 'GET', '/interests')).interests.slice(0, 3);
  const prompt = (await request(A, 'GET', '/prompts')).prompts[0];
  for (const [user, name] of [
    [A, 'Alice'],
    [B, 'Bob'],
    [stranger, 'Charlie'],
  ]) {
    await request(user!, 'PUT', '/me/onboarding', {
      displayName: name,
      bio: 'Study and walks',
      socialStyles: ['low_pressure'],
      privacy: {
        discoverable: true,
        messagePermission: 'connections',
        storyVisibility: 'private',
        activityVisibility: 'public',
      },
      interests: interests.map((i: { id: string }) => ({ interestId: i.id, strength: 2 })),
      answers: [{ promptId: prompt.id, answer: 'A campus walk' }],
    });
  }
  expect(
    (await request(A, 'GET', '/discovery/people')).people.some(
      (p: { userId: string }) => p.userId === B,
    ),
  ).toBe(true);
  await request(
    A,
    'POST',
    '/connections/requests',
    { recipientId: B, intro: { kind: 'icebreaker', ref: interests[0].id } },
    201,
  );
  const incoming = (await request(B, 'GET', '/connections/requests?box=incoming')).requests[0];
  await request(stranger, 'POST', `/connections/requests/${incoming.id}/accept`, undefined, 404);
  await request(B, 'POST', `/connections/requests/${incoming.id}/accept`, undefined, 204);
  expect((await request(A, 'GET', '/connections')).connections).toHaveLength(1);
  const conversation = (await request(A, 'POST', '/conversations', { userId: B }, 201))
    .conversation;
  const message = { body: 'Hello Bob', clientTag: randomUUID() };
  const sent = await request(A, 'POST', `/conversations/${conversation.id}/messages`, message, 201);
  expect(
    (await request(A, 'POST', `/conversations/${conversation.id}/messages`, message, 201)).message
      .id,
  ).toBe(sent.message.id);
  expect(
    (await request(B, 'GET', `/conversations/${conversation.id}/messages`)).messages,
  ).toHaveLength(1);
  await request(stranger, 'GET', `/conversations/${conversation.id}/messages`, undefined, 404);
  await request(B, 'POST', `/conversations/${conversation.id}/read`, undefined, 204);
  expect(
    (await request(A, 'GET', `/conversations/${conversation.id}/messages`)).messages[0].read,
  ).toBe(true);

  const group = (
    await request(
      A,
      'POST',
      '/groups',
      { name: 'Study circle', generalArea: 'NUST campus', capacity: 5 },
      201,
    )
  ).group;
  await request(B, 'POST', `/groups/${group.id}/join`, undefined, 204);
  const event = (
    await request(
      A,
      'POST',
      '/events',
      {
        groupId: group.id,
        title: 'Study together',
        generalArea: 'Campus library',
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 90_000_000).toISOString(),
        capacity: 1,
      },
      201,
    )
  ).event;
  expect((await request(A, 'POST', `/events/${event.id}/rsvp`)).status).toBe('going');
  expect((await request(B, 'POST', `/events/${event.id}/rsvp`)).status).toBe('waitlisted');
  await request(A, 'DELETE', `/events/${event.id}/rsvp`, undefined, 204);
  expect((await request(B, 'GET', `/events/${event.id}/attendees`)).attendees[0].userId).toBe(B);
  await request(
    B,
    'POST',
    `/events/${event.id}/messages`,
    { body: 'See you there', clientTag: randomUUID() },
    201,
  );
  expect((await request(B, 'GET', `/events/${event.id}/messages`)).messages).toHaveLength(1);
  expect((await request(A, 'GET', `/share/groups/${group.id}`)).preview.name).toBe('Study circle');

  await request(
    B,
    'POST',
    '/reports',
    { targetType: 'message', targetId: sent.message.id, reason: 'spam', blockUser: true },
    201,
  );
  await request(
    A,
    'POST',
    `/conversations/${conversation.id}/messages`,
    { body: 'Blocked', clientTag: randomUUID() },
    404,
  );
  expect((await request(A, 'GET', '/conversations')).conversations).toHaveLength(0);
  const session = (await request(B, 'GET', '/me/sessions')).sessions[0];
  await request(B, 'DELETE', `/me/sessions/${session.id}`, undefined, 204);
  await request(B, 'GET', '/me', undefined, 401);
  await request(A, 'DELETE', `/groups/${group.id}`, undefined, 204);
});
