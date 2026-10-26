import { expect, type Page } from '@playwright/test';
import type { Profile } from '@sp/types';

export const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const now = '2026-10-24T00:00:00Z';
export const interests = ['Walking', 'Chess', 'Reading'].map((name, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  name,
  slug: name.toLowerCase(),
  category: 'Leisure',
  sortOrder: index,
  strength: 2 as const,
}));
export const profile: Profile = {
  userId,
  displayName: 'Browser Member',
  bio: 'Private synthetic browser fixture',
  socialStyles: ['low_pressure'],
  privacy: {
    discoverable: false,
    messagePermission: 'connections',
    storyVisibility: 'private',
    activityVisibility: 'private',
  },
  onboardingCompleted: true,
  createdAt: now,
  updatedAt: now,
  interests,
  prompts: [
    {
      promptId: 'weekend',
      prompt: 'My ideal weekend',
      category: 'Life',
      answer: 'Reading and walking',
      updatedAt: now,
    },
  ],
  media: [],
  verificationLevel: 'unverified',
};

export async function signedIn(page: Page) {
  let saved = structuredClone(profile);
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  let failSave = false;
  await page.addInitScript(
    ({ userId }) => {
      localStorage.setItem(
        'sb-browser-fixture-auth-token',
        JSON.stringify({
          access_token: 'synthetic-browser-access-token',
          refresh_token: 'synthetic-browser-refresh-token',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user: {
            id: userId,
            email: 'browser@example.invalid',
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
          },
        }),
      );
    },
    { userId },
  );
  await page.route('https://browser-fixture.supabase.co/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const action = route.request().postDataJSON()?.action;
    const responses: Record<string, unknown> = {
      'posts.list': { items: [], cursor: null },
      'ads.serve': [],
      'profile.details.get': {
        handle: null,
        posts: 0,
        followers: 0,
        following: 0,
        audience: 'connections',
      },
      'preferences.get': {
        mutedUsers: [],
        readReceipts: true,
        analyticsConsent: false,
        quietHoursStart: null,
        quietHoursEnd: null,
      },
      telemetry: {},
    };
    if (path.endsWith('/sidle_get_context'))
      return route.fulfill({
        json: { intents: [], availability: null, expiresAt: null, audience: 'connections' },
      });
    if (path.includes('/sidle_') && !path.endsWith('/sidle_platform'))
      return route.fulfill({ json: [] });
    return route.fulfill({
      json: responses[action] ?? { id: userId, email: 'browser@example.invalid' },
    });
  });
  await page.route('**/api/sidle/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/sidle', '');
    if (request.method() === 'OPTIONS')
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': '*',
        },
      });
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (failSave)
        return route.fulfill({
          status: 503,
          json: { error: 'service_unavailable', message: 'Please try saving again.' },
        });
      if (path === '/me/profile') saved = { ...saved, ...body };
      else if (path === '/me/interests')
        saved.interests = interests.map((item) => ({
          ...item,
          strength:
            body.interests.find(
              (selected: { interestId: string }) => selected.interestId === item.id,
            )?.strength ?? 2,
        }));
      else if (path === '/me/prompts')
        saved.prompts = body.answers.map((answer: { promptId: string; answer: string }) => ({
          ...profile.prompts[0],
          ...answer,
        }));
      else {
        unexpected.push(request.method() + ' ' + path);
        return route.fulfill({ status: 501, json: { error: 'unhandled_fixture' } });
      }
      return route.fulfill({ json: saved });
    }
    const responses: Record<string, unknown> = {
      '/me': {
        id: userId,
        email: 'browser@example.invalid',
        phone: null,
        status: 'active',
        roles: ['user'],
        createdAt: now,
        lastActiveAt: now,
      },
      '/me/sessions': { sessions: [] },
      '/me/profile': saved,
      '/interests': { interests },
      '/prompts': {
        prompts: [
          {
            id: 'weekend',
            prompt: 'My ideal weekend',
            category: 'Life',
            sortOrder: 1,
            active: true,
          },
        ],
      },
      '/conversations': { conversations: [] },
      '/discovery/people': { people: [], nextCursor: null },
      '/connections': { connections: [] },
      '/connections/requests': { requests: [] },
      '/blocks': { blocks: [] },
      '/me/interaction-settings': { lowPressureMode: false },
      '/me/notification-settings': { messages: true, connectionRequests: true },
      '/me/notification-delivery': { provider: 'disabled' },
    };
    if (!(path in responses)) {
      unexpected.push(request.method() + ' ' + path);
      return route.fulfill({ status: 501, json: { error: 'unhandled_fixture' } });
    }
    await route.fulfill({ json: responses[path] });
  });
  return {
    writes,
    unexpected,
    failNextSave: () => {
      failSave = true;
    },
    allowSave: () => {
      failSave = false;
    },
  };
}

export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /^Settings/ }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}
