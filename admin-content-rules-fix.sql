-- CareerSignal Africa admin content-management RLS fix.
-- Run this in Supabase SQL Editor if admin CSV import / career save returns 403 on:
--   public.market_data
--   public.careers
--   public.sources
--   public.learning_links

begin;

grant usage on schema public to anon, authenticated;

-- Public read access for site content.
grant select on public.sources to anon, authenticated;
grant select on public.careers to anon, authenticated;
grant select on public.market_data to anon, authenticated;
grant select on public.learning_links to anon, authenticated;

-- Admin write access is still controlled by RLS policies below.
grant insert, update, delete on public.sources to authenticated;
grant insert, update, delete on public.careers to authenticated;
grant insert, update, delete on public.market_data to authenticated;
grant insert, update, delete on public.learning_links to authenticated;

-- bigserial sequence permissions for insertable tables.
grant usage, select on sequence public.market_data_id_seq to authenticated;
grant usage, select on sequence public.learning_links_id_seq to authenticated;

alter table public.sources enable row level security;
alter table public.careers enable row level security;
alter table public.market_data enable row level security;
alter table public.learning_links enable row level security;

-- Drop old/conflicting policies.
drop policy if exists "Public read sources" on public.sources;
drop policy if exists "Admins manage sources" on public.sources;
drop policy if exists "sources_public_select" on public.sources;
drop policy if exists "sources_admin_all" on public.sources;

drop policy if exists "Public read careers" on public.careers;
drop policy if exists "Admins manage careers" on public.careers;
drop policy if exists "careers_public_select" on public.careers;
drop policy if exists "careers_admin_all" on public.careers;

drop policy if exists "Public read market data" on public.market_data;
drop policy if exists "Admins manage market data" on public.market_data;
drop policy if exists "market_data_public_select" on public.market_data;
drop policy if exists "market_data_admin_all" on public.market_data;

drop policy if exists "Public read learning links" on public.learning_links;
drop policy if exists "Admins manage learning links" on public.learning_links;
drop policy if exists "learning_links_public_select" on public.learning_links;
drop policy if exists "learning_links_admin_all" on public.learning_links;

-- Public read policies.
create policy "sources_public_select"
on public.sources
for select
to anon, authenticated
using (true);

create policy "careers_public_select"
on public.careers
for select
to anon, authenticated
using (active = true or public.current_user_is_admin());

create policy "market_data_public_select"
on public.market_data
for select
to anon, authenticated
using (true);

create policy "learning_links_public_select"
on public.learning_links
for select
to anon, authenticated
using (active = true or public.current_user_is_admin());

-- Admin write/manage policies.
-- These rely on current_user_is_admin() from admin-auth-fix.sql.
create policy "sources_admin_all"
on public.sources
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "careers_admin_all"
on public.careers
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "market_data_admin_all"
on public.market_data
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy "learning_links_admin_all"
on public.learning_links
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

commit;

-- Verify after running, while signed in as admin in the app:
-- 1. Retry Admin → CSV import.
-- 2. Retry Admin → Career editor → Save current career to DB.
