-- Phase 6: groups, activities and events.
create table groups (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 2 and 80),
 description text not null default '' check (char_length(description) <= 500),
 general_area text not null check (char_length(trim(general_area)) between 2 and 120),
 owner_id uuid not null references users(id) on delete cascade,
 capacity integer not null default 30 check (capacity between 2 and 500),
 created_at timestamptz not null default now()
);
create index groups_area_idx on groups(general_area);
create table group_members (
 group_id uuid not null references groups(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','moderator','member')),
 joined_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
create index group_members_user_idx on group_members(user_id,group_id);
create table activities (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(trim(name)) between 2 and 80),
 description text not null default '',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table group_activities (
 group_id uuid not null references groups(id) on delete cascade,
 activity_id uuid not null references activities(id) on delete cascade,
 primary key(group_id,activity_id)
);
create table events (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references groups(id) on delete cascade,
 host_id uuid not null references users(id) on delete cascade,
 title text not null check (char_length(trim(title)) between 2 and 120),
 description text not null default '' check (char_length(description) <= 1000),
 general_area text not null check (char_length(trim(general_area)) between 2 and 120),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 capacity integer not null check (capacity between 1 and 500),
 chat_conversation_id uuid references conversations(id) on delete set null,
 created_at timestamptz not null default now(),
 constraint events_time_order check (ends_at > starts_at)
);
create index events_area_time_idx on events(general_area,starts_at);
create table event_rsvps (
 event_id uuid not null references events(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 status text not null default 'going' check (status in ('going','waitlisted','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(event_id,user_id)
);
create index event_rsvps_event_status_idx on event_rsvps(event_id,status,created_at);
alter table groups enable row level security;
alter table group_members enable row level security;
alter table activities enable row level security;
alter table group_activities enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;
insert into activities(name,description) values
 ('Study','Study together in a low-pressure group'),
 ('Football','Casual football and meetups'),
 ('Gaming','Games and relaxed sessions'),
 ('Fitness','Group fitness and walks'),
 ('Tech','Coding, projects and tech chats')
on conflict(name) do nothing;
