-- Cover referencing columns used during deletes, joins and account cleanup.
create index if not exists connections_request_id_idx on connections(request_id);
create index if not exists conversations_direct_b_idx on conversations(direct_b);
create index if not exists discovery_events_candidate_id_idx on discovery_events(candidate_id);
create index if not exists event_rsvps_user_id_idx on event_rsvps(user_id);
create index if not exists events_chat_conversation_id_idx on events(chat_conversation_id);
create index if not exists events_host_id_idx on events(host_id);
create index if not exists groups_owner_id_idx on groups(owner_id);
create index if not exists messages_sender_id_idx on messages(sender_id);
create index if not exists reports_reviewed_by_idx on reports(reviewed_by);
create index if not exists device_push_tokens_session_id_idx on device_push_tokens(session_id);
create index if not exists account_cleanup_jobs_pending_idx on account_cleanup_jobs(next_attempt_at) where completed_at is null;
create index if not exists push_delivery_receipts_pending_idx on push_delivery_receipts(next_attempt_at) where checked_at is null;

-- Fixed search_path also requires qualified table references in the trigger body.
create or replace function public.clear_changed_email_verification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set verification_level = 'unverified', verified_student_email = null
    where user_id = new.id and verification_level in ('student_verified', 'email_verified');
  end if;
  return new;
end;
$$;
