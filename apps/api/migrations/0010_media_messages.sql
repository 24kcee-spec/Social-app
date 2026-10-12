-- Phase 11: Media Messages & Push Notification Enhancement
-- Convert messages.kind to text check to avoid PostgreSQL 25001 transaction block lock
alter table messages alter column kind type text;
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('text', 'image'));

alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_thumb_url text;
alter table messages add column if not exists media_width integer;
alter table messages add column if not exists media_height integer;
