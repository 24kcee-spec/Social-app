-- Search and shared-media pagination always stay inside one authorized thread.
create index messages_text_search_idx on public.messages using gin(to_tsvector('simple',body));
alter function app_private.sidle_platform(text,jsonb) rename to sidle_platform_before_chat_tools;
create function app_private.sidle_platform(action text,input jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.product_actor();conversation uuid;query text;result jsonb;
begin
 if input is null or jsonb_typeof(input)<>'object' or pg_column_size(input)>131072 then raise exception 'Invalid request' using errcode='22023';end if;
 if action in('messages.search','messages.media','messages.lookup') then
  conversation:=(input->>'conversationId')::uuid;
  if not app_private.platform_conversation(actor,conversation) then raise exception 'Conversation unavailable' using errcode='42501';end if;
  if action='messages.lookup' then
   select jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'senderId',m.sender_id,'kind',m.kind,'body',m.body,'clientTag',m.client_tag,'createdAt',m.created_at,'read',false) into result
   from public.messages m where m.id=(input->>'id')::uuid and m.conversation_id=conversation;
   if result is null then raise exception 'Message unavailable' using errcode='42501';end if;return result;
  end if;
  query:=btrim(coalesce(input->>'query',''));
  if action='messages.search' and length(query) not between 2 and 100 then raise exception 'Search needs 2 to 100 characters' using errcode='22023';end if;
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(q)),'[]')) into result from (
   select m.id,m.sender_id as "senderId",m.body,m.created_at as "createdAt",
    case when a.id is not null then jsonb_build_object('id',a.id,'path',a.path,'kind',a.kind,'mime',a.mime,'sizeBytes',a.size_bytes,'durationSeconds',a.duration_seconds,'rights',a.rights,'attribution',a.attribution) end as asset
   from public.messages m left join app_private.message_details d on d.message_id=m.id left join app_private.social_assets a on a.id=d.asset_id and a.status='ready'
   where m.conversation_id=conversation and d.deleted_at is null
    and(action='messages.media' and a.id is not null or action='messages.search' and to_tsvector('simple',m.body) @@ websearch_to_tsquery('simple',query))
    and(input->>'beforeAt' is null or (m.created_at,m.id)<((input->>'beforeAt')::timestamptz,(input->>'beforeId')::uuid))
   order by m.created_at desc,m.id desc limit 30
  )q;
  return result;
 end if;
 return app_private.sidle_platform_before_chat_tools(action,input);
end;$$;
revoke all on function app_private.sidle_platform_before_chat_tools(text,jsonb),app_private.sidle_platform(text,jsonb) from public,anon,authenticated;
grant execute on function app_private.sidle_platform(text,jsonb) to authenticated;
notify pgrst,'reload schema';
