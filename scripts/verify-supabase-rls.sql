-- Run through the authenticated Management SQL API. All fixtures are rolled back;
-- no real Auth accounts, emails, Storage blobs or Realtime events are created.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '40s';
create temporary table sidle_probe(a uuid, b uuid, outsider uuid, conversation uuid) on commit drop;
insert into sidle_probe values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on sidle_probe to authenticated;

insert into public.users(id,email)
select id, 'sidle-rls-' || id::text || '@example.invalid'
from (select a as id from sidle_probe union all select b from sidle_probe union all select outsider from sidle_probe) x;
insert into public.profiles(user_id,display_name,discoverable,onboarding_completed)
select id,'RLS probe',false,true
from (select a as id from sidle_probe union all select b from sidle_probe union all select outsider from sidle_probe) x;
insert into public.connections(user_a,user_b) select least(a,b),greatest(a,b) from sidle_probe;
insert into public.conversations(id,direct_a,direct_b) select conversation,least(a,b),greatest(a,b) from sidle_probe;
insert into public.conversation_members(conversation_id,user_id)
select conversation,a from sidle_probe union all select conversation,b from sidle_probe;
insert into public.messages(conversation_id,sender_id,body,client_tag)
select conversation,a,'Synthetic RLS probe',gen_random_uuid() from sidle_probe;
insert into public.user_sessions(user_id,auth_session_id) select a,'sidle-probe-session' from sidle_probe;
insert into storage.objects(bucket_id,name,owner_id)
select 'profile-media',a::text || '/probe.jpg',a::text from sidle_probe
union all select 'profile-media',a::text || '/probe-thumb.jpg',a::text from sidle_probe;

select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id','sidle-probe-session')::text,true) from sidle_probe;
set local role authenticated;
do $$
declare n integer;
begin
  if (select count(*) from public.messages where conversation_id=(select conversation from pg_temp.sidle_probe)) <> 1 then raise exception 'Member cannot read messages'; end if;
  if (select count(*) from storage.objects where owner_id=(select a::text from pg_temp.sidle_probe)) <> 2 then raise exception 'Owner cannot read profile media'; end if;
  begin
    insert into public.reports(reporter_id,target_type,target_id,reason)
    select a,'profile',b::text,'spam' from pg_temp.sidle_probe;
    raise exception 'Direct report write unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set verification_level='trusted' where user_id=(select a from pg_temp.sidle_probe);
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'Direct badge forgery unexpectedly allowed'; end if;
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','sidle-probe-other')::text,true) from sidle_probe;
set local role authenticated;
do $$ begin
  if (select count(*) from public.messages where conversation_id=(select conversation from pg_temp.sidle_probe)) <> 1 then raise exception 'Second member cannot read messages'; end if;
  if (select count(*) from storage.objects where owner_id=(select a::text from pg_temp.sidle_probe)) <> 1 then raise exception 'Thumbnail access or original-photo privacy failed'; end if;
end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated','session_id','sidle-probe-outsider')::text,true) from sidle_probe;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.messages where conversation_id=(select conversation from pg_temp.sidle_probe)) then raise exception 'Outsider can read messages'; end if;
  if exists(select 1 from storage.objects where owner_id=(select a::text from pg_temp.sidle_probe)) then raise exception 'Outsider can read private photos'; end if;
end; $$;
reset role;

update public.user_sessions set revoked_at=now() where user_id=(select a from sidle_probe);
select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id','sidle-probe-session')::text,true) from sidle_probe;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.messages where conversation_id=(select conversation from pg_temp.sidle_probe)) then raise exception 'Revoked session can read messages'; end if;
  if exists(select 1 from storage.objects where owner_id=(select a::text from pg_temp.sidle_probe)) then raise exception 'Revoked session can read media'; end if;
  begin
    insert into storage.objects(bucket_id,name,owner_id) select 'profile-media',a::text || '/revoked.jpg',a::text from pg_temp.sidle_probe;
    raise exception 'Revoked upload unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;

update public.user_sessions set revoked_at=null where user_id=(select a from sidle_probe);
insert into public.user_blocks(blocker_id,blocked_id) select a,b from sidle_probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','sidle-probe-other')::text,true) from sidle_probe;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.messages where conversation_id=(select conversation from pg_temp.sidle_probe)) then raise exception 'Blocked member can read messages'; end if;
  if exists(select 1 from storage.objects where owner_id=(select a::text from pg_temp.sidle_probe)) then raise exception 'Blocked member can read thumbnail'; end if;
end; $$;
reset role;

update public.users set status='deleted' where id=(select b from sidle_probe);
set local role authenticated;
do $$ begin
  if public.has_active_app_session() then raise exception 'Deleted account has an active session'; end if;
end; $$;
reset role;
rollback;
select 'PASS: live membership, originals/thumbnails, outsider, write-forgery, revocation, block and deleted-account checks; all fixtures rolled back' as result;
