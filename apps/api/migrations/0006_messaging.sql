-- Phase 5: messaging + notifications.
-- Conversations are 1:1 between connected people; group/event chat arrives with Phase 6 using the same tables
-- (kind + conversation_members.role already allow it). All tables are API-owned: RLS enabled with no client
-- policies here. docs/supabase-phase5-security.sql adds the narrowly-scoped SELECT policies that Supabase
-- Realtime needs to stream new messages to the two members only.

create type message_kind as enum ('text');

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'direct' check (kind in ('direct')),
  direct_a   uuid not null references users (id) on delete cascade,
  direct_b   uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_ordered check (direct_a < direct_b)
);
-- One direct conversation per pair, forever. History survives the connection being removed.
create unique index conversations_direct_pair_idx on conversations (direct_a, direct_b) where kind = 'direct';

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id         uuid not null references users (id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'owner')),
  joined_at       timestamptz not null default now(),
  -- Read state is a watermark, not per-message rows: cheap and correct for 1:1 chat.
  last_read_at    timestamptz not null default 'epoch',
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id, conversation_id);

-- client_tag makes retries and offline resend safe: the same tag from the same sender in the same
-- conversation is stored exactly once, so reconnects can never duplicate a message.
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id       uuid not null references users (id) on delete cascade,
  kind            message_kind not null default 'text',
  body            text not null,
  client_tag      uuid not null,
  created_at      timestamptz not null default now(),
  constraint messages_body_length check (char_length(trim(body)) between 1 and 2000)
);
create unique index messages_client_tag_idx on messages (conversation_id, sender_id, client_tag);
create index messages_conversation_idx on messages (conversation_id, created_at desc, id desc);

-- What may interrupt the user. Defaults stay quiet-friendly; push delivery itself is wired before the pilot.
create table notification_settings (
  user_id             uuid primary key references users (id) on delete cascade,
  messages            boolean not null default true,
  connection_requests boolean not null default true,
  updated_at          timestamptz not null default now()
);

-- Registered device tokens for future FCM/APNs/web push. Registration only; sending is a pre-pilot step.
create table device_push_tokens (
  user_id    uuid not null references users (id) on delete cascade,
  platform   text not null check (platform in ('android', 'ios', 'web')),
  token      text not null check (char_length(token) between 8 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- First message is an activation milestone, next to first_request_sent and first_connection.
alter table activation_milestones drop constraint activation_milestones_known;
alter table activation_milestones
  add constraint activation_milestones_known check (milestone in ('first_request_sent', 'first_connection', 'first_message'));

alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table notification_settings enable row level security;
alter table device_push_tokens enable row level security;
