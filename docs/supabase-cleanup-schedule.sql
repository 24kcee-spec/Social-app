-- Install only in Supabase after deploying sidle-account-cleanup and provisioning
-- SIDLE_CLEANUP_TOKEN in Edge secrets and its matching encrypted Vault entry.
-- No credential values belong in this file. Existing provider privileges stay intact.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$ begin
  if not exists (select 1 from vault.secrets where name='sidle_cleanup_token') then
    raise exception 'Encrypted cleanup worker token is missing';
  end if;
end; $$;

select cron.schedule('sidle-account-cleanup', '* * * * *', $job$
  select net.http_post(
    url := 'https://mdekznpqmadhhsmouuhx.supabase.co/functions/v1/sidle-account-cleanup',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='sidle_cleanup_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.account_cleanup_jobs j join public.users u on u.id=j.user_id
    where u.status='deleted' and j.completed_at is null and j.next_attempt_at <= now()
  ) or extract(minute from now() at time zone 'UTC')=0
    or exists(select 1 from app_private.location_shares where expires_at<now())
    or exists(select 1 from app_private.call_signals s join app_private.call_rooms c on c.id=s.call_id where c.expires_at<now() or c.state in('ended','declined'));
$job$);
