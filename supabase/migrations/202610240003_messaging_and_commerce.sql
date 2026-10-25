-- Rich messages retain the original message IDs, pagination and Realtime stream.
create table app_private.message_details (
 message_id uuid primary key references public.messages(id) on delete cascade,
 reply_to uuid references public.messages(id) on delete set null,
 asset_id uuid references app_private.social_assets(id) on delete set null,
 edited_at timestamptz,deleted_at timestamptz
);
create index message_details_reply_idx on app_private.message_details(reply_to);
create index message_details_asset_idx on app_private.message_details(asset_id);
create table app_private.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 reaction text not null check(reaction in ('like','love','laugh','thanks','sad')),
 primary key(message_id,user_id)
);
create index message_reactions_owner_idx on app_private.message_reactions(user_id);
create table app_private.billing_customers (
 user_id uuid primary key references public.users(id) on delete cascade,
 provider_customer_id text not null unique,created_at timestamptz not null default now()
);
create table app_private.payment_records (
 id uuid primary key default gen_random_uuid(),user_id uuid references public.users(id) on delete set null,
 provider_session_id text not null unique,provider_payment_id text unique,
 purpose text not null check(purpose in ('support','ad_credit')),
 amount bigint not null check(amount>=0),currency text not null check(currency ~ '^[a-z]{3}$'),
 credits integer not null default 0 check(credits>=0),refunded_credits integer not null default 0,
 status text not null default 'paid' check(status in ('paid','partially_refunded','refunded')),
 created_at timestamptz not null default now()
);
create index payment_records_owner_idx on app_private.payment_records(user_id,created_at desc);
create table app_private.payment_events (
 provider_event_id text primary key,kind text not null,processed_at timestamptz not null default now()
);
create table app_private.ad_wallets (
 user_id uuid primary key references public.users(id) on delete cascade,
 balance integer not null default 0 check(balance>=0),debt integer not null default 0 check(debt>=0),updated_at timestamptz not null default now()
);
create table app_private.ad_campaigns (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 2 and 100),body text not null check(length(body)<=500),
 asset_id uuid references app_private.social_assets(id) on delete set null,
 target_url text not null check(length(target_url)<=1000 and target_url ~ '^https://'),
 status text not null default 'pending' check(status in ('pending','approved','paused','rejected')),
 budget integer not null check(budget between 1 and 100000),spent integer not null default 0 check(spent>=0),
 reviewed_by uuid references public.users(id) on delete set null,reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index ad_campaigns_owner_idx on app_private.ad_campaigns(user_id,created_at desc);
create index ad_campaigns_delivery_idx on app_private.ad_campaigns(status,created_at);
create index ad_campaigns_asset_idx on app_private.ad_campaigns(asset_id);
create index ad_campaigns_reviewer_idx on app_private.ad_campaigns(reviewed_by);
create table app_private.ad_clicks (
 campaign_id uuid not null references app_private.ad_campaigns(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,
 day date not null default current_date,primary key(campaign_id,user_id,day)
);
create index ad_clicks_owner_idx on app_private.ad_clicks(user_id);

create function app_private.platform_conversation(actor uuid,conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.conversation_members m join public.conversations c on c.id=m.conversation_id
 join public.users a on a.id=c.direct_a join public.users b on b.id=c.direct_b
 where m.user_id=actor and m.conversation_id=conversation and a.status='active' and b.status='active'
 and not exists(select 1 from public.user_blocks where(blocker_id=c.direct_a and blocked_id=c.direct_b)or(blocker_id=c.direct_b and blocked_id=c.direct_a)));
$$;
alter function app_private.sidle_platform(text,jsonb) rename to sidle_platform_core;
create function app_private.sidle_platform(action text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
<<platform_commerce>>
declare actor uuid:=app_private.product_actor();item uuid;target uuid;conversation uuid;asset uuid;message public.messages;body text;result jsonb;rec app_private.social_assets;campaign app_private.ad_campaigns;
begin
 if input is null or jsonb_typeof(input)<>'object' or pg_column_size(input)>131072 then raise exception 'Invalid request' using errcode='22023';end if;
 case action
 when 'messages.details' then
  if jsonb_array_length(coalesce(input->'ids','[]'))>100 then raise exception 'Too many messages' using errcode='22023';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'replyTo',d.reply_to,'replyBody',case when reply.id is not null then left(reply.body,150) end,'editedAt',d.edited_at,'deleted',d.deleted_at is not null,
   'asset',case when a.status='ready' and d.deleted_at is null then jsonb_build_object('id',a.id,'path',a.path,'kind',a.kind,'mime',a.mime,'sizeBytes',a.size_bytes,'durationSeconds',a.duration_seconds,'rights',a.rights,'attribution',a.attribution) end,
   'reactions',coalesce((select jsonb_agg(to_jsonb(r)) from(select reaction,count(*) as count,bool_or(user_id=actor) as mine from app_private.message_reactions where message_id=m.id group by reaction)r),'[]'))),'[]') into result
  from public.messages m left join app_private.message_details d on d.message_id=m.id left join app_private.social_assets a on a.id=d.asset_id left join public.messages reply on reply.id=d.reply_to and reply.conversation_id=m.conversation_id
  where m.id in(select value::uuid from jsonb_array_elements_text(coalesce(input->'ids','[]'))) and app_private.platform_conversation(actor,m.conversation_id);return result;
 when 'messages.send' then
  conversation:=(input->>'conversationId')::uuid;asset:=(input->>'assetId')::uuid;item:=(input->>'replyTo')::uuid;body:=btrim(coalesce(input->>'body',''));
  if not app_private.platform_conversation(actor,conversation) then raise exception 'Conversation unavailable' using errcode='42501';end if;
  select case when direct_a=actor then direct_b else direct_a end into target from public.conversations where id=conversation;
  if not app_private.platform_connected(actor,target) or exists(select 1 from public.profiles where user_id=target and message_permission='nobody') then raise exception 'Messaging unavailable' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7030));
  select * into message from public.messages where conversation_id=conversation and sender_id=actor and client_tag=(input->>'clientId')::uuid;
  if message.id is not null then return jsonb_build_object('id',message.id);end if;
  if (select count(*) from public.messages where sender_id=actor and created_at>now()-interval '1 minute')>=20 or (select count(*) from public.messages where sender_id=actor and created_at>now()-interval '24 hours')>=400 then raise exception 'Message limit' using errcode='54000';end if;
  if item is not null and not exists(select 1 from public.messages where id=item and conversation_id=conversation) then raise exception 'Reply unavailable' using errcode='42501';end if;
  if asset is not null then select * into rec from app_private.social_assets where id=asset and user_id=actor and status='ready';if rec.id is null then raise exception 'Attachment unavailable' using errcode='42501';end if;if body='' then body:=case rec.kind when 'voice' then 'Voice message' when 'image' then 'Photo' when 'video' then 'Video' else 'Audio attachment' end;end if;end if;
  if length(body) not between 1 and 2000 or input->>'clientId' is null then raise exception 'Invalid message' using errcode='22023';end if;
  insert into public.messages(conversation_id,sender_id,body,client_tag) values(conversation,actor,body,(input->>'clientId')::uuid) returning * into message;
  insert into app_private.message_details(message_id,reply_to,asset_id) values(message.id,item,asset);
  insert into public.activation_milestones(user_id,milestone) values(actor,'first_message') on conflict do nothing;
  perform app_private.platform_notify(target,actor,'message',conversation,'New message','message:'||message.id);
  return jsonb_build_object('id',message.id);
 when 'messages.edit' then
  select * into message from public.messages where id=(input->>'id')::uuid and sender_id=actor and created_at>now()-interval '15 minutes' for update;
  body:=btrim(input->>'body');if message.id is null or not app_private.platform_conversation(actor,message.conversation_id) then raise exception 'Message cannot be edited' using errcode='42501';end if;
  if body is null or length(body) not between 1 and 2000 or exists(select 1 from app_private.message_details where message_id=message.id and deleted_at is not null) then raise exception 'Invalid edit' using errcode='22023';end if;
  update public.messages set body=platform_commerce.body where id=message.id;
  insert into app_private.message_details(message_id,edited_at) values(message.id,now()) on conflict(message_id) do update set edited_at=excluded.edited_at;
  return jsonb_build_object('updated',true);
 when 'messages.delete' then
  select * into message from public.messages where id=(input->>'id')::uuid and sender_id=actor for update;
  if message.id is null or not app_private.platform_conversation(actor,message.conversation_id) then raise exception 'Message unavailable' using errcode='42501';end if;
  update public.messages set body='[Message removed]' where id=message.id;
  insert into app_private.message_details(message_id,deleted_at) values(message.id,now()) on conflict(message_id) do update set deleted_at=excluded.deleted_at;
  delete from app_private.message_reactions where message_id=message.id;return jsonb_build_object('deleted',true);
 when 'messages.react' then
  select * into message from public.messages where id=(input->>'id')::uuid;
  if message.id is null or not app_private.platform_conversation(actor,message.conversation_id) or exists(select 1 from app_private.message_details where message_id=message.id and deleted_at is not null) then raise exception 'Message unavailable' using errcode='42501';end if;
  if input->>'reaction' is null then delete from app_private.message_reactions where message_id=message.id and user_id=actor;
  else insert into app_private.message_reactions(message_id,user_id,reaction) values(message.id,actor,input->>'reaction') on conflict(message_id,user_id) do update set reaction=excluded.reaction;end if;return jsonb_build_object('updated',true);
 when 'media.list' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select a.id,a.path,a.kind,a.mime,a.size_bytes as "sizeBytes",a.status,a.created_at as "createdAt" from app_private.social_assets a where a.user_id=actor and a.status<>'deleted' order by a.created_at desc limit 100)q;return result;
 when 'billing.summary' then
  return jsonb_build_object('balance',coalesce((select balance from app_private.ad_wallets where user_id=actor),0),'debt',coalesce((select debt from app_private.ad_wallets where user_id=actor),0),
   'payments',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,purpose,amount,currency,status,created_at as "createdAt" from app_private.payment_records where user_id=actor order by created_at desc limit 100)q));
 when 'ads.create' then
  if (select count(*) from app_private.ad_campaigns where user_id=actor and created_at>now()-interval '24 hours')>=10 then raise exception 'Campaign limit' using errcode='54000';end if;
  asset:=(input->>'assetId')::uuid;if asset is not null and not exists(select 1 from app_private.social_assets where id=asset and user_id=actor and kind='image' and status='ready') then raise exception 'Creative unavailable' using errcode='42501';end if;
  insert into app_private.ad_campaigns(user_id,title,body,asset_id,target_url,budget) values(actor,input->>'title',coalesce(input->>'body',''),asset,input->>'targetUrl',(input->>'budget')::integer) returning id into item;return jsonb_build_object('id',item);
 when 'ads.mine' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select c.id,c.title,c.body,c.target_url as "targetUrl",c.budget,c.spent,c.status,c.created_at as "createdAt" from app_private.ad_campaigns c where c.user_id=actor order by c.created_at desc limit 100)q;return result;
 when 'ads.pause' then update app_private.ad_campaigns set status='paused' where id=(input->>'id')::uuid and user_id=actor;return jsonb_build_object('paused',found);
 when 'ads.serve' then
  if not(select advertising_enabled from app_private.platform_settings where singleton) then return '[]'::jsonb;end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select a.id,a.title,a.body,a.target_url as "targetUrl",p.display_name as advertiser,
   case when m.status='ready' then jsonb_build_object('id',m.id,'path',m.path,'kind',m.kind,'mime',m.mime,'sizeBytes',m.size_bytes,'rights',m.rights,'attribution',m.attribution) end as asset
   from app_private.ad_campaigns a join app_private.ad_wallets w on w.user_id=a.user_id join public.users u on u.id=a.user_id join public.profiles p on p.user_id=a.user_id left join app_private.social_assets m on m.id=a.asset_id
   where a.status='approved' and a.spent<a.budget and w.balance>0 and w.debt=0 and u.status='active' and a.user_id<>actor
    and not exists(select 1 from public.user_blocks where(blocker_id=actor and blocked_id=a.user_id)or(blocked_id=actor and blocker_id=a.user_id))
   order by a.created_at limit 2)q;return result;
 when 'ads.click' then
  if not(select advertising_enabled from app_private.platform_settings where singleton) then raise exception 'Advertising is disabled' using errcode='42501';end if;
  select * into campaign from app_private.ad_campaigns where id=(input->>'id')::uuid and status='approved' and spent<budget for update;
  if campaign.id is null or campaign.user_id=actor or not exists(select 1 from public.users where id=campaign.user_id and status='active') or exists(select 1 from public.user_blocks where(blocker_id=actor and blocked_id=campaign.user_id)or(blocked_id=actor and blocker_id=campaign.user_id)) then raise exception 'Campaign unavailable' using errcode='42501';end if;
  perform 1 from app_private.ad_wallets where user_id=campaign.user_id and balance>0 and debt=0 for update;if not found then raise exception 'Campaign budget unavailable' using errcode='54000';end if;
  insert into app_private.ad_clicks(campaign_id,user_id) values(campaign.id,actor) on conflict do nothing;
  if found then update app_private.ad_wallets set balance=balance-1,updated_at=now() where user_id=campaign.user_id;update app_private.ad_campaigns set spent=spent+1 where id=campaign.id;end if;
  return jsonb_build_object('url',campaign.target_url);
 when 'admin.ads' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from(select a.id,a.title,a.body,a.target_url as "targetUrl",a.budget,a.spent,a.status,p.display_name as advertiser from app_private.ad_campaigns a join public.profiles p on p.user_id=a.user_id order by a.created_at desc limit 100)q;return result;
 when 'admin.ad.review' then
  if not app_private.platform_admin(actor) then raise exception 'Admin required' using errcode='42501';end if;
  if input->>'status' not in ('approved','rejected','paused') then raise exception 'Invalid status' using errcode='22023';end if;
  update app_private.ad_campaigns set status=input->>'status',reviewed_by=actor,reviewed_at=now() where id=(input->>'id')::uuid;return jsonb_build_object('updated',found);
 else return app_private.sidle_platform_core(action,input);
 end case;
end; $$;

-- Only verified server webhooks may grant credit; clients cannot call this function.
create function public.sidle_billing_event(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid;session text;purpose text;credits integer;customer text;payment text;record app_private.payment_records;refund integer;delta integer;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501';end if;
 if payload->>'eventId' is null or length(payload->>'eventId')>200 then raise exception 'Invalid event' using errcode='22023';end if;
 insert into app_private.payment_events(provider_event_id,kind) values(payload->>'eventId',payload->>'kind') on conflict do nothing;
 if not found then return '{"duplicate":true}'::jsonb;end if;
 if payload->>'kind'='paid' then
  owner:=(payload->>'userId')::uuid;session:=payload->>'sessionId';purpose:=payload->>'purpose';credits:=case when purpose='ad_credit' then (payload->>'credits')::integer else 0 end;customer:=payload->>'customerId';payment:=payload->>'paymentId';
  if not exists(select 1 from public.users where id=owner and status='active') or session is null or purpose not in ('support','ad_credit') or credits is null or credits not between 0 and 100000 or (payload->>'amount')::bigint<0 then raise exception 'Invalid payment record' using errcode='22023';end if;
  insert into app_private.payment_records(user_id,provider_session_id,provider_payment_id,purpose,amount,currency,credits) values(owner,session,payment,purpose,(payload->>'amount')::bigint,payload->>'currency',credits) on conflict(provider_session_id) do nothing;
  if found and credits>0 then insert into app_private.ad_wallets(user_id,balance) values(owner,credits) on conflict(user_id) do update set balance=app_private.ad_wallets.balance+greatest(0,excluded.balance-app_private.ad_wallets.debt),debt=greatest(0,app_private.ad_wallets.debt-excluded.balance),updated_at=now();end if;
  if customer is not null then insert into app_private.billing_customers(user_id,provider_customer_id) values(owner,customer) on conflict(user_id) do update set provider_customer_id=excluded.provider_customer_id;end if;
 elsif payload->>'kind'='refund' then
  select * into record from app_private.payment_records where provider_payment_id=payload->>'paymentId' for update;
  if record.id is null then raise exception 'Payment must be reconciled before refund' using errcode='22023';end if;
  refund:=least(record.credits,greatest(record.refunded_credits,floor(record.credits::numeric*least(record.amount,(payload->>'refundedAmount')::bigint)/greatest(record.amount,1))::integer));delta:=refund-record.refunded_credits;
  update app_private.payment_records set refunded_credits=refund,status=case when status='refunded' then status when (payload->>'refundedAmount')::bigint>=amount then 'refunded' else 'partially_refunded' end where id=record.id;
  if delta>0 and record.user_id is not null then update app_private.ad_wallets set debt=debt+greatest(0,delta-balance),balance=greatest(0,balance-delta),updated_at=now() where user_id=record.user_id;update app_private.ad_campaigns set status='paused' where user_id=record.user_id;end if;
 else raise exception 'Unknown payment event' using errcode='22023';end if;
 return '{"processed":true}'::jsonb;
end; $$;
-- No privileged public RPC: move the implementation behind an invoker wrapper.
alter function public.sidle_billing_event(jsonb) set schema app_private;
create function public.sidle_billing_event(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_billing_event(payload)$$;
create function app_private.sidle_billing_customer(owner uuid) returns text language plpgsql stable security definer set search_path='' as $$begin if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Server role required' using errcode='42501';end if;return(select provider_customer_id from app_private.billing_customers where user_id=owner);end;$$;
create function public.sidle_billing_customer(owner uuid) returns text language sql security invoker set search_path='' as $$select app_private.sidle_billing_customer(owner)$$;

create or replace function app_private.platform_media_read(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.has_active_app_session() and exists(select 1 from app_private.social_assets a where a.path=object_name and
  (a.user_id=auth.uid() or a.status='quarantined' and exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
  or a.status='ready' and (exists(select 1 from app_private.social_posts p where p.asset_id=a.id and app_private.platform_post_visible(auth.uid(),p.id))
   or exists(select 1 from app_private.message_details d join public.messages m on m.id=d.message_id where d.asset_id=a.id and d.deleted_at is null and app_private.platform_conversation(auth.uid(),m.conversation_id))
   or exists(select 1 from app_private.ad_campaigns c join app_private.ad_wallets w on w.user_id=c.user_id where c.asset_id=a.id and c.status='approved' and c.spent<c.budget and w.balance>0 and w.debt=0 and not exists(select 1 from public.user_blocks b where(b.blocker_id=auth.uid() and b.blocked_id=c.user_id)or(b.blocked_id=auth.uid() and b.blocker_id=c.user_id))))));
$$;
create function app_private.platform_commerce_clear() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='deleted' and old.status is distinct from new.status then
  delete from app_private.billing_customers where user_id=new.id;update app_private.payment_records set user_id=null where user_id=new.id;
  delete from app_private.ad_campaigns where user_id=new.id;delete from app_private.ad_wallets where user_id=new.id;delete from app_private.ad_clicks where user_id=new.id;delete from app_private.message_reactions where user_id=new.id;
 end if;return new;end;$$;
create trigger sidle_platform_commerce_clear after update of status on public.users for each row execute function app_private.platform_commerce_clear();
do $$declare t text;begin foreach t in array array['message_details','message_reactions','billing_customers','payment_records','payment_events','ad_wallets','ad_campaigns','ad_clicks'] loop execute format('alter table app_private.%I enable row level security',t);execute format('revoke all on app_private.%I from public,anon,authenticated',t);end loop;end;$$;
revoke all on function app_private.sidle_platform_core(text,jsonb),app_private.sidle_platform(text,jsonb),app_private.platform_conversation(uuid,uuid),app_private.platform_commerce_clear() from public,anon,authenticated;
grant execute on function app_private.sidle_platform(text,jsonb) to authenticated;
revoke all on function public.sidle_billing_event(jsonb),app_private.sidle_billing_event(jsonb),public.sidle_billing_customer(uuid),app_private.sidle_billing_customer(uuid) from public,anon,authenticated;
grant usage on schema app_private to service_role;
grant execute on function public.sidle_billing_event(jsonb),app_private.sidle_billing_event(jsonb),public.sidle_billing_customer(uuid),app_private.sidle_billing_customer(uuid) to service_role;
notify pgrst,'reload schema';
