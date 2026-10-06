-- Phase 5b Supabase security hardening. Run in the Supabase SQL Editor AFTER docs/supabase-phase5-security.sql.
-- Safe to run again (all statements are idempotent). Does not change any migration.
--
-- Why: the Phase 5 SELECT policies only checked membership. After one person blocks the other, the API now
-- hides the chat from both of them (D-029), but Supabase Realtime and direct PostgREST reads evaluate these
-- RLS policies, not the API. Without this file a blocked person's Realtime stream and direct reads would
-- keep working. This makes the database enforce the same rule as the API.

-- A conversation is visible to a user only when they are a member AND neither person has blocked the other.
-- SECURITY DEFINER (search_path = '') so the lookup bypasses RLS on conversation_members/user_blocks and the
-- policies below cannot recurse.
create or replace function public.is_conversation_visible(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
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

revoke all on function public.is_conversation_visible(uuid) from public;
revoke execute on function public.is_conversation_visible(uuid) from anon;
grant execute on function public.is_conversation_visible(uuid) to authenticated;

-- Same policy names as Phase 5 (the setup-check keys on them); only the predicate becomes block-aware.
drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select on public.conversations
  for select to authenticated
  using (public.is_conversation_visible(id));

drop policy if exists conversation_members_member_select on public.conversation_members;
create policy conversation_members_member_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_visible(conversation_id));

drop policy if exists messages_member_select on public.messages;
create policy messages_member_select on public.messages
  for select to authenticated
  using (public.is_conversation_visible(conversation_id));
