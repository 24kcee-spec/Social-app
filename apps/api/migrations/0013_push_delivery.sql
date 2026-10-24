alter table device_push_tokens add column session_id uuid references user_sessions(id) on delete cascade;
-- Legacy unscoped tokens must be registered again by a current authenticated session.
delete from device_push_tokens where session_id is null;
create table push_delivery_receipts (
  ticket_id text primary key,
  token text not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now() + interval '15 minutes',
  checked_at timestamptz,
  outcome text check (outcome in ('accepted', 'unregistered', 'provider_error', 'expired'))
);
alter table push_delivery_receipts enable row level security;
