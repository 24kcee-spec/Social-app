import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const A = 'a1000000-0000-4000-8000-000000000000';
const B = 'a2000000-0000-4000-8000-000000000000';
const C = 'a3000000-0000-4000-8000-000000000000';
let db: PGlite;
let conversation: string;
const file = (name: string) => readFile(path.join(root, 'docs', name), 'utf8');

async function asUser(user: string, query: string, parameters: unknown[] = []) {
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: user, session_id: `session-${user}` })]);
  await db.exec('set role authenticated');
  try { return await db.query(query, parameters); }
  finally { await db.exec('reset role; reset request.jwt.claims'); }
}
beforeAll(async () => {
  db = new PGlite();
  await runMigrations(db, path.join(root, 'apps/api/migrations'));
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(regexp_replace(name, '/[^/]+$', ''), '/') $$;
    create publication supabase_realtime;
  `);
  for (const name of ['supabase-phase2-security.sql', 'supabase-phase3-security.sql', 'supabase-phase4-security.sql', 'supabase-phase5-security.sql', 'supabase-phase5b-security.sql', 'supabase-phase9-security.sql', 'supabase-phase11-storage.sql', 'supabase-pilot-security.sql']) await db.exec(await file(name));
  await db.exec('grant usage on schema public, storage, auth to authenticated; grant select, insert, update, delete on all tables in schema public, storage to authenticated');
});
beforeEach(async () => {
  await db.exec('truncate storage.objects; truncate public.users cascade');
  for (const id of [A, B, C]) {
    await db.query("insert into users(id,email) values ($1,$2)", [id, `${id}@example.invalid`]);
    await db.query("insert into profiles(user_id,display_name,onboarding_completed,discoverable) values ($1,'Member',true,false)", [id]);
  }
  await db.query('insert into connections(user_a,user_b) values ($1,$2)', [A,B]);
  conversation = (await db.query<{id:string}>('insert into conversations(direct_a,direct_b) values ($1,$2) returning id', [A,B])).rows[0]!.id;
  await db.query('insert into conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)', [conversation,A,B]);
  await db.query("insert into messages(conversation_id,sender_id,body,client_tag) values ($1,$2,'hello',gen_random_uuid())", [conversation,A]);
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values ('profile-media',$1,$3),('profile-media',$2,$3)", [`${A}/photo.jpg`,`${A}/photo-thumb.jpg`,A]);
});
afterAll(async () => { await db?.close(); });

describe('complete Supabase security script chain', () => {
  it('allows members and connected thumbnails while hiding originals and nonmembers', async () => {
    expect((await asUser(B,'select * from messages')).rows).toHaveLength(1);
    expect((await asUser(C,'select * from messages')).rows).toHaveLength(0);
    expect((await asUser(A,'select name from storage.objects')).rows).toHaveLength(2);
    expect((await asUser(B,'select name from storage.objects')).rows).toEqual([{name:`${A}/photo-thumb.jpg`}]);
    expect((await asUser(C,'select name from storage.objects')).rows).toHaveLength(0);
  });
  it('enforces bidirectional blocks for messages and signed-thumbnail eligibility', async () => {
    await db.query('insert into user_blocks(blocker_id,blocked_id) values ($1,$2)',[A,B]);
    expect((await asUser(A,'select * from messages')).rows).toHaveLength(0);
    expect((await asUser(B,'select * from messages')).rows).toHaveLength(0);
    expect((await asUser(B,'select name from storage.objects')).rows).toHaveLength(0);
  });
  it('denies old revoked/deleted sessions direct reads and storage writes', async () => {
    await db.query('insert into user_sessions(user_id,auth_session_id,revoked_at) values ($1,$2,now())',[A,`session-${A}`]);
    expect((await asUser(A,'select * from messages')).rows).toHaveLength(0);
    expect((await asUser(A,'select name from storage.objects')).rows).toHaveLength(0);
    await expect(asUser(A,"insert into storage.objects(bucket_id,name,owner_id) values ('profile-media',$1,$2)",[`${A}/new.jpg`,A])).rejects.toThrow();
    await db.query("update users set status='deleted' where id=$1",[B]);
    expect((await asUser(B,'select * from messages')).rows).toHaveLength(0);
  });
  it('allows own profile uploads while disabling unsupported chat media uploads', async () => {
    await expect(asUser(A,"insert into storage.objects(bucket_id,name,owner_id) values ('profile-media',$1,$2)",[`${A}/new.jpg`,A])).resolves.toBeDefined();
    await expect(asUser(A,"insert into storage.objects(bucket_id,name,owner_id) values ('profile-media',$1,$2)",[`${B}/forged.jpg`,A])).rejects.toThrow();
    await expect(asUser(A,"insert into storage.objects(bucket_id,name,owner_id) values ('chat-media',$1,$2)",[`${conversation}/forged.jpg`,A])).rejects.toThrow();
  });
  it('rejects forged badges and reports even with broad Data API table grants', async () => {
    expect((await asUser(A,"update profiles set verification_level='trusted' where user_id=$1 returning user_id",[A])).rows).toHaveLength(0);
    await expect(asUser(A,"insert into reports(reporter_id,target_type,target_id,reason) values ($1,'profile',$2,'spam')",[A,B])).rejects.toThrow();
    expect((await asUser(A,'select * from email_proof_settings')).rows).toHaveLength(0);
  });
  it('is repeatable and exposes no privileged public RPC implementations', async () => {
    await db.exec(await file('supabase-pilot-security.sql'));
    const exposed = await db.query("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef");
    expect(exposed.rows).toHaveLength(0);
    expect((await db.query("select has_function_privilege('anon','public.can_view_discovery_thumbnail(text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
    expect((await asUser(A,'select public.is_conversation_visible($1) as allowed',[conversation])).rows).toEqual([{allowed:true}]);
  });
});
