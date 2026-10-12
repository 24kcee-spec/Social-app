-- Phase 9 Supabase Security & RLS configuration.
-- Run in the Supabase SQL Editor after applying migration 0009 (pnpm --filter @sp/api run migrate).
-- Safe to re-run idempotently.

-- Ensure RLS is active on reports table
alter table public.reports enable row level security;

-- Policy 1: Authenticated users can insert their own reports
drop policy if exists reports_reporter_insert on public.reports;
create policy reports_reporter_insert on public.reports
  for insert to authenticated
  with check (auth.uid() = reporter_id);

-- Policy 2: Users can view reports they filed
drop policy if exists reports_reporter_select on public.reports;
create policy reports_reporter_select on public.reports
  for select to authenticated
  using (
    auth.uid() = reporter_id
    or exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.role in ('admin', 'moderator')
    )
  );

-- Policy 3: Only admins and moderators can update reports (resolve/dismiss)
drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
       where ur.user_id = auth.uid()
         and ur.role in ('admin', 'moderator')
    )
  );
