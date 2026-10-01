-- Phase 1.4 + 1.7: identity record and role model.
-- users.id will equal the managed auth provider's user id (see docs/decisions.md D-003); gen_random_uuid() is the local/test default.

create type user_role as enum ('user', 'moderator', 'admin', 'business');
create type user_status as enum ('active', 'suspended', 'banned', 'deleted');

create table users (
  id             uuid primary key default gen_random_uuid(),
  email          text,
  phone          text,
  status         user_status not null default 'active',
  created_at     timestamptz not null default now(),
  last_active_at timestamptz,
  constraint users_contact_present check (email is not null or phone is not null),
  constraint users_email_lower     check (email is null or email = lower(email)),
  constraint users_phone_e164      check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$')
);

create unique index users_email_key on users (email) where email is not null;
create unique index users_phone_key on users (phone) where phone is not null;

create table user_roles (
  user_id    uuid not null references users (id) on delete cascade,
  role       user_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
