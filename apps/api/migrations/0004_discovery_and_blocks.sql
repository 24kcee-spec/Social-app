-- Phase 3: people discovery. user_blocks hard-excludes people in both directions (full block/report flow is Phase 9).
-- discovery_events records what the viewer saw/did so ranking can reduce repeats and ignored people.
-- Both tables are API-owned: RLS is enabled with no client policies (direct Data API access sees nothing).

create type discovery_event_type as enum ('impression', 'open', 'ignore', 'interact');

create table user_blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on user_blocks (blocked_id, blocker_id);

create table discovery_events (
  id           bigint generated always as identity primary key,
  viewer_id    uuid not null references users (id) on delete cascade,
  candidate_id uuid not null references users (id) on delete cascade,
  event_type   discovery_event_type not null,
  created_at   timestamptz not null default now(),
  constraint discovery_events_not_self check (viewer_id <> candidate_id)
);

create index discovery_events_viewer_candidate_idx on discovery_events (viewer_id, candidate_id, created_at desc);
create index discovery_events_viewer_time_idx on discovery_events (viewer_id, created_at desc);

-- Candidate lookups: active, discoverable, finished onboarding.
create index profiles_discovery_idx on profiles (user_id) where discoverable = true and onboarding_completed = true;

alter table user_blocks enable row level security;
alter table discovery_events enable row level security;
