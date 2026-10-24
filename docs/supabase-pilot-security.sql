-- Run AFTER numbered migrations and earlier Supabase security scripts.
-- A valid old JWT must not bypass app suspension, deletion or session revocation.
create or replace function public.has_active_app_session()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active')
    and not exists (
      select 1 from public.user_sessions s where s.user_id = auth.uid()
      and s.auth_session_id = coalesce(nullif(auth.jwt()->>'session_id', ''), 'sub:' || auth.uid()::text)
      and s.revoked_at is not null
    );
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

-- Restrictive policies AND with existing ownership/member/block rules.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_interests','prompt_answers','profile_media','conversations','conversation_members','messages','reports'] loop
    execute format('drop policy if exists app_active_session on public.%I', t);
    execute format('create policy app_active_session on public.%I as restrictive for all to authenticated using (public.has_active_app_session()) with check (public.has_active_app_session())', t);
  end loop;
end;
$$;

drop policy if exists app_active_storage_session on storage.objects;
create policy app_active_storage_session on storage.objects as restrictive for all to authenticated
using (public.has_active_app_session()) with check (public.has_active_app_session());
