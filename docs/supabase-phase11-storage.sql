-- Phase 11 Supabase Storage Bucket for Direct Chat Media
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists chat_media_member_select on storage.objects;
create policy chat_media_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id::text = (storage.foldername(name))[1]
         and cm.user_id = auth.uid()
    )
  );

drop policy if exists chat_media_member_insert on storage.objects;
create policy chat_media_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id::text = (storage.foldername(name))[1]
         and cm.user_id = auth.uid()
    )
  );
