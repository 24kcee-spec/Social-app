-- Phase 3 Supabase security. Run in the Supabase SQL Editor AFTER migration 0004 (pnpm --filter @sp/api run migrate).
-- Safe to run again.
--
-- Why: discovery shows other people's THUMBNAILS. The private profile-media bucket only lets owners read their own files,
-- so without this policy the feed would show blank pictures. This policy lets a signed-in person read ONLY the 512px
-- thumbnail (never the 1400px original) of someone who is discoverable, finished onboarding and is active.
-- The check runs in a SECURITY DEFINER function because profiles/users are protected by RLS for the browser role.

create or replace function public.can_view_discovery_thumbnail(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select object_name like '%-thumb.jpg'
    and exists (
      select 1
        from public.profiles p
        join public.users u on u.id = p.user_id
       where p.user_id::text = (storage.foldername(object_name))[1]
         and p.discoverable = true
         and p.onboarding_completed = true
         and u.status = 'active'
         and not exists (
           select 1 from public.user_blocks b
            where (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
               or (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         )
    );
$$;

revoke all on function public.can_view_discovery_thumbnail(text) from public;
grant execute on function public.can_view_discovery_thumbnail(text) to authenticated;

drop policy if exists profile_media_discovery_thumb_select on storage.objects;
create policy profile_media_discovery_thumb_select on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-media'
  and public.can_view_discovery_thumbnail(name)
);

-- Phase 3 tables are API-owned. RLS is already enabled by the migration; intentionally no client policies.
alter table public.user_blocks enable row level security;
alter table public.discovery_events enable row level security;
