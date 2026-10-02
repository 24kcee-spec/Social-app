-- Phase 2 Supabase security/bootstrap. Run in Supabase SQL Editor AFTER migration 0003 has been applied.
-- Safe to run again: policies are dropped/recreated and the bucket is upserted.

-- Public-table RLS policies. The API still uses the server-side DB connection; this protects direct Data API access.
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists user_interests_self_select on public.user_interests;
drop policy if exists user_interests_self_insert on public.user_interests;
drop policy if exists user_interests_self_update on public.user_interests;
drop policy if exists user_interests_self_delete on public.user_interests;
drop policy if exists prompt_answers_self_select on public.prompt_answers;
drop policy if exists prompt_answers_self_insert on public.prompt_answers;
drop policy if exists prompt_answers_self_update on public.prompt_answers;
drop policy if exists prompt_answers_self_delete on public.prompt_answers;
drop policy if exists interests_authenticated_select on public.interests;
drop policy if exists prompt_catalog_authenticated_select on public.prompt_catalog;
drop policy if exists profile_media_self_select on public.profile_media;

create policy profiles_self_select on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_self_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_self_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy user_interests_self_select on public.user_interests for select to authenticated using ((select auth.uid()) = user_id);
create policy user_interests_self_insert on public.user_interests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_interests_self_update on public.user_interests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_interests_self_delete on public.user_interests for delete to authenticated using ((select auth.uid()) = user_id);

create policy prompt_answers_self_select on public.prompt_answers for select to authenticated using ((select auth.uid()) = user_id);
create policy prompt_answers_self_insert on public.prompt_answers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy prompt_answers_self_update on public.prompt_answers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy prompt_answers_self_delete on public.prompt_answers for delete to authenticated using ((select auth.uid()) = user_id);

create policy interests_authenticated_select on public.interests for select to authenticated using (active = true);
create policy prompt_catalog_authenticated_select on public.prompt_catalog for select to authenticated using (active = true);
create policy profile_media_self_select on public.profile_media for select to authenticated using ((select auth.uid()) = user_id);

-- Private profile-media bucket. Uploads/read/deletes are scoped to the signed-in user's first path segment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_media_storage_insert on storage.objects;
drop policy if exists profile_media_storage_select on storage.objects;
drop policy if exists profile_media_storage_update on storage.objects;
drop policy if exists profile_media_storage_delete on storage.objects;

create policy profile_media_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy profile_media_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
);

create policy profile_media_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
)
with check (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy profile_media_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-media'
  and owner_id = (select auth.uid()::text)
);

-- Phase 1 identity/session tables are API-owned. Enable RLS and intentionally
-- do not create client-facing policies for them. The API's database connection
-- is trusted server-side; direct Data API access should not expose these rows.
alter table public.users enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_sessions enable row level security;
