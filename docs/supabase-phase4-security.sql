-- Phase 4 Supabase security. Run in the Supabase SQL Editor AFTER migration 0005 (pnpm --filter @sp/api run migrate).
-- Safe to run again. Replaces the Phase 3 thumbnail check so that people who have said hi to each other, or are connected,
-- can still see each other's thumbnail even if one of them later switches off "discoverable".
-- Originals stay owner-only. Blocks still hide everything in both directions.

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

revoke all on function public.can_view_discovery_thumbnail(text) from public;
grant execute on function public.can_view_discovery_thumbnail(text) to authenticated;

-- Phase 4 tables are API-owned. RLS is already enabled by the migration; intentionally no client policies.
alter table public.question_cards enable row level security;
alter table public.this_or_that_catalog enable row level security;
alter table public.interaction_settings enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.activation_milestones enable row level security;
