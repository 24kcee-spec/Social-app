import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';
import { createProfileStore } from '../src/profile/store';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const email = 'student@students.nust.ac.zw';
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(path.dirname(fileURLToPath(import.meta.url)), '../migrations'));
});
beforeEach(async () => {
  await db.exec('truncate users cascade');
  await db.query('insert into users (id, email) values ($1, $2)', [id, email]);
  await db.query('insert into profiles (user_id) values ($1)', [id]);
});

describe('persistent verification proof', () => {
  it('does not grant a badge just for reading an academic account profile', async () => {
    expect((await createProfileStore(db).getProfile(id)).verificationLevel).toBe('unverified');
  });
  it('rejects unproven or other-account email, persists matching proof', async () => {
    const store = createProfileStore(db);
    expect((await store.verifyStudent(id, { studentEmail: email }, null)).verified).toBe(false);
    expect(
      (await store.verifyStudent(id, { studentEmail: email }, 'other@students.nust.ac.zw'))
        .verified,
    ).toBe(false);
    expect((await store.verifyStudent(id, { studentEmail: email }, email)).verified).toBe(true);
    expect((await store.getProfile(id)).verificationLevel).toBe('student_verified');
    expect((await store.getVerificationStatus(id)).verified).toBe(true);
  });
  it('invalidates proof immediately on email change, including discovery badges', async () => {
    await createProfileStore(db).verifyStudent(id, { studentEmail: email }, email);
    await db.query("update users set email = 'other@example.com' where id = $1", [id]);
    expect(
      (
        await db.query(
          'select verification_level, verified_student_email from profiles where user_id = $1',
          [id],
        )
      ).rows[0],
    ).toEqual({ verification_level: 'unverified', verified_student_email: null });
  });
  it('removes legacy badges with no ownership evidence', async () => {
    await db.query(
      "update profiles set verification_level = 'student_verified' where user_id = $1",
      [id],
    );
    expect((await createProfileStore(db).getProfile(id)).verificationLevel).toBe('unverified');
  });
});
