import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(root, 'apps/api/migrations'));
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  `);
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    grant usage on schema public,auth to authenticated,anon;
    grant execute on all functions in schema auth to authenticated,anon;`);
  const security = await readFile(path.join(root, 'docs/supabase-pilot-security.sql'), 'utf8');
  const start = security.indexOf('create or replace function app_private.has_active_app_session()');
  const end = security.indexOf('create or replace function public.has_active_app_session()');
  await db.exec(security.slice(start, end));
  const directory = path.join(root, 'supabase/migrations');
  for (const name of (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(path.join(directory, name), 'utf8'));
  }
});
afterAll(async () => {
  await db?.close();
});

it('proves product persistence, privacy, expiration, retries, admin limits, revocation and erasure with rollback-only SQL', async () => {
  const results = await db.exec(
    await readFile(path.join(root, 'scripts/verify-supabase-product.sql'), 'utf8'),
  );
  expect((results.at(-1)?.rows[0] as { result: string })?.result).toMatch(/^PASS:/);
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});
