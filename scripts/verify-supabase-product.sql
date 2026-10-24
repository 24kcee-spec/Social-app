-- Runs unchanged on PGlite and live Supabase. Every synthetic change rolls back.
begin;
set local lock_timeout='5s';
set local statement_timeout='40s';
create temporary table product_probe(a uuid,b uuid,outsider uuid,admin uuid,receipt uuid) on commit drop;
insert into product_probe values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on product_probe to authenticated,anon;
insert into public.users(id,email)
select id,'sidle-product-probe-'||id||'@example.invalid' from (
  select a as id from product_probe union all select b from product_probe union all select outsider from product_probe union all select admin from product_probe
) x;
insert into public.profiles(user_id,display_name,onboarding_completed,discoverable)
select id,'Product probe',true,true from (
  select a as id from product_probe union all select b from product_probe union all select admin from product_probe
) x;
insert into public.profiles(user_id,display_name,onboarding_completed,discoverable) select outsider,'Private probe',true,false from product_probe;
insert into public.user_roles(user_id,role) select admin,'admin' from product_probe;
insert into public.user_sessions(user_id,auth_session_id) select b,'product-session' from product_probe;

set local role anon;
do $$ begin
  begin perform public.sidle_get_context(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id','product-a')::text,true) from product_probe;
set local role authenticated;
do $$ declare result jsonb; begin
  result:=public.sidle_get_context();
  if result->>'audience'<>'connections' or result->'intents'<>'[]'::jsonb then raise exception 'Unsafe context defaults'; end if;
  result:=public.sidle_set_context(array['study','coffee_chat'],'open_to_plans',24,'connections');
  if jsonb_array_length(result->'intents')<>2 or (result->>'expiresAt')::timestamptz<=now() then raise exception 'Context did not persist'; end if;
  begin perform public.sidle_set_context(array['made_up'],null,24,'connections'); raise exception 'Invalid intent accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.sidle_set_context(array['study'],'open_to_plans',999,'connections'); raise exception 'Unbounded expiry accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.sidle_set_context(array['study',null],null,24,'connections'); raise exception 'Null intent accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.sidle_save_introduction((select a from pg_temp.product_probe),true); raise exception 'Self save allowed'; exception when invalid_parameter_value then null; end;
  begin perform app_private.product_visible((select a from pg_temp.product_probe),(select b from pg_temp.product_probe)); raise exception 'Private visibility helper exposed'; exception when insufficient_privilege then null; end;
  begin perform 1 from app_private.social_context; raise exception 'Private table exposed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','product-session')::text,true) from product_probe;
set local role authenticated;
do $$ declare first_receipt jsonb; begin
  if public.sidle_people_context(array[(select a from pg_temp.product_probe)])<>'[]'::jsonb then raise exception 'Connections-only context exposed'; end if;
  perform public.sidle_save_introduction((select a from pg_temp.product_probe),true);
  perform public.sidle_save_introduction((select a from pg_temp.product_probe),true);
  if jsonb_array_length(public.sidle_saved_introductions())<>1 or public.sidle_saved_people()->0->>'displayName'<>'Product probe' then raise exception 'Saved retry/read failed'; end if;
  begin perform public.sidle_save_introduction((select outsider from pg_temp.product_probe),true); raise exception 'Private account saved'; exception when insufficient_privilege then null; end;
  first_receipt:=public.sidle_submit_feedback((select receipt from pg_temp.product_probe),'bug','A synthetic product bug');
  if first_receipt is distinct from public.sidle_submit_feedback((select receipt from pg_temp.product_probe),'bug','A synthetic product bug') then raise exception 'Feedback retry duplicated'; end if;
  begin perform public.sidle_submit_feedback((select receipt from pg_temp.product_probe),'bug','Different body on retry'); raise exception 'Retry conflict accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.sidle_feedback_queue(); raise exception 'Non-admin feedback read'; exception when insufficient_privilege then null; end;
  begin perform public.sidle_review_feedback((first_receipt->>'id')::uuid,'closed'); raise exception 'Non-admin feedback update'; exception when insufficient_privilege then null; end;
  begin perform public.sidle_submit_feedback(gen_random_uuid(),'bug','short'); raise exception 'Short feedback accepted'; exception when invalid_parameter_value then null; end;
  for i in 1..4 loop perform public.sidle_submit_feedback(gen_random_uuid(),'idea','Synthetic product idea '||i); end loop;
  begin perform public.sidle_submit_feedback(gen_random_uuid(),'idea','Over limit product idea'); raise exception 'Feedback rate limit bypassed'; exception when program_limit_exceeded then null; end;
end; $$;
reset role;

-- Make A's context discoverable, then check expiry and privacy re-evaluation.
update app_private.social_context set audience='discoverable',expires_at=now()-interval '1 minute' where user_id=(select a from product_probe);
set local role authenticated;
do $$ declare result jsonb; begin
  result:=public.sidle_people_context(array[(select a from pg_temp.product_probe)]);
  if jsonb_array_length(result)<>1 or result->0->'availability'<>'null'::jsonb or result->0->'expiresAt'<>'null'::jsonb then raise exception 'Expired availability exposed'; end if;
end; $$;
reset role;
update public.profiles set discoverable=false where user_id=(select a from product_probe);
set local role authenticated;
do $$ begin
  if public.sidle_saved_people()<>'[]'::jsonb or public.sidle_people_context(array[(select a from pg_temp.product_probe)])<>'[]'::jsonb then raise exception 'Privacy change bypassed'; end if;
end; $$;
reset role;
insert into public.connections(user_a,user_b) select least(a,b),greatest(a,b) from product_probe;
set local role authenticated;
do $$ begin
  if jsonb_array_length(public.sidle_saved_people())<>1 or jsonb_array_length(public.sidle_people_context(array[(select a from pg_temp.product_probe)]))<>1 then raise exception 'Connection audience failed'; end if;
end; $$;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) select a,b from product_probe;
set local role authenticated;
do $$ begin
  if public.sidle_saved_introductions()<>'[]'::jsonb or public.sidle_people_context(array[(select a from pg_temp.product_probe)])<>'[]'::jsonb then raise exception 'Blocked data exposed'; end if;
end; $$;
reset role;
delete from public.user_blocks where blocker_id=(select a from product_probe) and blocked_id=(select b from product_probe);
set local role authenticated;
do $$ begin
  if public.sidle_saved_introductions()<>'[]'::jsonb then raise exception 'Unblock silently restored save'; end if;
end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','session_id','product-admin')::text,true) from product_probe;
set local role authenticated;
do $$ declare queue jsonb; begin
  queue:=public.sidle_feedback_queue();
  if jsonb_array_length(queue)<5 then raise exception 'Admin queue missing submissions'; end if;
  if queue->0 ? 'user_id' then raise exception 'Queue unnecessarily exposes author identity'; end if;
  if not public.sidle_review_feedback((select id from jsonb_to_recordset(queue) as x(id uuid,body text) where body='A synthetic product bug'),'reviewed') then raise exception 'Admin review not persisted'; end if;
end; $$;
reset role;
update public.user_sessions set revoked_at=now() where user_id=(select b from product_probe);
select set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id','product-session')::text,true) from product_probe;
set local role authenticated;
do $$ begin
  begin perform public.sidle_saved_introductions(); raise exception 'Revoked read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.sidle_set_context(array['sport'],null,24,'discoverable'); raise exception 'Revoked write allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
update public.user_sessions set revoked_at=null where user_id=(select b from product_probe);
set local role authenticated;
select public.sidle_save_introduction((select a from pg_temp.product_probe),true);
select public.sidle_set_context(array['sport'],null,24,'connections');
reset role;
update public.users set status='deleted' where id in (select a from product_probe union select b from product_probe);
do $$ begin
  if exists(select 1 from app_private.social_context where user_id in (select a from product_probe union select b from product_probe))
    or exists(select 1 from app_private.saved_introductions where user_id=(select b from product_probe))
    or exists(select 1 from app_private.product_feedback where user_id=(select b from product_probe)) then raise exception 'Account anonymization retained product data'; end if;
end; $$;
set local role authenticated;
do $$ begin
  begin perform public.sidle_get_context(); raise exception 'Deleted account read allowed'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
select 'PASS: social context, expiry, saves, privacy, blocks, feedback retries/limits, admin roles, revoked/deleted sessions and erasure; fixtures rolled back' as result;
