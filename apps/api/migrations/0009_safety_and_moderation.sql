-- Phase 9: Safety, reporting, moderation queue and verification levels.

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'message', 'group', 'event', 'event_message')),
  target_id text not null,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate_content', 'hate_speech', 'impersonation', 'safety_concern', 'other')),
  details text check (details is null or length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  action_taken text check (action_taken is null or action_taken in ('none', 'warning_issued', 'content_removed', 'user_suspended', 'user_banned')),
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text check (resolution_notes is null or length(resolution_notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists reports_status_time_idx on reports (status, created_at desc);
create index if not exists reports_reporter_time_idx on reports (reporter_id, created_at desc);
create index if not exists reports_target_idx on reports (target_type, target_id);

alter table reports enable row level security;

-- Verification level on profile (default 'unverified')
alter table profiles add column if not exists verification_level text not null default 'unverified'
  check (verification_level in ('unverified', 'email_verified', 'student_verified', 'trusted'));

create index if not exists profiles_verification_level_idx on profiles (verification_level);
