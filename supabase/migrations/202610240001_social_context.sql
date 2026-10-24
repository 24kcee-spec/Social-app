-- Supabase product APIs are versioned separately from the portable Fastify schema.
-- Additive only: no existing account/profile/message data is rewritten.
create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create table app_private.social_context (
  user_id uuid primary key references public.users(id) on delete cascade,
  intents text[] not null default '{}',
  availability text,
  expires_at timestamptz,
  audience text not null default 'connections' check (audience in ('connections','discoverable')),
  updated_at timestamptz not null default now(),
  check (cardinality(intents) <= 3 and intents <@ array['study','coffee_chat','gaming','networking','sport','just_browsing']::text[]),
  check (availability is null or availability in ('open_to_plans','study_together','coffee_chat')),
  check ((availability is null) = (expires_at is null))
);
create table app_private.saved_introductions (
  user_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,target_id),
  check(user_id <> target_id)
);
create index saved_introductions_target_idx on app_private.saved_introductions(target_id);
create table app_private.product_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null,
  category text not null check(category in ('idea','bug','other')),
  body text not null check(length(btrim(body)) between 10 and 2000),
  status text not null default 'received' check(status in ('received','reviewed','closed')),
  created_at timestamptz not null default now(),
  unique(user_id,client_id)
);
create index product_feedback_queue_idx on app_private.product_feedback(status,created_at desc);
alter table app_private.social_context enable row level security;
alter table app_private.saved_introductions enable row level security;
alter table app_private.product_feedback enable row level security;
revoke all on app_private.social_context, app_private.saved_introductions, app_private.product_feedback from public, anon, authenticated;

-- Every definer entry point authenticates internally. No caller-selected owner IDs.
create function app_private.product_actor() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.has_active_app_session() then
    raise exception 'An active Sidle session is required' using errcode='42501';
  end if;
  return auth.uid();
end; $$;

create function app_private.product_visible(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer <> target and exists (
    select 1 from public.users u join public.profiles p on p.user_id=u.id
    where u.id=target and u.status='active' and p.onboarding_completed
      and (p.discoverable or exists(select 1 from public.connections c
        where c.user_a=least(viewer,target) and c.user_b=greatest(viewer,target)))
      and not exists(select 1 from public.user_blocks b
        where (b.blocker_id=viewer and b.blocked_id=target) or (b.blocker_id=target and b.blocked_id=viewer))
  );
$$;
-- product_visible is internal, never callable by client roles (avoids ID probing).

create function app_private.sidle_get_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); result jsonb;
begin
  select jsonb_build_object('intents',intents,'availability',case when expires_at>now() then availability end,
    'expiresAt',case when expires_at>now() then expires_at end,'audience',audience) into result
    from app_private.social_context where user_id=actor;
  return coalesce(result,'{"intents":[],"availability":null,"expiresAt":null,"audience":"connections"}'::jsonb);
end; $$;

create function app_private.sidle_set_context(intents text[], availability text, duration_hours integer, audience text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); clean text[];
begin
  if intents is null or cardinality(intents)>3 or array_position(intents,null) is not null
    or not intents <@ array['study','coffee_chat','gaming','networking','sport','just_browsing']::text[]
    or audience is null or audience not in ('connections','discoverable')
    or (availability is not null and availability not in ('open_to_plans','study_together','coffee_chat'))
    or (availability is not null and (duration_hours is null or duration_hours not in (1,24,72,168))) then
    raise exception 'Invalid social context' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct x order by x),'{}') into clean from unnest(intents) x;
  insert into app_private.social_context(user_id,intents,availability,expires_at,audience)
    values(actor,clean,availability,case when availability is not null then now()+make_interval(hours=>duration_hours) end,audience)
    on conflict(user_id) do update set intents=excluded.intents,availability=excluded.availability,
      expires_at=excluded.expires_at,audience=excluded.audience,updated_at=now();
  return app_private.sidle_get_context();
end; $$;

create function app_private.sidle_people_context(user_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); result jsonb;
begin
  if user_ids is null or cardinality(user_ids)>50 then raise exception 'Too many people' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'intents',s.intents,
    'availability',case when s.expires_at>now() then s.availability end,
    'expiresAt',case when s.expires_at>now() then s.expires_at end)),'[]'::jsonb) into result
    from app_private.social_context s where s.user_id=any(user_ids)
      and app_private.product_visible(actor,s.user_id)
      and (s.audience='discoverable' or exists(select 1 from public.connections c
        where c.user_a=least(actor,s.user_id) and c.user_b=greatest(actor,s.user_id)));
  return result;
end; $$;

create function app_private.sidle_saved_introductions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(target_id order by created_at desc,target_id),'[]'::jsonb) into result
    from app_private.saved_introductions s where user_id=actor and app_private.product_visible(actor,target_id);
  return result;
end; $$;

create function app_private.sidle_save_introduction(target_id uuid, saved boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor();
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7016));
  if saved is null or target_id is null or target_id=actor then raise exception 'Invalid save' using errcode='22023'; end if;
  if not saved then
    delete from app_private.saved_introductions s where s.user_id=actor and s.target_id=sidle_save_introduction.target_id;
    return false;
  end if;
  if not app_private.product_visible(actor,target_id) then raise exception 'Introduction unavailable' using errcode='42501'; end if;
  if not exists(select 1 from app_private.saved_introductions s where s.user_id=actor and s.target_id=sidle_save_introduction.target_id)
    and (select count(*) from app_private.saved_introductions where user_id=actor)>=500 then
    raise exception 'Save limit reached' using errcode='54000';
  end if;
  insert into app_private.saved_introductions values(actor,target_id,now()) on conflict do nothing;
  return true;
end; $$;

create function app_private.sidle_saved_people() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('userId',p.user_id,'displayName',p.display_name,'bio',p.bio,
    'thumbnailPath',(select thumbnail_path from public.profile_media where user_id=p.user_id order by sort_order,created_at limit 1),
    'connected',exists(select 1 from public.connections c where c.user_a=least(actor,p.user_id) and c.user_b=greatest(actor,p.user_id)))
    order by s.created_at desc,s.target_id),'[]'::jsonb) into result
    from app_private.saved_introductions s join public.profiles p on p.user_id=s.target_id
    where s.user_id=actor and app_private.product_visible(actor,s.target_id);
  return result;
end; $$;

create function app_private.sidle_submit_feedback(client_id uuid, category text, body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); item app_private.product_feedback;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text,7017));
  if client_id is null or category is null or category not in ('idea','bug','other')
    or body is null or length(btrim(body)) not between 10 and 2000 then
    raise exception 'Use 10 to 2000 characters' using errcode='22023';
  end if;
  select * into item from app_private.product_feedback f where f.user_id=actor and f.client_id=sidle_submit_feedback.client_id;
  if item.id is not null then
    if item.body<>btrim(body) or item.category<>category then raise exception 'Retry ID already used' using errcode='22023'; end if;
  else
    if (select count(*) from app_private.product_feedback where user_id=actor and created_at>now()-interval '24 hours')>=5 then
      raise exception 'Feedback limit reached; try tomorrow' using errcode='54000';
    end if;
    insert into app_private.product_feedback(user_id,client_id,category,body)
      values(actor,client_id,category,btrim(body)) returning * into item;
  end if;
  return jsonb_build_object('id',item.id,'status',item.status,'createdAt',item.created_at);
end; $$;

create function app_private.sidle_feedback_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor(); result jsonb;
begin
  if not exists(select 1 from public.user_roles where user_id=actor and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) into result from (
    select id,category,body,status,created_at as "createdAt" from app_private.product_feedback
    order by created_at desc,id limit 100
  ) f;
  return result;
end; $$;
create function app_private.sidle_review_feedback(feedback_id uuid, status text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare actor uuid := app_private.product_actor();
begin
  if not exists(select 1 from public.user_roles where user_id=actor and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
  if status is null or status not in ('reviewed','closed') then raise exception 'Invalid status' using errcode='22023'; end if;
  update app_private.product_feedback f set status=sidle_review_feedback.status where id=feedback_id;
  return found;
end; $$;

-- Anonymization keeps users rows, so foreign-key cascades alone are insufficient.
create function app_private.clear_product_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='deleted' and old.status is distinct from new.status then
    delete from app_private.social_context where user_id=new.id;
    delete from app_private.saved_introductions where user_id=new.id or target_id=new.id;
    delete from app_private.product_feedback where user_id=new.id;
  end if;
  return new;
end; $$;
create trigger sidle_clear_product_account after update of status on public.users
  for each row execute function app_private.clear_product_account();
create function app_private.clear_blocked_saves() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from app_private.saved_introductions where (user_id=new.blocker_id and target_id=new.blocked_id)
    or (user_id=new.blocked_id and target_id=new.blocker_id);
  return new;
end; $$;
create trigger sidle_clear_blocked_saves after insert on public.user_blocks
  for each row execute function app_private.clear_blocked_saves();

-- Exposed wrappers are invoker functions; privileged implementations stay private.
create function public.sidle_get_context() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_get_context()$$;
create function public.sidle_set_context(intents text[],availability text,duration_hours integer,audience text) returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_set_context(intents,availability,duration_hours,audience)$$;
create function public.sidle_people_context(user_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_people_context(user_ids)$$;
create function public.sidle_saved_introductions() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_saved_introductions()$$;
create function public.sidle_saved_people() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_saved_people()$$;
create function public.sidle_save_introduction(target_id uuid,saved boolean) returns boolean language sql security invoker set search_path='' as $$select app_private.sidle_save_introduction(target_id,saved)$$;
create function public.sidle_submit_feedback(client_id uuid,category text,body text) returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_submit_feedback(client_id,category,body)$$;
create function public.sidle_feedback_queue() returns jsonb language sql security invoker set search_path='' as $$select app_private.sidle_feedback_queue()$$;
create function public.sidle_review_feedback(feedback_id uuid,status text) returns boolean language sql security invoker set search_path='' as $$select app_private.sidle_review_feedback(feedback_id,status)$$;

do $$ declare signature text; begin
  foreach signature in array array['sidle_get_context()','sidle_set_context(text[],text,integer,text)',
    'sidle_people_context(uuid[])','sidle_saved_introductions()','sidle_saved_people()','sidle_save_introduction(uuid,boolean)',
    'sidle_submit_feedback(uuid,text,text)','sidle_feedback_queue()','sidle_review_feedback(uuid,text)'] loop
    execute 'revoke all on function app_private.'||signature||' from public, anon, authenticated';
    execute 'revoke all on function public.'||signature||' from public, anon, authenticated';
    execute 'grant execute on function app_private.'||signature||' to authenticated';
    execute 'grant execute on function public.'||signature||' to authenticated';
  end loop;
end; $$;
revoke all on function app_private.product_actor(), app_private.product_visible(uuid,uuid),
  app_private.clear_product_account(), app_private.clear_blocked_saves() from public, anon, authenticated;
notify pgrst, 'reload schema';
