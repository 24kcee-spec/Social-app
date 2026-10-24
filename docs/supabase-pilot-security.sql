-- Run LAST, after numbered migrations and earlier Supabase security scripts.
-- Privileged RLS implementations live outside the Data API's exposed schemas.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.has_active_app_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active')
    and not exists (
      select 1 from public.user_sessions s where s.user_id = auth.uid()
      and s.auth_session_id = coalesce(nullif(auth.jwt()->>'session_id', ''), 'sub:' || auth.uid()::text)
      and s.revoked_at is not null
    );
$$;
revoke all on function app_private.has_active_app_session() from public, anon;
grant execute on function app_private.has_active_app_session() to authenticated;

create or replace function public.has_active_app_session()
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.has_active_app_session();
$$;
revoke all on function public.has_active_app_session() from public, anon;
grant execute on function public.has_active_app_session() to authenticated;

-- Client writes cannot forge badges or bypass API validation/rate limits.
drop policy if exists profiles_self_insert on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists user_interests_self_insert on public.user_interests;
drop policy if exists user_interests_self_update on public.user_interests;
drop policy if exists user_interests_self_delete on public.user_interests;
drop policy if exists prompt_answers_self_insert on public.prompt_answers;
drop policy if exists prompt_answers_self_update on public.prompt_answers;
drop policy if exists prompt_answers_self_delete on public.prompt_answers;
drop policy if exists reports_reporter_insert on public.reports;
drop policy if exists reports_admin_update on public.reports;
drop policy if exists reports_reporter_select on public.reports;

-- Restrictive policies AND with existing ownership/member/block rules.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_interests','prompt_answers','profile_media','conversations','conversation_members','messages','reports'] loop
    execute format('drop policy if exists app_active_session on public.%I', t);
    execute format('create policy app_active_session on public.%I as restrictive for all to authenticated using ((select public.has_active_app_session())) with check ((select public.has_active_app_session()))', t);
  end loop;
end;
$$;

drop policy if exists app_active_storage_session on storage.objects;
create policy app_active_storage_session on storage.objects as restrictive for all to authenticated
using ((select public.has_active_app_session())) with check ((select public.has_active_app_session()));

create or replace function app_private.can_view_discovery_thumbnail(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_active_app_session() and object_name like '%-thumb.jpg'
    and exists (
      select 1
        from public.profiles p
        join public.users u on u.id = p.user_id
       where p.user_id::text = (storage.foldername(object_name))[1]
         and u.status = 'active'
         and not exists (
           select 1 from public.user_blocks b
            where (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
               or (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         )
         and (
           (p.discoverable = true and p.onboarding_completed = true)
           or exists (select 1 from public.connections c
                       where (c.user_a = p.user_id and c.user_b = (select auth.uid())) or (c.user_b = p.user_id and c.user_a = (select auth.uid())))
           or exists (select 1 from public.connection_requests r
                       where r.status = 'pending' and r.expires_at > now()
                         and ((r.sender_id = p.user_id and r.recipient_id = (select auth.uid())) or (r.recipient_id = p.user_id and r.sender_id = (select auth.uid()))))
         )
    );
$$;
revoke all on function app_private.can_view_discovery_thumbnail(text) from public, anon;
grant execute on function app_private.can_view_discovery_thumbnail(text) to authenticated;
create or replace function public.can_view_discovery_thumbnail(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.can_view_discovery_thumbnail(object_name);
$$;
revoke all on function public.can_view_discovery_thumbnail(text) from public, anon;
grant execute on function public.can_view_discovery_thumbnail(text) to authenticated;

create or replace function app_private.is_conversation_visible(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.has_active_app_session() and exists (
    select 1
      from public.conversation_members m
      join public.conversations c on c.id = m.conversation_id
     where m.conversation_id = p_conversation_id
       and m.user_id = (select auth.uid())
       and not exists (
         select 1 from public.user_blocks b
          where (b.blocker_id = c.direct_a and b.blocked_id = c.direct_b)
             or (b.blocker_id = c.direct_b and b.blocked_id = c.direct_a)
       )
  );
$$;
revoke all on function app_private.is_conversation_visible(uuid) from public, anon;
grant execute on function app_private.is_conversation_visible(uuid) to authenticated;
create or replace function public.is_conversation_visible(p_conversation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.is_conversation_visible(p_conversation_id);
$$;
revoke all on function public.is_conversation_visible(uuid) from public, anon;
grant execute on function public.is_conversation_visible(uuid) to authenticated;

-- Preserve the old membership API name, with the current block/session semantics.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select app_private.is_conversation_visible(p_conversation_id);
$$;
revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Media messaging is not implemented: do not expose a direct upload bypass.
drop policy if exists "Chat media insert policy" on storage.objects;
drop policy if exists "Chat media read policy" on storage.objects;
drop policy if exists chat_media_member_insert on storage.objects;
drop policy if exists chat_media_member_select on storage.objects;
drop policy if exists chat_media_disabled on storage.objects;
create policy chat_media_disabled on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'chat-media') with check (bucket_id <> 'chat-media');
