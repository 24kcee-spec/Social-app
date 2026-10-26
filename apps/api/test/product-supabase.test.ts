import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';
import { createQueuedPushWorker } from '../src/messaging/queue';

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

it('keeps live chat invalidation and the durable push queue member/session safe', async () => {
  const results = await db.exec(
    await readFile(path.join(root, 'scripts/verify-supabase-chat.sql'), 'utf8'),
  );
  expect((results.at(-1)?.rows[0] as { result: string })?.result).toMatch(/^PASS:/);
});

it('claims queued pushes once and records uncertain provider outcomes without replay', async () => {
  await db.exec('begin');
  try {
    const a = 'aa000000-0000-4000-8000-000000000001',
      b = 'bb000000-0000-4000-8000-000000000001';
    await db.query(
      "insert into users(id,email) values ($1,'queue-a@example.invalid'),($2,'queue-b@example.invalid')",
      [a, b],
    );
    const conversation = (
      await db.query<{ id: string }>(
        'insert into conversations(direct_a,direct_b) values($1,$2) returning id',
        [a, b],
      )
    ).rows[0]!.id;
    await db.query(
      "insert into messages(conversation_id,sender_id,body,client_tag) values($1,$2,'queue fixture',gen_random_uuid())",
      [conversation, a],
    );
    let sends = 0;
    const worker = createQueuedPushWorker(db, {
      messageSent: async () => {
        sends++;
        return { sent: 0, failed: true };
      },
    });
    await worker();
    await worker();
    expect(sends).toBe(1);
    expect((await db.query('select outcome from app_private.message_push_jobs')).rows).toEqual([
      { outcome: 'unknown' },
    ]);
  } finally {
    await db.exec('rollback');
  }
});

it('restores a synthetic database archive with private schema and grants intact', async () => {
  const id = 'ee000000-0000-4000-8000-000000000001';
  await db.query("insert into users(id,email) values($1,'restore-fixture@example.invalid')", [id]);
  let restored: PGlite | undefined;
  try {
    const archive = await db.dumpDataDir('gzip');
    restored = new PGlite({ loadDataDir: archive });
    expect((await restored.query('select id from users where id=$1', [id])).rows).toHaveLength(1);
    expect(
      (
        await restored.query(
          "select has_table_privilege('anon','public.conversation_changes','select') as allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (
        await restored.query(
          "select has_table_privilege('authenticated','app_private.message_push_jobs','select') as allowed",
        )
      ).rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (
        await restored.query(
          "select relrowsecurity from pg_class where oid='public.conversation_changes'::regclass",
        )
      ).rows,
    ).toEqual([{ relrowsecurity: true }]);
  } finally {
    await restored?.close();
    await db.query('delete from users where id=$1', [id]);
  }
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
