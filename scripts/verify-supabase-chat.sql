begin;
set local statement_timeout='40s';set local lock_timeout='5s';
create temporary table chat_probe(a uuid,b uuid,c uuid,conversation uuid,message uuid,revision uuid,client uuid) on commit drop;
insert into chat_probe values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,gen_random_uuid());
grant all on chat_probe to authenticated;
insert into public.users(id,email) select id,'chat-probe-'||id||'@example.invalid' from(select a id from chat_probe union all select b from chat_probe union all select c from chat_probe)x;
insert into public.profiles(user_id,display_name,onboarding_completed,discoverable) select id,'Chat probe',true,false from(select a id from chat_probe union all select b from chat_probe union all select c from chat_probe)x;
insert into public.user_sessions(user_id,auth_session_id) select a,'chat-a' from chat_probe union all select b,'chat-b' from chat_probe union all select c,'chat-c' from chat_probe;
insert into public.connections(user_a,user_b) select least(a,b),greatest(a,b) from chat_probe;
insert into public.conversations(id,direct_a,direct_b) select conversation,least(a,b),greatest(a,b) from chat_probe;
insert into public.conversation_members(conversation_id,user_id) select conversation,a from chat_probe union all select conversation,b from chat_probe;
select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id','chat-a')::text,true) from chat_probe;
set local role authenticated;
do $$declare result jsonb;begin
 result:=public.sidle_platform('messages.send',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'clientId',(select client from pg_temp.chat_probe),'body','Synthetic chat'));
 update pg_temp.chat_probe set message=(result->>'id')::uuid;
 perform public.sidle_platform('messages.send',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'clientId',(select client from pg_temp.chat_probe),'body','Synthetic chat'));
 update pg_temp.chat_probe set revision=(select revision from public.conversation_changes where conversation_id=(select conversation from pg_temp.chat_probe));
 if (select revision from pg_temp.chat_probe) is null then raise exception 'Member invalidation missing';end if;
 if jsonb_array_length(public.sidle_platform('messages.search',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'query','Synthetic'))->'items')<>1 then raise exception 'Member text search failed';end if;
 if public.sidle_platform('messages.lookup',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'id',(select message from pg_temp.chat_probe)))->>'body'<>'Synthetic chat' then raise exception 'Reply lookup failed';end if;
 if public.sidle_platform('messages.media',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe)))->'items'<>'[]'::jsonb then raise exception 'Unexpected shared media';end if;
 begin update public.conversation_changes set revision=gen_random_uuid();raise exception 'Client forged invalidation';exception when insufficient_privilege then null;end;
end;$$;
reset role;
do $$begin
 if(select count(*) from app_private.message_push_jobs where message_id=(select message from pg_temp.chat_probe))<>1 then raise exception 'Push job duplicated';end if;
end;$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','chat-b')::text,true) from chat_probe;
set local role authenticated;
select public.sidle_platform('messages.react',jsonb_build_object('id',message,'reaction','love')) from chat_probe;
do $$begin
 if (select revision from public.conversation_changes where conversation_id=(select conversation from pg_temp.chat_probe))=(select revision from pg_temp.chat_probe) then raise exception 'Reaction invalidation missing';end if;
 begin select count(*) from app_private.message_push_jobs;raise exception 'Push queue exposed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',c,'role','authenticated','session_id','chat-c')::text,true) from chat_probe;
set local role authenticated;
do $$begin
 if exists(select 1 from public.conversation_changes) then raise exception 'Outsider invalidation leak';end if;
 begin perform public.sidle_platform('messages.search',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'query','Synthetic'));raise exception 'Outsider search leak';exception when insufficient_privilege then null;end;
 begin perform public.sidle_platform('messages.lookup',jsonb_build_object('conversationId',(select conversation from pg_temp.chat_probe),'id',(select message from pg_temp.chat_probe)));raise exception 'Outsider lookup leak';exception when insufficient_privilege then null;end;
end;$$;
reset role;
update public.user_sessions set revoked_at=now() where user_id=(select b from chat_probe);
select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','chat-b')::text,true) from chat_probe;
set local role authenticated;
do $$begin
 if exists(select 1 from public.conversation_changes) then raise exception 'Revoked session invalidation leak';end if;
end;$$;
reset role;
rollback;
select 'PASS: member-only invalidation, reactions, forged writes, outsiders, revoked sessions and exactly-one durable push job; fixtures rolled back' as result;
