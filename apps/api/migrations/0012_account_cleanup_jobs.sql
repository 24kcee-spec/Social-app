-- Durable retries for external Storage/Auth erasure after local anonymization.
create table account_cleanup_jobs (
  user_id uuid primary key references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now()
);
alter table account_cleanup_jobs enable row level security;
