-- Phase 5 Supabase security. Run in the Supabase SQL Editor AFTER migration 0006 (pnpm --filter @sp/api run migrate).
-- Safe to run again (all statements are idempotent).
--
-- Phase 5 tables are API-owned: all writes go through the API with the service role, never from the browser.
-- The ONLY client policies below are SELECT policies scoped to conversation members, and they exist for one
-- reason: Supabase Realtime evaluates RLS as the subscribing user, so without them postgres_changes streams
-- nothing. The same policies also make direct PostgREST reads safe (a member can only ever read their own
-- conversations), but the API remains the source of truth for ordering, rate limits and read watermarks.

-- Membership lookup that bypasses RLS so the policies below cannot recurse
-- (a policy on conversation_members that queried conversation_members directly would loop forever).
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
     where conversation_id = p_conversation_id
       and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public;
revoke execute on function public.is_conversation_member(uuid) from anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Members can read the conversations they belong to. No insert/update/delete policies: the API owns writes.
drop policy if exists conversations_member_select on public.conversations;
create policy conversations_member_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

-- Members can read the member rows (incl. the other person's read watermark) of their own conversations.
drop policy if exists conversation_members_member_select on public.conversation_members;
create policy conversation_members_member_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Members can read the messages of their own conversations. This is what Realtime streams on.
drop policy if exists messages_member_select on public.messages;
create policy messages_member_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- notification_settings and device_push_tokens stay fully API-owned: RLS already enabled by 0006,
-- intentionally no client policies (clients use GET/PUT /me/notification-settings and /me/push-tokens).

-- Realtime: stream new messages and read-watermark updates to channel subscribers.
-- RLS above restricts delivery to the two members of each conversation.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;

-- One-off hardening, unrelated to messaging but flagged in the Phase 5 review: the migration ledger was
-- the only app table with RLS disabled, so its contents were readable by any authenticated client.
-- The migration runner connects as the table owner and is unaffected; no policies means no client access.
alter table public.schema_migrations enable row level security;
