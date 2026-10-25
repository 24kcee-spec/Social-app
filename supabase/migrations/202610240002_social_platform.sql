-- Additive social platform. Portable API migrations and existing data remain intact.
create table app_private.platform_settings (
 singleton boolean primary key default true check(singleton),
 advertising_enabled boolean not null default false,
 admin_mfa_required boolean not null default false,
 uploads_enabled boolean not null default true,
 media_review_required boolean not null default false,
 max_storage_bytes bigint not null default 268435456 check(max_storage_bytes between 1048576 and 1099511627776),
 per_user_storage_bytes bigint not null default 52428800 check(per_user_storage_bytes between 1048576 and 10737418240),
 updated_at timestamptz not null default now()
);
insert into app_private.platform_settings(singleton) values(true);
create table app_private.member_preferences (
 user_id uuid primary key references public.users(id) on delete cascade,
 connection_labels jsonb not null default '{}',
 muted_users uuid[] not null default '{}',
 archived_conversations uuid[] not null default '{}',
 read_receipts boolean not null default true,
 analytics_consent boolean not null default false,
 quiet_hours_start integer check(quiet_hours_start between 0 and 23),
 quiet_hours_end integer check(quiet_hours_end between 0 and 23),
 updated_at timestamptz not null default now()
);
create table app_private.profile_details (
 user_id uuid primary key references public.users(id) on delete cascade,
 handle text unique check(handle ~ '^[a-z0-9_]{3,24}$'),
 pronouns text not null default '' check(length(pronouns)<=40),
 campus text not null default '' check(length(campus)<=100),
 course text not null default '' check(length(course)<=100),
 year_text text not null default '' check(length(year_text)<=30),
 website text not null default '' check(length(website)<=500 and (website='' or website ~ '^https://')),
 audience text not null default 'connections' check(audience in ('public','connections','private')),
 updated_at timestamptz not null default now()
);
create table app_private.social_assets (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 client_id uuid not null,
 kind text not null check(kind in ('image','video','audio','voice')),
 path text not null unique,
 mime text not null,
 size_bytes bigint not null check(size_bytes between 1 and 20971520),
 duration_seconds integer check(duration_seconds between 0 and 600),
 rights text not null check(rights in ('original','permission','public_domain','cc0','cc_by')),
 attribution text not null default '' check(length(attribution)<=500),
 status text not null default 'uploading' check(status in ('uploading','ready','quarantined','deleted')),
 created_at timestamptz not null default now(),
 unique(user_id,client_id)
);
create index social_assets_owner_idx on app_private.social_assets(user_id,status,created_at);
create table app_private.social_posts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.users(id) on delete cascade,
 client_id uuid not null,
 kind text not null check(kind in ('post','reel','story','music')),
 body text not null default '' check(length(body)<=3000),
 title text not null default '' check(length(title)<=120),
 asset_id uuid references app_private.social_assets(id) on delete set null,
 audience text not null default 'public' check(audience in ('public','connections','private')),
 state text not null default 'published' check(state in ('published','hidden','deleted')),
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,client_id),
 check((kind='story')=(expires_at is not null))
);
create index social_posts_feed_idx on app_private.social_posts(state,kind,created_at desc,id desc);
create index social_posts_author_idx on app_private.social_posts(user_id,created_at desc);
create index social_posts_asset_idx on app_private.social_posts(asset_id);
create table app_private.social_follows (
 user_id uuid not null references public.users(id) on delete cascade,
 target_id uuid not null references public.users(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,target_id),check(user_id<>target_id)
);
create index social_follows_target_idx on app_private.social_follows(target_id);
create table app_private.post_reactions (
 post_id uuid not null references app_private.social_posts(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 reaction text not null check(reaction in ('like','love','celebrate','support')),
 created_at timestamptz not null default now(),primary key(post_id,user_id)
);
create index post_reactions_owner_idx on app_private.post_reactions(user_id);
create table app_private.post_bookmarks (
 user_id uuid not null references public.users(id) on delete cascade,
 post_id uuid not null references app_private.social_posts(id) on delete cascade,
 created_at timestamptz not null default now(),primary key(user_id,post_id)
);
create index post_bookmarks_post_idx on app_private.post_bookmarks(post_id);
create table app_private.post_comments (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references app_private.social_posts(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,client_id uuid not null,
 body text not null check(length(btrim(body)) between 1 and 1000),created_at timestamptz not null default now(),
 unique(user_id,client_id)
);
create index post_comments_post_idx on app_private.post_comments(post_id,created_at,id);
create table app_private.music_playlists (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 80),created_at timestamptz not null default now()
);
create index music_playlists_owner_idx on app_private.music_playlists(user_id);
create table app_private.playlist_tracks (
 playlist_id uuid not null references app_private.music_playlists(id) on delete cascade,
 post_id uuid not null references app_private.social_posts(id) on delete cascade,
 added_at timestamptz not null default now(),primary key(playlist_id,post_id)
);
create index playlist_tracks_post_idx on app_private.playlist_tracks(post_id);
create table app_private.activity_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 actor_id uuid references public.users(id) on delete cascade,kind text not null,target_id uuid,
 label text not null check(length(label)<=200),dedup_key text not null,seen_at timestamptz,
 created_at timestamptz not null default now(),unique(user_id,dedup_key)
);
create index activity_events_owner_idx on app_private.activity_events(user_id,created_at desc,id desc);
create index activity_events_actor_idx on app_private.activity_events(actor_id);
create table app_private.content_reports (
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.users(id) on delete cascade,
 post_id uuid not null references app_private.social_posts(id) on delete cascade,
 reason text not null check(reason in ('spam','harassment','copyright','inappropriate','other')),
 details text not null default '' check(length(details)<=1000),status text not null default 'pending' check(status in ('pending','resolved','dismissed')),
 reviewed_by uuid references public.users(id) on delete set null,reviewed_at timestamptz,
 created_at timestamptz not null default now(),unique(reporter_id,post_id)
);
create index content_reports_queue_idx on app_private.content_reports(status,created_at);
create index content_reports_post_idx on app_private.content_reports(post_id);
create index content_reports_reviewer_idx on app_private.content_reports(reviewed_by);
create table app_private.plan_invitations (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,
 sender_id uuid not null references public.users(id) on delete cascade,recipient_id uuid not null references public.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default now()+interval '3 days',created_at timestamptz not null default now(),
 unique(event_id,recipient_id),check(sender_id<>recipient_id)
);
create index plan_invitations_sender_idx on app_private.plan_invitations(sender_id);
create index plan_invitations_recipient_idx on app_private.plan_invitations(recipient_id,created_at);
create table app_private.location_shares (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),
 accuracy_m double precision check(accuracy_m between 0 and 100000),
 expires_at timestamptz not null,updated_at timestamptz not null default now(),created_at timestamptz not null default now()
);
create index location_shares_owner_idx on app_private.location_shares(user_id,expires_at);
create table app_private.location_recipients (
 share_id uuid not null references app_private.location_shares(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,primary key(share_id,user_id)
);
create index location_recipients_owner_idx on app_private.location_recipients(user_id);
create table app_private.call_rooms (
 id uuid primary key default gen_random_uuid(),caller_id uuid not null references public.users(id) on delete cascade,
 recipient_id uuid not null references public.users(id) on delete cascade,mode text not null check(mode in ('audio','video')),
 state text not null default 'ringing' check(state in ('ringing','accepted','declined','ended')),
 expires_at timestamptz not null default now()+interval '1 minute',created_at timestamptz not null default now(),
 check(caller_id<>recipient_id)
);
create index call_rooms_caller_idx on app_private.call_rooms(caller_id,created_at desc);
create index call_rooms_recipient_idx on app_private.call_rooms(recipient_id,created_at desc);
create table app_private.call_signals (
 id bigint generated always as identity primary key,call_id uuid not null references app_private.call_rooms(id) on delete cascade,
 sender_id uuid not null references public.users(id) on delete cascade,kind text not null check(kind in ('offer','answer','ice')),
 payload jsonb not null check(pg_column_size(payload)<=65536),created_at timestamptz not null default now()
);
create index call_signals_call_idx on app_private.call_signals(call_id,id);
create index call_signals_sender_idx on app_private.call_signals(sender_id);
create table app_private.product_daily_events (
 user_id uuid not null references public.users(id) on delete cascade,day date not null default current_date,
 event text not null check(event in ('app_open','discovery_open','message_sent','plan_open','plan_join','post_created','feedback_submitted')),
 count integer not null default 1 check(count between 1 and 1000),primary key(user_id,day,event)
);
alter table app_private.product_feedback add column reviewed_by uuid references public.users(id) on delete set null;
alter table app_private.product_feedback add column reviewed_at timestamptz;
create index product_feedback_reviewer_idx on app_private.product_feedback(reviewed_by);

create function app_private.platform_admin(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_roles where user_id=actor and role='admin') and(not(select admin_mfa_required from app_private.platform_settings where singleton) or coalesce(auth.jwt()->>'aal'='aal2',false));
$$;
revoke all on function app_private.platform_admin(uuid) from public,anon,authenticated;

create function app_private.platform_connected(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$
 select a<>b and exists(select 1 from public.connections c where c.user_a=least(a,b) and c.user_b=greatest(a,b))
 and exists(select 1 from public.users where id=a and status='active') and exists(select 1 from public.users where id=b and status='active')
 and not exists(select 1 from public.user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
create function app_private.platform_post_visible(actor uuid,post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from app_private.social_posts p join public.users u on u.id=p.user_id
 where p.id=post and p.state='published' and u.status='active' and (p.expires_at is null or p.expires_at>now())
 and not exists(select 1 from public.user_blocks b where (b.blocker_id=actor and b.blocked_id=p.user_id) or (b.blocker_id=p.user_id and b.blocked_id=actor))
 and (p.user_id=actor or p.audience='public' or (p.audience='connections' and app_private.platform_connected(actor,p.user_id))));
$$;
create function app_private.platform_notify(recipient uuid,actor uuid,kind text,target uuid,label text,dedup text) returns void language sql security definer set search_path='' as $$
 insert into app_private.activity_events(user_id,actor_id,kind,target_id,label,dedup_key)
 select recipient,actor,kind,target,left(label,200),dedup where recipient<>actor on conflict do nothing;
$$;
create function app_private.platform_post_json(actor uuid,post uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'userId',p.user_id,'displayName',pr.display_name,'kind',p.kind,'body',p.body,'title',p.title,
 'audience',p.audience,'createdAt',p.created_at,'expiresAt',p.expires_at,
 'asset',case when a.status='ready' then jsonb_build_object('id',a.id,'path',a.path,'kind',a.kind,'mime',a.mime,'sizeBytes',a.size_bytes,'durationSeconds',a.duration_seconds,'rights',a.rights,'attribution',a.attribution) end,
 'likeCount',(select count(*) from app_private.post_reactions where post_id=p.id),
 'commentCount',(select count(*) from app_private.post_comments where post_id=p.id),
 'myReaction',(select reaction from app_private.post_reactions where post_id=p.id and user_id=actor),
 'bookmarked',exists(select 1 from app_private.post_bookmarks where post_id=p.id and user_id=actor),
 'following',exists(select 1 from app_private.social_follows where user_id=actor and target_id=p.user_id))
 from app_private.social_posts p join public.profiles pr on pr.user_id=p.user_id left join app_private.social_assets a on a.id=p.asset_id
 where p.id=post and app_private.platform_post_visible(actor,p.id);
$$;

create function app_private.sidle_platform(action text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<platform_core>>
declare actor uuid:=app_private.product_actor(); item uuid; target uuid; result jsonb; row_data record;
 body text; kind text; audience text; cursor_id uuid; take integer; asset uuid; asset_path text; mime text; bytes bigint; duration integer;
 settings app_private.platform_settings; rec app_private.social_assets; post app_private.social_posts; share app_private.location_shares;
begin
 if input is null or jsonb_typeof(input)<>'object' or pg_column_size(input)>131072 then raise exception 'Invalid request' using errcode='22023'; end if;
 case action
 when 'preferences.get' then
  select jsonb_build_object('labels',connection_labels,'mutedUsers',muted_users,'archivedConversations',archived_conversations,'readReceipts',read_receipts,'analyticsConsent',analytics_consent,'quietHoursStart',quiet_hours_start,'quietHoursEnd',quiet_hours_end) into result from app_private.member_preferences where user_id=actor;
  return coalesce(result,'{"labels":{},"mutedUsers":[],"archivedConversations":[],"readReceipts":true,"analyticsConsent":false}'::jsonb);
 when 'preferences.set' then
  if input ? 'labels' and (jsonb_typeof(input->'labels')<>'object' or pg_column_size(input->'labels')>20000) then raise exception 'Invalid labels' using errcode='22023'; end if;
  if input ? 'labels' and exists(select 1 from jsonb_each_text(input->'labels') where value not in ('friend','classmate','study','sport','networking','other')) then raise exception 'Invalid label' using errcode='22023'; end if;
  if jsonb_array_length(coalesce(input->'mutedUsers','[]'))>500 or jsonb_array_length(coalesce(input->'archivedConversations','[]'))>500 then raise exception 'Too many preferences' using errcode='22023'; end if;
  insert into app_private.member_preferences(user_id) values(actor) on conflict do nothing;
  update app_private.member_preferences set connection_labels=coalesce(input->'labels',connection_labels),
   muted_users=case when input ? 'mutedUsers' then array(select value::uuid from jsonb_array_elements_text(input->'mutedUsers')) else muted_users end,
   archived_conversations=case when input ? 'archivedConversations' then array(select value::uuid from jsonb_array_elements_text(input->'archivedConversations')) else archived_conversations end,
   read_receipts=coalesce((input->>'readReceipts')::boolean,read_receipts),analytics_consent=coalesce((input->>'analyticsConsent')::boolean,analytics_consent),
   quiet_hours_start=case when input ? 'quietHoursStart' then (input->>'quietHoursStart')::integer else quiet_hours_start end,
   quiet_hours_end=case when input ? 'quietHoursEnd' then (input->>'quietHoursEnd')::integer else quiet_hours_end end,updated_at=now() where user_id=actor;
  return app_private.sidle_platform('preferences.get','{}');
 when 'profile.details.set' then
  if length(coalesce(input->>'handle',''))>0 and (input->>'handle' in ('admin','support','settings','sidle','api','help')) then raise exception 'Reserved handle' using errcode='22023'; end if;
  insert into app_private.profile_details(user_id,handle,pronouns,campus,course,year_text,website,audience)
  values(actor,nullif(lower(btrim(input->>'handle')),''),coalesce(input->>'pronouns',''),coalesce(input->>'campus',''),coalesce(input->>'course',''),coalesce(input->>'year',''),coalesce(input->>'website',''),coalesce(input->>'audience','connections'))
  on conflict(user_id) do update set handle=excluded.handle,pronouns=excluded.pronouns,campus=excluded.campus,course=excluded.course,year_text=excluded.year_text,website=excluded.website,audience=excluded.audience,updated_at=now();
  return app_private.sidle_platform('profile.details.get',jsonb_build_object('userId',actor));
 when 'profile.details.get' then
  target:=coalesce((input->>'userId')::uuid,actor);
  if target<>actor and not app_private.product_visible(actor,target) then raise exception 'Profile unavailable' using errcode='42501'; end if;
  select jsonb_build_object('userId',p.user_id,'displayName',p.display_name,'bio',p.bio,'handle',d.handle,
   'pronouns',case when target=actor or d.audience='public' or (d.audience='connections' and app_private.platform_connected(actor,target)) then d.pronouns end,
   'campus',case when target=actor or d.audience='public' or (d.audience='connections' and app_private.platform_connected(actor,target)) then d.campus end,
   'course',case when target=actor or d.audience='public' or (d.audience='connections' and app_private.platform_connected(actor,target)) then d.course end,
   'year',case when target=actor or d.audience='public' or (d.audience='connections' and app_private.platform_connected(actor,target)) then d.year_text end,
   'website',case when target=actor or d.audience='public' or (d.audience='connections' and app_private.platform_connected(actor,target)) then d.website end,
   'audience',case when target=actor then coalesce(d.audience,'connections') end,
   'posts',(select count(*) from app_private.social_posts where user_id=target and app_private.platform_post_visible(actor,id)),
   'followers',(select count(*) from app_private.social_follows where target_id=target),'following',(select count(*) from app_private.social_follows where user_id=target)) into result
  from public.profiles p left join app_private.profile_details d on d.user_id=p.user_id where p.user_id=target;
  return result;
 when 'media.reserve' then
  select * into settings from app_private.platform_settings where singleton;
  if not settings.uploads_enabled then raise exception 'Uploads paused' using errcode='54000'; end if;
  perform pg_advisory_xact_lock(hashtext('sidle-media-budget'));
  select * into rec from app_private.social_assets where user_id=actor and client_id=(input->>'clientId')::uuid;
  if rec.id is not null then return jsonb_build_object('id',rec.id,'path',rec.path,'bucket','sidle-social-media','status',rec.status); end if;
  kind:=input->>'kind';mime:=input->>'mime';bytes:=(input->>'sizeBytes')::bigint;duration:=(input->>'durationSeconds')::integer;
  if kind is null or mime is null or bytes is null or bytes<1 or bytes>20971520 or (input->>'clientId') is null
   or not ((kind='image' and mime in ('image/jpeg','image/png','image/webp') and bytes<=5242880)
    or (kind='video' and mime in ('video/mp4','video/webm') and duration between 1 and 180)
    or (kind='audio' and mime in ('audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav') and bytes<=10485760 and duration between 1 and 600)
    or (kind='voice' and mime in ('audio/ogg','audio/webm','audio/mp4') and bytes<=2097152 and duration between 1 and 120)) then raise exception 'Unsupported media or size/duration' using errcode='22023'; end if;
  if input->>'rights' not in ('original','permission','public_domain','cc0','cc_by') or input->>'rights' is null
   or (input->>'rights'='cc_by' and length(btrim(coalesce(input->>'attribution','')))<3) then raise exception 'Media rights confirmation required' using errcode='22023'; end if;
  if (select coalesce(sum(size_bytes),0) from app_private.social_assets where status<>'deleted')+bytes>settings.max_storage_bytes
   or (select coalesce(sum(size_bytes),0) from app_private.social_assets where user_id=actor and status<>'deleted')+bytes>settings.per_user_storage_bytes
   or (select count(*) from app_private.social_assets where user_id=actor and created_at>now()-interval '24 hours')>=50 then raise exception 'Media allowance reached' using errcode='54000'; end if;
  item:=gen_random_uuid();asset_path:=actor::text||'/'||item::text||case mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' when 'video/mp4' then '.mp4' when 'video/webm' then '.webm' when 'audio/mpeg' then '.mp3' when 'audio/mp4' then '.m4a' when 'audio/ogg' then '.ogg' when 'audio/wav' then '.wav' else '.webm' end;
  insert into app_private.social_assets(id,user_id,client_id,kind,path,mime,size_bytes,duration_seconds,rights,attribution) values(item,actor,(input->>'clientId')::uuid,kind,asset_path,mime,bytes,duration,input->>'rights',coalesce(input->>'attribution',''));
  return jsonb_build_object('id',item,'path',asset_path,'bucket','sidle-social-media','status','uploading');
 when 'media.finalize' then
  select * into rec from app_private.social_assets where id=(input->>'id')::uuid and user_id=actor for update;
  if rec.id is null or rec.status='deleted' then raise exception 'Asset unavailable' using errcode='42501'; end if;
  select metadata into row_data from storage.objects where bucket_id='sidle-social-media' and name=rec.path;
  if row_data is null or (row_data.metadata->>'size')::bigint is null or (row_data.metadata->>'size')::bigint<>rec.size_bytes or row_data.metadata->>'mimetype' is distinct from rec.mime then raise exception 'Uploaded object does not match reservation' using errcode='22023'; end if;
  update app_private.social_assets set status=case when status<>'uploading' then status when (select media_review_required from app_private.platform_settings where singleton) then 'quarantined' else 'ready' end where id=rec.id returning * into rec;
  return jsonb_build_object('id',rec.id,'path',rec.path,'kind',rec.kind,'mime',rec.mime,'status',rec.status,'sizeBytes',rec.size_bytes,'durationSeconds',rec.duration_seconds,'rights',rec.rights,'attribution',rec.attribution);
 when 'media.remove' then
  update app_private.social_assets set status='deleted' where id=(input->>'id')::uuid and user_id=actor;
  update app_private.social_posts set state='deleted',body='',title='' where asset_id=(input->>'id')::uuid and user_id=actor;
  return jsonb_build_object('removed',true);
 when 'posts.create' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7020));
  select * into post from app_private.social_posts where user_id=actor and client_id=(input->>'clientId')::uuid;
  if post.id is not null then return app_private.platform_post_json(actor,post.id); end if;
  kind:=coalesce(input->>'kind','post');audience:=coalesce(input->>'audience','public');body:=btrim(coalesce(input->>'body',''));asset:=(input->>'assetId')::uuid;
  if kind not in ('post','reel','story','music') or audience not in ('public','connections','private') or length(body)>3000
   or (length(body)=0 and asset is null) or input->>'clientId' is null or length(coalesce(input->>'title',''))>120 then raise exception 'Invalid post' using errcode='22023'; end if;
  if (select count(*) from app_private.social_posts where user_id=actor and created_at>now()-interval '24 hours')>=50 then raise exception 'Daily post limit reached' using errcode='54000'; end if;
  if asset is not null then select * into rec from app_private.social_assets where id=asset and user_id=actor and status='ready'; if rec.id is null then raise exception 'Media unavailable or awaiting review' using errcode='42501'; end if; end if;
  if (kind='reel' and (asset is null or rec.kind<>'video')) or (kind='music' and (asset is null or rec.kind<>'audio' or length(btrim(coalesce(input->>'title','')))<1)) or (kind='story' and asset is null) then raise exception 'This format requires matching media' using errcode='22023'; end if;
  insert into app_private.social_posts(user_id,client_id,kind,body,title,asset_id,audience,expires_at)
  values(actor,(input->>'clientId')::uuid,kind,body,coalesce(input->>'title',''),asset,audience,case when kind='story' then now()+interval '24 hours' end) returning id into item;
  return app_private.platform_post_json(actor,item);
 when 'posts.list' then
  kind:=coalesce(input->>'kind','all');take:=least(30,greatest(1,coalesce((input->>'limit')::integer,20)));cursor_id:=(input->>'cursor')::uuid;target:=(input->>'userId')::uuid;
  select coalesce(jsonb_agg(app_private.platform_post_json(actor,q.id) order by q.created_at desc,q.id desc),'[]') into result from (
   select p.id,p.created_at from app_private.social_posts p where app_private.platform_post_visible(actor,p.id)
   and (platform_core.kind='all' and p.kind<>'story' or p.kind=platform_core.kind)
   and (target is null or p.user_id=target)
   and not exists(select 1 from app_private.member_preferences pr where pr.user_id=actor and p.user_id=any(pr.muted_users))
   and (coalesce(input->>'scope','everyone')<>'following' or p.user_id=actor or exists(select 1 from app_private.social_follows where user_id=actor and target_id=p.user_id))
   and (coalesce(input->>'scope','everyone')<>'saved' or exists(select 1 from app_private.post_bookmarks where user_id=actor and post_id=p.id))
   and (cursor_id is null or (p.created_at,p.id)<(select created_at,id from app_private.social_posts where id=cursor_id))
   order by p.created_at desc,p.id desc limit take+1
  ) q;
  return jsonb_build_object('items',case when jsonb_array_length(result)>take then result-take else result end,'cursor',case when jsonb_array_length(result)>take then result->(take-1)->>'id' end);
 when 'posts.get' then return app_private.platform_post_json(actor,(input->>'id')::uuid);
 when 'posts.delete' then
  update app_private.social_posts set state='deleted',body='',title='',updated_at=now() where id=(input->>'id')::uuid and user_id=actor;
  return jsonb_build_object('deleted',found);
 when 'posts.react' then
  item:=(input->>'id')::uuid;if not app_private.platform_post_visible(actor,item) then raise exception 'Post unavailable' using errcode='42501'; end if;
  if input->>'reaction' is null then delete from app_private.post_reactions where post_id=item and user_id=actor;
  else insert into app_private.post_reactions(post_id,user_id,reaction) values(item,actor,input->>'reaction') on conflict(post_id,user_id) do update set reaction=excluded.reaction;
   perform app_private.platform_notify((select user_id from app_private.social_posts where id=item),actor,'reaction',item,'Someone reacted to your post','reaction:'||item||':'||actor);
  end if;return app_private.platform_post_json(actor,item);
 when 'posts.bookmark' then
  item:=(input->>'id')::uuid;if not app_private.platform_post_visible(actor,item) then raise exception 'Post unavailable' using errcode='42501'; end if;
  if coalesce((input->>'saved')::boolean,false) then insert into app_private.post_bookmarks(user_id,post_id) values(actor,item) on conflict do nothing;else delete from app_private.post_bookmarks where user_id=actor and post_id=item;end if;
  return jsonb_build_object('saved',coalesce((input->>'saved')::boolean,false));
 when 'posts.comments' then
  item:=(input->>'id')::uuid;if not app_private.platform_post_visible(actor,item) then raise exception 'Post unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select c.id,c.user_id as "userId",p.display_name as "displayName",c.body,c.created_at as "createdAt" from app_private.post_comments c join public.profiles p on p.user_id=c.user_id join public.users u on u.id=c.user_id where c.post_id=item and u.status='active' and not exists(select 1 from public.user_blocks where (blocker_id=actor and blocked_id=c.user_id) or (blocked_id=actor and blocker_id=c.user_id)) order by c.created_at,c.id limit 100) q;return result;
 when 'posts.comment' then
  item:=(input->>'id')::uuid;if not app_private.platform_post_visible(actor,item) then raise exception 'Post unavailable' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7021));
  if (select count(*) from app_private.post_comments where user_id=actor and created_at>now()-interval '1 minute')>=10 then raise exception 'Comment rate limit' using errcode='54000';end if;
  insert into app_private.post_comments(post_id,user_id,client_id,body) values(item,actor,(input->>'clientId')::uuid,btrim(input->>'body')) on conflict(user_id,client_id) do nothing;
  perform app_private.platform_notify((select user_id from app_private.social_posts where id=item),actor,'comment',item,'Someone commented on your post','comment:'||(input->>'clientId'));
  return app_private.sidle_platform('posts.comments',jsonb_build_object('id',item));
 when 'posts.comment.delete' then delete from app_private.post_comments where id=(input->>'id')::uuid and user_id=actor;return jsonb_build_object('deleted',found);
 when 'people.follow' then
  target:=(input->>'userId')::uuid;if not app_private.product_visible(actor,target) then raise exception 'Member unavailable' using errcode='42501';end if;
  if coalesce((input->>'following')::boolean,false) then
   if (select count(*) from app_private.social_follows where user_id=actor)>=1000 then raise exception 'Follow limit' using errcode='54000';end if;
   insert into app_private.social_follows(user_id,target_id) values(actor,target) on conflict do nothing;
   perform app_private.platform_notify(target,actor,'follow',actor,'Someone followed your public updates','follow:'||actor);
  else delete from app_private.social_follows where user_id=actor and target_id=target;end if;
  return jsonb_build_object('following',coalesce((input->>'following')::boolean,false));
 when 'music.playlists' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select p.id,p.name,coalesce((select jsonb_agg(app_private.platform_post_json(actor,t.post_id) order by t.added_at) from app_private.playlist_tracks t where t.playlist_id=p.id and app_private.platform_post_visible(actor,t.post_id)),'[]') as tracks from app_private.music_playlists p where p.user_id=actor order by p.created_at desc) q;return result;
 when 'music.playlist.create' then
  if (select count(*) from app_private.music_playlists where user_id=actor)>=20 then raise exception 'Playlist limit' using errcode='54000';end if;
  insert into app_private.music_playlists(user_id,name) values(actor,btrim(input->>'name')) returning id into item;return jsonb_build_object('id',item);
 when 'music.playlist.track' then
  item:=(input->>'playlistId')::uuid;target:=(input->>'postId')::uuid;
  if not exists(select 1 from app_private.music_playlists where id=item and user_id=actor) or not exists(select 1 from app_private.social_posts p where p.id=target and p.kind='music' and app_private.platform_post_visible(actor,p.id)) then raise exception 'Playlist or track unavailable' using errcode='42501';end if;
  if coalesce((input->>'added')::boolean,true) then
   if (select count(*) from app_private.playlist_tracks where playlist_id=item)>=200 then raise exception 'Playlist full' using errcode='54000';end if;
   insert into app_private.playlist_tracks(playlist_id,post_id) values(item,target) on conflict do nothing;
  else delete from app_private.playlist_tracks where playlist_id=item and post_id=target;end if;
  return jsonb_build_object('saved',true);
 when 'music.playlist.delete' then delete from app_private.music_playlists where id=(input->>'id')::uuid and user_id=actor;return jsonb_build_object('deleted',found);
 when 'activity.list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select e.id,e.kind,e.target_id as "targetId",e.label,e.seen_at as "seenAt",e.created_at as "createdAt" from app_private.activity_events e where e.user_id=actor and not exists(select 1 from public.user_blocks b where (b.blocker_id=actor and b.blocked_id=e.actor_id) or (b.blocked_id=actor and b.blocker_id=e.actor_id)) order by e.created_at desc,e.id desc limit 100) q;return result;
 when 'activity.read' then update app_private.activity_events set seen_at=now() where user_id=actor and (input->>'id' is null or id=(input->>'id')::uuid);return jsonb_build_object('read',true);
 when 'plans.invite' then
  item:=(input->>'eventId')::uuid;target:=(input->>'userId')::uuid;
  if not app_private.platform_connected(actor,target) or not exists(select 1 from public.events e where e.id=item and e.starts_at>now() and (e.host_id=actor or exists(select 1 from public.event_rsvps where event_id=e.id and user_id=actor and status='going'))) then raise exception 'Plan invitation unavailable' using errcode='42501';end if;
  insert into app_private.plan_invitations(event_id,sender_id,recipient_id) values(item,actor,target) on conflict(event_id,recipient_id) do nothing returning id into asset;
  perform app_private.platform_notify(target,actor,'plan_invitation',item,'You were invited to a Plan','plan:'||item||':'||target);return jsonb_build_object('invited',true);
 when 'plans.invitations' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select i.id,i.event_id as "eventId",i.status,i.expires_at as "expiresAt",e.title,e.starts_at as "startsAt",e.general_area as "generalArea",p.display_name as "senderName" from app_private.plan_invitations i join public.events e on e.id=i.event_id join public.profiles p on p.user_id=i.sender_id where i.recipient_id=actor and i.expires_at>now() and app_private.platform_connected(actor,i.sender_id) order by i.created_at desc limit 100) q;return result;
 when 'plans.invitation.respond' then
  if input->>'status' not in ('accepted','declined') then raise exception 'Invalid response' using errcode='22023';end if;
  update app_private.plan_invitations set status=input->>'status' where id=(input->>'id')::uuid and recipient_id=actor and expires_at>now() and app_private.platform_connected(actor,sender_id);return jsonb_build_object('updated',found);
 when 'location.start' then
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7022));
  if jsonb_array_length(coalesce(input->'recipients','[]')) not between 1 and 20 or coalesce((input->>'minutes')::integer,0) not in (15,30,60) then raise exception 'Choose recipients and a bounded duration' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(input->'recipients') x where not app_private.platform_connected(actor,x.value::uuid)) then raise exception 'Only current connections may receive location' using errcode='42501';end if;
  delete from app_private.location_shares where user_id=actor;
  insert into app_private.location_shares(user_id,latitude,longitude,accuracy_m,expires_at) values(actor,(input->>'latitude')::double precision,(input->>'longitude')::double precision,(input->>'accuracy')::double precision,now()+make_interval(mins=>(input->>'minutes')::integer)) returning * into share;
  insert into app_private.location_recipients(share_id,user_id) select distinct share.id,value::uuid from jsonb_array_elements_text(input->'recipients');
  return jsonb_build_object('id',share.id,'expiresAt',share.expires_at);
 when 'location.update' then
  update app_private.location_shares set latitude=(input->>'latitude')::double precision,longitude=(input->>'longitude')::double precision,accuracy_m=(input->>'accuracy')::double precision,updated_at=now() where id=(input->>'id')::uuid and user_id=actor and expires_at>now() and updated_at<now()-interval '5 seconds';return jsonb_build_object('updated',found);
 when 'location.stop' then delete from app_private.location_shares where user_id=actor;return jsonb_build_object('stopped',true);
 when 'location.list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select s.id,s.user_id as "userId",p.display_name as "displayName",s.latitude,s.longitude,s.accuracy_m as accuracy,s.expires_at as "expiresAt",s.updated_at as "updatedAt" from app_private.location_shares s join public.profiles p on p.user_id=s.user_id where s.expires_at>now() and (s.user_id=actor or exists(select 1 from app_private.location_recipients r where r.share_id=s.id and r.user_id=actor and app_private.platform_connected(actor,s.user_id)))) q;return result;
 when 'calls.start' then
  target:=(input->>'userId')::uuid;if not app_private.platform_connected(actor,target) then raise exception 'Calling requires a current connection' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7023));
  if exists(select 1 from app_private.call_rooms where state in ('ringing','accepted') and expires_at>now() and (caller_id=actor or recipient_id=actor)) or (select count(*) from app_private.call_rooms where caller_id=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Call already active or limit reached' using errcode='54000';end if;
  insert into app_private.call_rooms(caller_id,recipient_id,mode) values(actor,target,input->>'mode') returning id into item;
  perform app_private.platform_notify(target,actor,'call',item,'Incoming call','call:'||item);return jsonb_build_object('id',item);
 when 'calls.list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select c.id,c.caller_id as "callerId",c.recipient_id as "recipientId",c.mode,c.state,c.expires_at as "expiresAt",c.created_at as "createdAt",p.display_name as "otherName" from app_private.call_rooms c join public.profiles p on p.user_id=case when c.caller_id=actor then c.recipient_id else c.caller_id end where (c.caller_id=actor or c.recipient_id=actor) and c.expires_at>now() and app_private.platform_connected(c.caller_id,c.recipient_id) order by c.created_at desc limit 30) q;return result;
 when 'calls.state' then
  item:=(input->>'id')::uuid;
  if input->>'state' not in ('accepted','declined','ended') then raise exception 'Invalid call state' using errcode='22023';end if;
  update app_private.call_rooms set state=input->>'state',expires_at=case when input->>'state'='accepted' then now()+interval '2 hours' else expires_at end where id=item and state in ('ringing','accepted') and expires_at>now() and app_private.platform_connected(caller_id,recipient_id) and (input->>'state'='ended' and actor in (caller_id,recipient_id) or actor=recipient_id and input->>'state' in ('accepted','declined') and state='ringing');return jsonb_build_object('updated',found);
 when 'calls.signal' then
  item:=(input->>'id')::uuid;
  if not exists(select 1 from app_private.call_rooms where id=item and actor in (caller_id,recipient_id) and state in ('ringing','accepted') and expires_at>now() and app_private.platform_connected(caller_id,recipient_id)) then raise exception 'Call unavailable' using errcode='42501';end if;
  if (select count(*) from app_private.call_signals where call_id=item and sender_id=actor)>=500 then raise exception 'Signal limit' using errcode='54000';end if;
  insert into app_private.call_signals(call_id,sender_id,kind,payload) values(item,actor,input->>'kind',input->'payload');return jsonb_build_object('sent',true);
 when 'calls.signals' then
  item:=(input->>'id')::uuid;
  if not exists(select 1 from app_private.call_rooms where id=item and actor in (caller_id,recipient_id) and state in ('ringing','accepted') and expires_at>now() and app_private.platform_connected(caller_id,recipient_id)) then raise exception 'Call unavailable' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select s.id,s.kind,s.payload from app_private.call_signals s where s.call_id=item and s.sender_id<>actor and s.id>coalesce((input->>'after')::bigint,0) order by s.id limit 100) q;return result;
 when 'search' then
  body:=left(btrim(coalesce(input->>'query','')),100);if length(body)<2 then return '{"people":[],"groups":[],"plans":[]}'::jsonb;end if;
  return jsonb_build_object('people',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select p.user_id as "userId",p.display_name as name,p.bio from public.profiles p where app_private.product_visible(actor,p.user_id) and position(lower(body) in lower(p.display_name||' '||p.bio))>0 limit 20) q),
   'groups',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select g.id,g.name,g.description from public.groups g join public.users u on u.id=g.owner_id where u.status='active' and not exists(select 1 from public.user_blocks where (blocker_id=actor and blocked_id=g.owner_id) or (blocked_id=actor and blocker_id=g.owner_id)) and position(lower(body) in lower(g.name||' '||g.description))>0 limit 20) q),
   'plans',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select e.id,e.title as name,e.starts_at as "startsAt",e.general_area as "generalArea" from public.events e join public.users u on u.id=e.host_id where e.starts_at>now() and u.status='active' and not exists(select 1 from public.user_blocks where (blocker_id=actor and blocked_id=e.host_id) or (blocked_id=actor and blocker_id=e.host_id)) and position(lower(body) in lower(e.title||' '||e.description))>0 order by e.starts_at limit 20) q));
 when 'reports.create' then
  item:=(input->>'postId')::uuid;if not app_private.platform_post_visible(actor,item) then raise exception 'Post unavailable' using errcode='42501';end if;
  if (select count(*) from app_private.content_reports where reporter_id=actor and created_at>now()-interval '1 hour')>=20 then raise exception 'Report rate limit' using errcode='54000';end if;
  insert into app_private.content_reports(reporter_id,post_id,reason,details) values(actor,item,input->>'reason',coalesce(input->>'details','')) on conflict(reporter_id,post_id) do nothing;return jsonb_build_object('reported',true);
 when 'admin.reports' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select r.id,r.post_id as "postId",r.reason,r.details,r.status,r.created_at as "createdAt",p.body,p.title,p.kind from app_private.content_reports r join app_private.social_posts p on p.id=r.post_id order by r.created_at desc limit 100) q;return result;
 when 'admin.report.resolve' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  if input->>'status' not in ('resolved','dismissed') then raise exception 'Invalid status' using errcode='22023';end if;
  update app_private.content_reports set status=input->>'status',reviewed_by=actor,reviewed_at=now() where id=(input->>'id')::uuid returning post_id into item;
  if input->>'status'='resolved' then update app_private.social_posts set state='hidden',updated_at=now() where id=item;end if;return jsonb_build_object('updated',found);
 when 'admin.assets' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select a.id,a.path,a.kind,a.mime,a.size_bytes as "sizeBytes",a.user_id as "userId",a.rights,a.attribution,a.status,a.created_at as "createdAt" from app_private.social_assets a where a.status='quarantined' order by a.created_at limit 100) q;return result;
 when 'admin.asset.review' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  if input->>'status' not in ('ready','quarantined','deleted') then raise exception 'Invalid status' using errcode='22023';end if;
  update app_private.social_assets set status=input->>'status' where id=(input->>'id')::uuid and status in('ready','quarantined');return jsonb_build_object('updated',found);
 when 'usage' then
  select * into settings from app_private.platform_settings where singleton;
  return jsonb_build_object('uploadsEnabled',settings.uploads_enabled,'mediaReviewRequired',settings.media_review_required,'usedBytes',(select coalesce(sum(size_bytes),0) from app_private.social_assets where user_id=actor and status<>'deleted'),'limitBytes',settings.per_user_storage_bytes,'maxFileBytes',20971520);
 when 'admin.usage' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  select * into settings from app_private.platform_settings where singleton;
  return jsonb_build_object('advertisingEnabled',settings.advertising_enabled,'adminMfaRequired',settings.admin_mfa_required,'uploadsEnabled',settings.uploads_enabled,'mediaReviewRequired',settings.media_review_required,'maxStorageBytes',settings.max_storage_bytes,'perUserStorageBytes',settings.per_user_storage_bytes,'usedBytes',(select coalesce(sum(size_bytes),0) from app_private.social_assets where status<>'deleted'),'databaseBytes',pg_database_size(current_database()),'posts',(select count(*) from app_private.social_posts where state='published'),'reports',(select count(*) from app_private.content_reports where status='pending'),'accounts',(select count(*) from public.users where status='active'));
 when 'admin.settings' then
  if coalesce((input->>'adminMfaRequired')::boolean,false) and auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Verify an authenticator before requiring MFA' using errcode='42501';end if;
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  update app_private.platform_settings set advertising_enabled=coalesce((input->>'advertisingEnabled')::boolean,advertising_enabled),admin_mfa_required=coalesce((input->>'adminMfaRequired')::boolean,admin_mfa_required),uploads_enabled=coalesce((input->>'uploadsEnabled')::boolean,uploads_enabled),media_review_required=coalesce((input->>'mediaReviewRequired')::boolean,media_review_required),max_storage_bytes=coalesce((input->>'maxStorageBytes')::bigint,max_storage_bytes),per_user_storage_bytes=coalesce((input->>'perUserStorageBytes')::bigint,per_user_storage_bytes),updated_at=now() where singleton;return app_private.sidle_platform('admin.usage','{}');
 when 'telemetry' then
  if coalesce((select analytics_consent from app_private.member_preferences where user_id=actor),false) then
   insert into app_private.product_daily_events(user_id,event) values(actor,input->>'event') on conflict(user_id,day,event) do update set count=least(1000,app_private.product_daily_events.count+1);
  end if;return jsonb_build_object('recorded',true);
 when 'admin.analytics' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select day,event,sum(count) as count from app_private.product_daily_events where day>=current_date-30 group by day,event order by day desc,event) q;return result;
 when 'account.export' then
  return jsonb_build_object('exportedAt',now(),'account',(select jsonb_build_object('id',id,'email',email,'phone',phone,'createdAt',created_at) from public.users where id=actor),
   'profile',(select to_jsonb(p) from public.profiles p where user_id=actor),'details',app_private.sidle_platform('profile.details.get',jsonb_build_object('userId',actor)),
   'preferences',app_private.sidle_platform('preferences.get','{}'),'socialContext',app_private.sidle_get_context(),
   'posts',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from app_private.social_posts p where user_id=actor),
   'comments',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from app_private.post_comments c where user_id=actor),
   'feedback',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'body',f.body,'category',f.category,'status',f.status,'createdAt',f.created_at)),'[]') from app_private.product_feedback f where f.user_id=actor),
   'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'body',m.body,'createdAt',m.created_at)),'[]') from public.messages m where m.sender_id=actor),
   'note','Includes your own records; other members messages and privileged moderation records are excluded. Media files are stored separately.');
 else raise exception 'Unknown platform action' using errcode='22023';
 end case;
end; $$;

create function app_private.platform_media_read(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.has_active_app_session() and exists(select 1 from app_private.social_assets a where a.path=object_name and
  (a.user_id=auth.uid() or a.status='quarantined' and exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
  or a.status='ready' and exists(select 1 from app_private.social_posts p where p.asset_id=a.id and app_private.platform_post_visible(auth.uid(),p.id))));
$$;
create function app_private.platform_media_write(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.has_active_app_session() and exists(select 1 from app_private.social_assets a where a.path=object_name and a.user_id=auth.uid() and a.status='uploading' and a.created_at>now()-interval '1 hour');
$$;
create function public.sidle_social_media_read(object_name text) returns boolean language sql security invoker set search_path='' as $$select app_private.platform_media_read(object_name)$$;
create function public.sidle_social_media_write(object_name text) returns boolean language sql security invoker set search_path='' as $$select app_private.platform_media_write(object_name)$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('sidle-social-media','sidle-social-media',false,20971520,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/ogg','audio/webm','audio/wav']) on conflict(id) do nothing;
create policy sidle_social_media_insert on storage.objects for insert to authenticated with check(bucket_id='sidle-social-media' and public.sidle_social_media_write(name));
create policy sidle_social_media_select on storage.objects for select to authenticated using(bucket_id='sidle-social-media' and public.sidle_social_media_read(name));
create policy sidle_social_media_delete on storage.objects for delete to authenticated using(bucket_id='sidle-social-media' and (select public.has_active_app_session()) and (storage.foldername(name))[1]=(select auth.uid())::text);

create function app_private.platform_clear_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='deleted' and old.status is distinct from new.status then
  update app_private.social_posts set state='deleted',body='',title='' where user_id=new.id;
  update app_private.social_assets set status='deleted',attribution='' where user_id=new.id;
  delete from app_private.member_preferences where user_id=new.id;delete from app_private.profile_details where user_id=new.id;
  delete from app_private.post_comments where user_id=new.id;delete from app_private.post_reactions where user_id=new.id;
  delete from app_private.post_bookmarks where user_id=new.id;delete from app_private.social_follows where user_id=new.id or target_id=new.id;
  delete from app_private.location_shares where user_id=new.id;delete from app_private.location_recipients where user_id=new.id;
  delete from app_private.music_playlists where user_id=new.id;delete from app_private.plan_invitations where sender_id=new.id or recipient_id=new.id;
  delete from app_private.activity_events where user_id=new.id or actor_id=new.id;delete from app_private.product_daily_events where user_id=new.id;
  update app_private.call_rooms set state='ended' where caller_id=new.id or recipient_id=new.id;
  delete from app_private.call_signals where sender_id=new.id;
 end if;return new;
end; $$;
create trigger sidle_platform_clear_account after update of status on public.users for each row execute function app_private.platform_clear_account();
create function app_private.platform_block_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from app_private.social_follows where(user_id=new.blocker_id and target_id=new.blocked_id)or(user_id=new.blocked_id and target_id=new.blocker_id);
 delete from app_private.location_recipients r using app_private.location_shares s where r.share_id=s.id and ((s.user_id=new.blocker_id and r.user_id=new.blocked_id)or(s.user_id=new.blocked_id and r.user_id=new.blocker_id));
 update app_private.call_rooms set state='ended' where(caller_id=new.blocker_id and recipient_id=new.blocked_id)or(caller_id=new.blocked_id and recipient_id=new.blocker_id);
 return new;
end; $$;
create trigger sidle_platform_block_cleanup after insert on public.user_blocks for each row execute function app_private.platform_block_cleanup();
create function public.sidle_platform(action text,input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_platform(action,input)$$;

do $$ declare t text; f record; begin
 foreach t in array array['platform_settings','member_preferences','profile_details','social_assets','social_posts','social_follows','post_reactions','post_bookmarks','post_comments','music_playlists','playlist_tracks','activity_events','content_reports','plan_invitations','location_shares','location_recipients','call_rooms','call_signals','product_daily_events'] loop
  execute format('alter table app_private.%I enable row level security',t);execute format('revoke all on app_private.%I from public,anon,authenticated',t);
 end loop;
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and (p.proname like 'platform_%' or p.proname='sidle_platform') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';end loop;
end; $$;
revoke all on function public.sidle_platform(text,jsonb),public.sidle_social_media_read(text),public.sidle_social_media_write(text) from public,anon;
grant execute on function public.sidle_platform(text,jsonb),public.sidle_social_media_read(text),public.sidle_social_media_write(text),app_private.sidle_platform(text,jsonb),app_private.platform_media_read(text),app_private.platform_media_write(text) to authenticated;
notify pgrst,'reload schema';
