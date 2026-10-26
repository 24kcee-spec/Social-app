-- Opaque member-only invalidation; message content and private reactions stay private.
create function app_private.conversation_access(conversation uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select app_private.has_active_app_session() and app_private.platform_conversation(auth.uid(),conversation)
$$;
create function public.sidle_conversation_access(conversation uuid) returns boolean
language sql stable security invoker set search_path='' as $$select app_private.conversation_access(conversation)$$;
revoke all on function app_private.conversation_access(uuid),public.sidle_conversation_access(uuid) from public,anon;
grant execute on function app_private.conversation_access(uuid),public.sidle_conversation_access(uuid) to authenticated;
create table public.conversation_changes(
 conversation_id uuid primary key references public.conversations(id) on delete cascade,
 revision uuid not null default gen_random_uuid(),changed_at timestamptz not null default now()
);
alter table public.conversation_changes enable row level security;
revoke all on public.conversation_changes from public,anon,authenticated;
grant select on public.conversation_changes to authenticated;
create policy conversation_changes_member on public.conversation_changes for select to authenticated
 using(public.sidle_conversation_access(conversation_id));
create function app_private.signal_conversation_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare conversation uuid;message uuid;
begin
 if tg_table_name='messages' then conversation:=coalesce(new.conversation_id,old.conversation_id);
 else message:=coalesce(new.message_id,old.message_id);select conversation_id into conversation from public.messages where id=message;end if;
 if conversation is not null and exists(select 1 from public.conversations where id=conversation) then
  insert into public.conversation_changes(conversation_id) values(conversation)
  on conflict(conversation_id) do update set revision=gen_random_uuid(),changed_at=now();
 end if;
 return null;
end;$$;
revoke all on function app_private.signal_conversation_change() from public,anon,authenticated;
create trigger sidle_conversation_message after insert or update or delete on public.messages for each row execute function app_private.signal_conversation_change();
create trigger sidle_conversation_details after insert or update or delete on app_private.message_details for each row execute function app_private.signal_conversation_change();
create trigger sidle_conversation_reaction after insert or update or delete on app_private.message_reactions for each row execute function app_private.signal_conversation_change();
insert into public.conversation_changes(conversation_id) select id from public.conversations;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.conversation_changes;
 end if;
end;$$;

-- Both the legacy API and rich RPC write messages; one transactionally inserted
-- job per message prevents the newer path from bypassing notification delivery.
create table app_private.message_push_jobs(
 message_id uuid primary key references public.messages(id) on delete cascade,
 created_at timestamptz not null default now(),claimed_at timestamptz,completed_at timestamptz,
 outcome text check(outcome in('accepted','skipped','unknown','expired'))
);
alter table app_private.message_push_jobs enable row level security;
revoke all on app_private.message_push_jobs from public,anon,authenticated;
create index message_push_jobs_pending on app_private.message_push_jobs(created_at) where completed_at is null;
create function app_private.queue_message_push() returns trigger
language plpgsql security definer set search_path='' as $$begin
 insert into app_private.message_push_jobs(message_id) values(new.id) on conflict do nothing;return null;
end;$$;
revoke all on function app_private.queue_message_push() from public,anon,authenticated;
create trigger sidle_message_push after insert on public.messages for each row execute function app_private.queue_message_push();
-- Historical messages intentionally do not produce fresh alerts.
notify pgrst,'reload schema';
