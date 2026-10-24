-- Legacy badges were granted from unproven form input/domain guesses.
-- Reverification requires a confirmed, matching primary email from Supabase Auth.
alter table profiles add column verified_student_email text;
-- Profile writes (especially verification fields) belong to the authenticated API.
drop policy if exists profiles_self_insert on profiles;
drop policy if exists profiles_self_update on profiles;
update profiles set verification_level = 'unverified'
where verification_level in ('student_verified', 'email_verified');

create function clear_changed_email_verification() returns trigger language plpgsql as $$
begin
  if new.email is distinct from old.email then
    update profiles set verification_level = 'unverified', verified_student_email = null
    where user_id = new.id and verification_level in ('student_verified', 'email_verified');
  end if;
  return new;
end;
$$;

create trigger users_email_verification_changed after update of email on users
for each row execute function clear_changed_email_verification();
