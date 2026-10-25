-- Preserve applied migrations; tighten reserved handles and privileged media reads.
alter table app_private.profile_details add constraint profile_handle_reserved check(handle is null or handle not in('admin','support','settings','sidle','api','help'));

create or replace function app_private.platform_media_read(object_name text) returns boolean language sql stable security definer set search_path='' as $$
 select app_private.has_active_app_session() and exists(select 1 from app_private.social_assets a where a.path=object_name and
  (a.user_id=auth.uid() or a.status='quarantined' and app_private.platform_admin(auth.uid())
  or a.status='ready' and (exists(select 1 from app_private.social_posts p where p.asset_id=a.id and app_private.platform_post_visible(auth.uid(),p.id))
   or exists(select 1 from app_private.message_details d join public.messages m on m.id=d.message_id where d.asset_id=a.id and d.deleted_at is null and app_private.platform_conversation(auth.uid(),m.conversation_id))
   or exists(select 1 from app_private.ad_campaigns c join app_private.ad_wallets w on w.user_id=c.user_id where c.asset_id=a.id and c.status='approved' and c.spent<c.budget and (select advertising_enabled from app_private.platform_settings where singleton) and exists(select 1 from public.users u where u.id=c.user_id and u.status='active') and w.balance>0 and w.debt=0 and not exists(select 1 from public.user_blocks b where(b.blocker_id=auth.uid() and b.blocked_id=c.user_id)or(b.blocked_id=auth.uid() and b.blocker_id=c.user_id))))));
$$;
notify pgrst,'reload schema';
