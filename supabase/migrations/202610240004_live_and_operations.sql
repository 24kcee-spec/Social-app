-- Optional self-hosted LiveKit rooms, short-lived grants and bounded operational cleanup.
create table app_private.live_broadcasts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 2 and 100),audience text not null check(audience in('public','connections')),
 state text not null default 'live' check(state in('live','ended')),created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 hours'
);
create index live_broadcasts_list_idx on app_private.live_broadcasts(state,expires_at);
create index live_broadcasts_owner_idx on app_private.live_broadcasts(user_id);
alter table app_private.live_broadcasts enable row level security;
revoke all on app_private.live_broadcasts from public,anon,authenticated;
alter function app_private.sidle_platform(text,jsonb) rename to sidle_platform_commerce;
create function app_private.sidle_platform(action text,input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.product_actor();item uuid;r app_private.live_broadcasts;result jsonb;
begin
 if input is null or jsonb_typeof(input)<>'object' or pg_column_size(input)>131072 then raise exception 'Invalid request' using errcode='22023';end if;
 if action like 'live.%' then
  if action='live.create' then
   perform pg_advisory_xact_lock(hashtextextended(actor::text,7041));
   if exists(select 1 from app_private.live_broadcasts where user_id=actor and state='live' and expires_at>now()) or (select count(*) from app_private.live_broadcasts where user_id=actor and created_at>now()-interval '24 hours')>=5 then raise exception 'Live limit' using errcode='54000';end if;
   insert into app_private.live_broadcasts(user_id,title,audience) values(actor,input->>'title',input->>'audience') returning * into r;
   return jsonb_build_object('id',r.id,'owner',true);
  elsif action='live.end' then
   update app_private.live_broadcasts set state='ended' where id=(input->>'id')::uuid and user_id=actor;return jsonb_build_object('ended',found);
  elsif action='live.list' then
   select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select b.id,b.user_id as "userId",p.display_name as "displayName",b.title,b.audience,b.expires_at as "expiresAt" from app_private.live_broadcasts b join public.profiles p on p.user_id=b.user_id join public.users u on u.id=b.user_id
    where b.state='live' and b.expires_at>now() and u.status='active' and not exists(select 1 from public.user_blocks where(blocker_id=actor and blocked_id=b.user_id)or(blocker_id=b.user_id and blocked_id=actor)) and(b.user_id=actor or b.audience='public' and app_private.product_visible(actor,b.user_id) or b.audience='connections' and app_private.platform_connected(actor,b.user_id)) order by b.created_at desc limit 30)q;return result;
  elsif action='live.join' then
   select * into r from app_private.live_broadcasts where id=(input->>'id')::uuid and state='live' and expires_at>now();
   if r.id is null or not exists(select 1 from jsonb_array_elements(app_private.sidle_platform('live.list','{}')) v where v->>'id'=r.id::text) then raise exception 'Live room unavailable' using errcode='42501';end if;
   return jsonb_build_object('id',r.id,'owner',r.user_id=actor,'expiresAt',r.expires_at);
  end if;
  raise exception 'Unknown live action' using errcode='22023';
 end if;
 if action='account.export' then
  return app_private.sidle_platform_commerce(action,input)||jsonb_build_object(
   'media',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from app_private.social_assets a where user_id=actor),
   'follows',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from app_private.social_follows f where user_id=actor),
   'bookmarks',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from app_private.post_bookmarks b where user_id=actor),
   'playlists',app_private.sidle_platform_commerce('music.playlists','{}'),
   'activity',app_private.sidle_platform_commerce('activity.list','{}'),
   'invitations',app_private.sidle_platform_commerce('plans.invitations','{}'),
   'billing',app_private.sidle_platform_commerce('billing.summary','{}'),
   'campaigns',app_private.sidle_platform_commerce('ads.mine','{}'),
   'broadcasts',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from app_private.live_broadcasts b where user_id=actor),
   'ownLocation',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from app_private.location_shares l where user_id=actor),
   'callHistory',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from app_private.call_rooms c where caller_id=actor or recipient_id=actor));
 end if;
 return app_private.sidle_platform_commerce(action,input);
end; $$;
revoke all on function app_private.sidle_platform_commerce(text,jsonb),app_private.sidle_platform(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.sidle_platform(text,jsonb) to authenticated;
-- Expired coordinates/signals are never used for history or analytics.
create function public.sidle_platform_retention() returns jsonb language plpgsql security definer set search_path='' as $$
declare locations integer;signals integer;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501';end if;
 delete from app_private.location_shares where expires_at<now();get diagnostics locations=row_count;
 delete from app_private.call_signals where call_id in(select id from app_private.call_rooms where expires_at<now() or state in('ended','declined'));get diagnostics signals=row_count;
 update app_private.call_rooms set state='ended' where expires_at<now() and state in('ringing','accepted');
 update app_private.live_broadcasts set state='ended' where expires_at<now() or user_id in(select id from public.users where status<>'active');
 delete from app_private.product_daily_events where day<current_date-90;
 delete from app_private.activity_events where created_at<now()-interval '90 days';
 return jsonb_build_object('locations',locations,'signals',signals);
end; $$;
alter function public.sidle_platform_retention() set schema app_private;
create function public.sidle_platform_retention() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_platform_retention()$$;
revoke all on function public.sidle_platform_retention(),app_private.sidle_platform_retention() from public,anon,authenticated;
grant execute on function public.sidle_platform_retention(),app_private.sidle_platform_retention() to service_role;
notify pgrst,'reload schema';
-- Claim only abandoned reservations, explicit removals and expired story-only assets.
-- Originals attached to posts, messages or campaigns are retained.
create function public.sidle_media_cleanup_batch() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501';end if;
 update app_private.social_assets a set status='deleted' where
  (a.status='uploading' and a.created_at<now()-interval '2 days') or
  (a.status in('ready','quarantined') and exists(select 1 from app_private.social_posts p where p.asset_id=a.id and p.kind='story' and p.expires_at<now()-interval '24 hours')
   and not exists(select 1 from app_private.social_posts p where p.asset_id=a.id and(p.kind<>'story' or p.expires_at>now()-interval '24 hours'))
   and not exists(select 1 from app_private.message_details m where m.asset_id=a.id) and not exists(select 1 from app_private.ad_campaigns c where c.asset_id=a.id));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'path',a.path)),'[]') into result from(select s.id,s.path from app_private.social_assets s where s.status='deleted' and exists(select 1 from storage.objects o where o.bucket_id='sidle-social-media' and o.name=s.path) order by s.created_at limit 20)a;
 return result;
end; $$;
alter function public.sidle_media_cleanup_batch() set schema app_private;
create function public.sidle_media_cleanup_batch() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_media_cleanup_batch()$$;
revoke all on function public.sidle_media_cleanup_batch(),app_private.sidle_media_cleanup_batch() from public,anon,authenticated;
grant execute on function public.sidle_media_cleanup_batch(),app_private.sidle_media_cleanup_batch() to service_role;
notify pgrst,'reload schema';
-- Shared push eligibility uses UTC quiet hours; inbox activity remains readable.
create function app_private.sidle_notification_allowed(recipient uuid,sender uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users where id=recipient and status='active')
 and not exists(select 1 from public.user_blocks where(blocker_id=recipient and blocked_id=sender)or(blocker_id=sender and blocked_id=recipient))
 and not exists(select 1 from app_private.member_preferences p where p.user_id=recipient and(sender=any(p.muted_users)
  or(p.quiet_hours_start is not null and p.quiet_hours_end is not null and case when p.quiet_hours_start<p.quiet_hours_end then extract(hour from now() at time zone 'UTC')>=p.quiet_hours_start and extract(hour from now() at time zone 'UTC')<p.quiet_hours_end else extract(hour from now() at time zone 'UTC')>=p.quiet_hours_start or extract(hour from now() at time zone 'UTC')<p.quiet_hours_end end)));
$$;
revoke all on function app_private.sidle_notification_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function app_private.sidle_notification_allowed(uuid,uuid) to service_role;
notify pgrst,'reload schema';
-- Legacy API writes also produce the same private activity inbox.
create function app_private.platform_message_activity() returns trigger language plpgsql security definer set search_path='' as $$declare recipient uuid;begin
 select case when direct_a=new.sender_id then direct_b else direct_a end into recipient from public.conversations where id=new.conversation_id;
 if recipient is not null then perform app_private.platform_notify(recipient,new.sender_id,'message',new.conversation_id,'New message','message:'||new.id);end if;return new;
end;$$;
create trigger sidle_message_activity after insert on public.messages for each row execute function app_private.platform_message_activity();
create function app_private.platform_connection_activity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then perform app_private.platform_notify(new.recipient_id,new.sender_id,'connection_request',new.sender_id,'New connection request','request:'||new.id);
 elsif new.status='accepted' and old.status is distinct from new.status then perform app_private.platform_notify(new.sender_id,new.recipient_id,'connection',new.recipient_id,'Connection accepted','accepted:'||new.id);end if;return new;
end;$$;
create trigger sidle_connection_activity after insert or update of status on public.connection_requests for each row execute function app_private.platform_connection_activity();
revoke all on function app_private.platform_message_activity(),app_private.platform_connection_activity() from public,anon,authenticated;
-- LiveKit operators periodically enforce membership/expiry and record a heartbeat.
alter table app_private.platform_settings add column live_guard_at timestamptz;
create function public.sidle_live_access(room_id uuid,member_id uuid default null,session_id text default null,heartbeat boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare r app_private.live_broadcasts;allowed boolean:=false;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501';end if;
 if heartbeat then update app_private.platform_settings set live_guard_at=now() where singleton;return '{"updated":true}'::jsonb;end if;
 select b.* into r from app_private.live_broadcasts b join public.users u on u.id=b.user_id where b.id=room_id and b.state='live' and b.expires_at>now() and u.status='active';
 if r.id is null then return '{"active":false,"allowed":false}'::jsonb;end if;
 if member_id is not null then
  allowed:=exists(select 1 from public.users where id=member_id and status='active') and exists(select 1 from public.user_sessions s where s.user_id=member_id and s.auth_session_id=session_id and s.revoked_at is null)
   and not exists(select 1 from public.user_blocks where(blocker_id=member_id and blocked_id=r.user_id)or(blocker_id=r.user_id and blocked_id=member_id))
   and(member_id=r.user_id or r.audience='public' and app_private.product_visible(member_id,r.user_id) or r.audience='connections' and app_private.platform_connected(member_id,r.user_id));
 end if;
 return jsonb_build_object('active',true,'allowed',allowed,'owner',r.user_id=member_id,'guardReady',coalesce((select live_guard_at>now()-interval '90 seconds' from app_private.platform_settings where singleton),false));
end;$$;
alter function public.sidle_live_access(uuid,uuid,text,boolean) set schema app_private;
create function public.sidle_live_access(room_id uuid,member_id uuid default null,session_id text default null,heartbeat boolean default false) returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_live_access(room_id,member_id,session_id,heartbeat)$$;
revoke all on function public.sidle_live_access(uuid,uuid,text,boolean),app_private.sidle_live_access(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.sidle_live_access(uuid,uuid,text,boolean),app_private.sidle_live_access(uuid,uuid,text,boolean) to service_role;
notify pgrst,'reload schema';
create function app_private.platform_product_counter() returns trigger language plpgsql security definer set search_path='' as $$declare owner uuid;event_name text;begin
 if TG_TABLE_NAME='messages' then owner:=new.sender_id;event_name:='message_sent';elsif TG_TABLE_NAME='social_posts' then owner:=new.user_id;event_name:='post_created';else owner:=new.user_id;event_name:='plan_join';if new.status<>'going' then return new;end if;end if;
 if coalesce((select analytics_consent from app_private.member_preferences where user_id=owner),false) then insert into app_private.product_daily_events(user_id,event) values(owner,event_name) on conflict(user_id,day,event) do update set count=least(1000,app_private.product_daily_events.count+1);end if;return new;
end;$$;
create trigger sidle_post_counter after insert on app_private.social_posts for each row execute function app_private.platform_product_counter();
create trigger sidle_message_counter after insert on public.messages for each row execute function app_private.platform_product_counter();
create trigger sidle_plan_counter after insert or update of status on public.event_rsvps for each row execute function app_private.platform_product_counter();
revoke all on function app_private.platform_product_counter() from public,anon,authenticated;
notify pgrst,'reload schema';
-- A restrictive policy protects watermark reads from both PostgREST and Realtime.
create function app_private.sidle_receipts_enabled(member uuid) returns boolean language sql stable security definer set search_path='' as $$select coalesce((select read_receipts from app_private.member_preferences where user_id=member),true)$$;
create function app_private.sidle_receipt_visible(member uuid) returns boolean language sql stable security definer set search_path='' as $$select app_private.has_active_app_session() and(member=auth.uid() or app_private.sidle_receipts_enabled(member))$$;
create function public.sidle_receipt_visible(member uuid) returns boolean language sql stable security invoker set search_path='' as $$select app_private.sidle_receipt_visible(member)$$;
revoke all on function app_private.sidle_receipts_enabled(uuid),app_private.sidle_receipt_visible(uuid),public.sidle_receipt_visible(uuid) from public,anon,authenticated;
grant execute on function app_private.sidle_receipt_visible(uuid),public.sidle_receipt_visible(uuid) to authenticated;
create policy sidle_read_receipt_preferences on public.conversation_members as restrictive for select to authenticated using(public.sidle_receipt_visible(user_id));
notify pgrst,'reload schema';
