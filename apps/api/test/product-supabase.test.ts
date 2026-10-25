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
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create schema app_private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  `);
  await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    grant usage on schema public,auth to authenticated,anon;
    grant execute on all functions in schema auth to authenticated,anon;`);
  const security = await readFile(path.join(root, 'docs/supabase-pilot-security.sql'), 'utf8');
  const start = security.indexOf('create or replace function app_private.has_active_app_session()');
  const end = security.indexOf('create or replace function public.has_active_app_session()');
  await db.exec(security.slice(start, end));
  await db.exec(`create function public.has_active_app_session() returns boolean language sql as $$select app_private.has_active_app_session()$$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;
    grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
  `);
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

it('proves the complete platform schema and real PostgreSQL authorization boundaries', async () => {
  const results = await db.exec(
    await readFile(path.join(root, 'scripts/verify-supabase-platform.sql'), 'utf8'),
  );
  expect((results.at(-1)?.rows[0] as { result: string })?.result).toMatch(/^PASS:/);
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});

it('proves commerce reconciliation, rich messages and live publishing authorization in PostgreSQL', async () => {
  const results = await db.exec(
    await readFile(path.join(root, 'scripts/verify-supabase-commerce.sql'), 'utf8'),
  );
  expect((results.at(-1)?.rows[0] as { result: string })?.result).toMatch(/^PASS:/);
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});

it('proves music, reels, story expiry, playlist ownership, quarantine and privacy preferences', async () => {
  const results = await db.exec(
    await readFile(path.join(root, 'scripts/verify-supabase-media.sql'), 'utf8'),
  );
  expect((results.at(-1)?.rows[0] as { result: string })?.result).toMatch(/^PASS:/);
  expect((await db.query('select * from users')).rows).toHaveLength(0);
});
