-- CareerSignal Africa analytics/newsletter RLS fix.
-- Run this in Supabase SQL Editor if browser console shows 403 on:
--   /rest/v1/analytics_events
--   /rest/v1/newsletter_subscribers

begin;

grant usage on schema public to anon, authenticated;

grant insert on public.analytics_events to anon, authenticated;
grant select on public.analytics_events to authenticated;

grant insert, update on public.newsletter_subscribers to anon, authenticated;
grant select on public.newsletter_subscribers to authenticated;

-- bigserial tables need sequence permissions for inserts.
grant usage, select on sequence public.analytics_events_id_seq to anon, authenticated;
grant usage, select on sequence public.newsletter_subscribers_id_seq to anon, authenticated;

alter table public.analytics_events enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Clean old/conflicting policies.
drop policy if exists "Anyone can insert analytics" on public.analytics_events;
drop policy if exists "Admins read analytics" on public.analytics_events;
drop policy if exists "analytics_insert_anyone" on public.analytics_events;
drop policy if exists "analytics_admin_select" on public.analytics_events;

drop policy if exists "Anyone can subscribe" on public.newsletter_subscribers;
drop policy if exists "Anyone can upsert own email" on public.newsletter_subscribers;
drop policy if exists "Admins read newsletter" on public.newsletter_subscribers;
drop policy if exists "newsletter_insert_anyone" on public.newsletter_subscribers;
drop policy if exists "newsletter_update_anyone" on public.newsletter_subscribers;
drop policy if exists "newsletter_admin_select" on public.newsletter_subscribers;

-- Anyone can insert analytics after app-side consent.
-- RLS cannot know browser cookie consent, so consent is enforced in React before insert.
create policy "analytics_insert_anyone"
on public.analytics_events
for insert
to anon, authenticated
with check (true);

-- Only admins can read analytics reports/counts.
create policy "analytics_admin_select"
on public.analytics_events
for select
to authenticated
using (public.current_user_is_admin());

-- Anyone can subscribe to the newsletter.
create policy "newsletter_insert_anyone"
on public.newsletter_subscribers
for insert
to anon, authenticated
with check (true);

-- Allow upsert conflict updates for the same email capture flow.
create policy "newsletter_update_anyone"
on public.newsletter_subscribers
for update
to anon, authenticated
using (true)
with check (true);

-- Only admins can read/export newsletter emails.
create policy "newsletter_admin_select"
on public.newsletter_subscribers
for select
to authenticated
using (public.current_user_is_admin());

commit;

-- Verify as admin after running:
-- select count(*) from public.analytics_events;
-- select count(*) from public.newsletter_subscribers;
