-- Phase 6 hardening. 0007 stays untouched; everything new lives here.
-- event_messages was created in 0007 without row level security: with Supabase's public API that table was
-- readable by anyone holding the publishable key. Same model as the other community tables: RLS on, no client
-- policies, API only.
alter table event_messages enable row level security;

-- Exactly one owner per group.
create unique index if not exists group_owner_unique on group_members (group_id) where role = 'owner';

-- Case-insensitive area filtering and the new list queries.
create index if not exists groups_area_lower_idx on groups (lower(general_area));
create index if not exists events_area_lower_idx on events (lower(general_area), starts_at);
create index if not exists events_group_time_idx on events (group_id, starts_at);
create index if not exists group_activities_activity_idx on group_activities (activity_id, group_id);
create index if not exists event_rsvps_waitlist_idx on event_rsvps (event_id, updated_at, user_id) where status = 'waitlisted';
create index if not exists event_messages_sender_time_idx on event_messages (sender_id, created_at);

-- Joining a group and RSVPing are activation milestones (product definition: "group joined or activity joined").
alter table activation_milestones drop constraint activation_milestones_known;
alter table activation_milestones
  add constraint activation_milestones_known check (milestone in ('first_request_sent', 'first_connection', 'first_message', 'first_group_join', 'first_rsvp'));
