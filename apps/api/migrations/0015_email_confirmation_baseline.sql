-- Applied after disabling Supabase Auth auto-confirm. Older timestamps cannot
-- distinguish a verified inbox from the old auto-confirm configuration.
create table email_proof_settings (
  singleton boolean primary key default true check (singleton),
  confirmed_email_not_before timestamptz not null default now()
);
insert into email_proof_settings(singleton) values (true);
alter table email_proof_settings enable row level security;
update profiles set verification_level = 'unverified', verified_student_email = null
where verification_level = 'student_verified';
