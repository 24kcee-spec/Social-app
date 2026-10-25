import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';
import { createProfileStore } from '../src/profile/store';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let db: PGlite;
let store: ReturnType<typeof createProfileStore>;
beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations'));
  await db.query('insert into users (id,email) values ($1,$2),($3,$4)', [
    owner,
    'photo-owner@example.com',
    other,
    'photo-other@example.com',
  ]);
  store = createProfileStore(db);
  for (let slot = 0; slot < 6; slot++)
    await store.addMedia(owner, input(owner, `photo-${slot}`, slot));
  await store.addMedia(other, input(other, 'other', 0));
});
afterAll(async () => {
  await db?.close();
});
function input(user: string, name: string, sortOrder: number) {
  return {
    kind: 'avatar' as const,
    storagePath: `${user}/${name}.jpg`,
    thumbnailPath: `${user}/${name}-thumb.jpg`,
    contentType: 'image/jpeg' as const,
    sizeBytes: 1000,
    width: 1400,
    height: 1400,
    sortOrder,
  };
}
it('replaces a photo at the six-photo limit, preserving its identity and order', async () => {
  const old = (await store.getProfile(owner)).media[2]!;
  const changed = await store.replaceMedia(owner, old.id, input(owner, 'edited', 0));
  expect(changed).toMatchObject({
    id: old.id,
    sortOrder: old.sortOrder,
    storagePath: `${owner}/edited.jpg`,
    createdAt: old.createdAt,
  });
  expect((await store.getProfile(owner)).media).toHaveLength(6);
});
it('rejects foreign media paths, reused bytes and another member’s row', async () => {
  const own = (await store.getProfile(owner)).media[0]!;
  const foreign = (await store.getProfile(other)).media[0]!;
  await expect(store.replaceMedia(owner, own.id, input(other, 'forged', 0))).rejects.toThrow(
    /belong/,
  );
  await expect(store.replaceMedia(owner, own.id, input(owner, 'photo-1', 0))).rejects.toThrow(
    /newly uploaded/,
  );
  expect(await store.replaceMedia(owner, foreign.id, input(owner, 'attempt', 0))).toBeNull();
  expect((await store.getProfile(other)).media[0]).toEqual(foreign);
});
it('makes an existing photo primary atomically without slot collisions or losing metadata', async () => {
  const before = (await store.getProfile(owner)).media;
  const chosen = before[4]!;
  expect(await store.makePrimaryMedia(owner, chosen.id)).toBe(true);
  const after = (await store.getProfile(owner)).media;
  expect(after[0]?.id).toBe(chosen.id);
  expect(after.map((media) => media.sortOrder)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(
    after.map(({ sortOrder: _, ...media }) => media).sort((a, b) => a.id.localeCompare(b.id)),
  ).toEqual(
    before.map(({ sortOrder: _, ...media }) => media).sort((a, b) => a.id.localeCompare(b.id)),
  );
  expect(await store.makePrimaryMedia(owner, chosen.id)).toBe(true);
});
it('cannot promote another member’s photo or change either account on a missing ID', async () => {
  const before = (await store.getProfile(owner)).media;
  const foreign = (await store.getProfile(other)).media[0]!;
  expect(await store.makePrimaryMedia(owner, foreign.id)).toBe(false);
  expect((await store.getProfile(owner)).media).toEqual(before);
  expect((await store.getProfile(other)).media[0]).toEqual(foreign);
});

it('saves overlapping interests and prompt IDs repeatedly without losing photos', async () => {
  const interests = (await store.listInterests())
    .slice(0, 3)
    .map((item) => ({ interestId: item.id, strength: 2 as const }));
  const prompt = (await store.listPrompts())[0]!;
  for (const answer of ['First answer', 'Updated answer']) {
    await store.updateInterests(owner, { interests });
    const saved = await store.updatePrompts(owner, { answers: [{ promptId: prompt.id, answer }] });
    expect(saved.interests).toHaveLength(3);
    expect(saved.prompts[0]?.answer).toBe(answer);
    expect(saved.media).toHaveLength(6);
  }
});

it('can repeat onboarding over populated interests and prompt answers', async () => {
  const interests = (await store.listInterests())
    .slice(0, 3)
    .map((item) => ({ interestId: item.id, strength: 2 as const }));
  const prompt = (await store.listPrompts())[0]!;
  for (const displayName of ['Photo editor', 'Updated profile']) {
    const saved = await store.completeOnboarding(owner, {
      displayName,
      bio: 'Editing an existing profile',
      socialStyles: ['one_to_one'],
      privacy: {
        discoverable: true,
        messagePermission: 'connections',
        storyVisibility: 'private',
        activityVisibility: 'public',
      },
      interests,
      answers: [{ promptId: prompt.id, answer: 'Updated icebreaker answer' }],
    });
    expect(saved.displayName).toBe(displayName);
    expect(saved.interests).toHaveLength(3);
    expect(saved.prompts).toHaveLength(1);
    expect(saved.media).toHaveLength(6);
  }
});
