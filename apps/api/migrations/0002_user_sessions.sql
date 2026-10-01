-- Phase 1.6: device/session tracking. auth_session_id is the managed auth provider's session id (JWT claim session_id).
-- Revoking a row here makes the API reject that session immediately, even though the provider token is still unexpired.

create table user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users (id) on delete cascade,
  auth_session_id text not null,
  user_agent      text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  revoked_at      timestamptz,
  constraint user_sessions_user_auth_key unique (user_id, auth_session_id)
);

create index user_sessions_user_active_idx on user_sessions (user_id) where revoked_at is null;
