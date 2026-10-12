-- Phase 11: Media Messages & Push Notification Enhancement
alter type message_kind add value if not exists 'image';

alter table messages add column if not exists media_url text;
alter table messages add column if not exists media_thumb_url text;
alter table messages add column if not exists media_width integer;
alter table messages add column if not exists media_height integer;
