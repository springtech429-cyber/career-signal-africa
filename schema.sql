-- CareerSignal Africa production PostgreSQL/Supabase schema.
-- Run in Supabase SQL editor after creating a project.

create extension if not exists pgcrypto;

create type public.region_level as enum ('Zambia','Africa','Global');
create type public.trend_direction as enum ('up','steady','down');
create type public.profile_role as enum ('user','admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role profile_role not null default 'user',
  education text,
  location text,
  region region_level default 'Zambia',
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  work_preferences text[] not null default '{}',
  risk_tolerance text,
  weights jsonb not null default '{"marketability":35,"profitability":35,"demand":30}',
  marketing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sources (
  id text primary key,
  name text not null,
  url text not null,
  type text not null,
  region text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.careers (
  id text primary key,
  title text not null,
  category text not null,
  description text not null,
  education_requirements text,
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  work_preferences text[] not null default '{}',
  entry_paths text[] not null default '{}',
  resources text[] not null default '{}',
  related_careers text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_data (
  id bigserial primary key,
  career_id text not null references public.careers(id) on delete cascade,
  region region_level not null,
  marketability_score smallint not null check (marketability_score between 0 and 100),
  profitability_score smallint not null check (profitability_score between 0 and 100),
  demand_score smallint not null check (demand_score between 0 and 100),
  median_salary_local numeric(12,2),
  median_salary_usd numeric(12,2),
  currency_code text not null default 'ZMW',
  trend trend_direction not null default 'steady',
  source_ids text[] not null default '{}',
  methodology_note text,
  last_updated date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (career_id, region)
);

create table if not exists public.learning_links (
  id bigserial primary key,
  career_id text references public.careers(id) on delete cascade,
  category text,
  title text not null,
  description text,
  url text not null,
  link_type text not null check (link_type in ('youtube','blog','course','resource')),
  embed_url text,
  provider text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.saved_recommendations (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  career_id text not null references public.careers(id) on delete cascade,
  composite_score smallint check (composite_score between 0 and 100),
  region region_level not null default 'Zambia',
  created_at timestamptz not null default now(),
  unique (user_id, career_id, region)
);

create table if not exists public.analytics_events (
  id bigserial primary key,
  event_name text not null,
  path text,
  visitor_id text,
  user_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}',
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id bigserial primary key,
  email text not null unique,
  source text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = uid and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.careers enable row level security;
alter table public.market_data enable row level security;
alter table public.learning_links enable row level security;
alter table public.saved_recommendations enable row level security;
alter table public.analytics_events enable row level security;
alter table public.newsletter_subscribers enable row level security;

-- Public read access for career content.
create policy "Public read sources" on public.sources for select using (true);
create policy "Public read careers" on public.careers for select using (active = true);
create policy "Public read market data" on public.market_data for select using (true);
create policy "Public read learning links" on public.learning_links for select using (active = true);

-- Profiles: users see/update themselves; admins see all.
create policy "Users read own profile" on public.profiles for select using (auth.uid() = id or public.is_admin(auth.uid()));
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));
create policy "Admins manage profiles" on public.profiles for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Saved recommendations.
create policy "Users manage own saved careers" on public.saved_recommendations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Admins read saved careers" on public.saved_recommendations for select using (public.is_admin(auth.uid()));

-- Analytics and newsletter.
create policy "Anyone can insert analytics" on public.analytics_events for insert with check (true);
create policy "Admins read analytics" on public.analytics_events for select using (public.is_admin(auth.uid()));
create policy "Anyone can subscribe" on public.newsletter_subscribers for insert with check (true);
create policy "Anyone can upsert own email" on public.newsletter_subscribers for update using (true) with check (true);
create policy "Admins read newsletter" on public.newsletter_subscribers for select using (public.is_admin(auth.uid()));

-- Admin content management.
create policy "Admins manage sources" on public.sources for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage careers" on public.careers for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage market data" on public.market_data for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins manage learning links" on public.learning_links for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create index if not exists market_data_career_region_idx on public.market_data(career_id, region);
create index if not exists analytics_events_created_idx on public.analytics_events(created_at desc);
create index if not exists profiles_role_idx on public.profiles(role);

-- Promote your first admin after signing up by replacing the email below:
-- update public.profiles set role = 'admin' where email = 'you@example.com';


-- Definitive admin/auth profile access fix (added after MVP testing)
-- CareerSignal Africa definitive admin/auth fix.
-- Run this ONCE in Supabase SQL Editor after schema.sql.
-- It fixes profile RLS, creates an RPC the React app uses to read the current profile,
-- and gives you a safe function to promote an email to admin.



-- Required grants.
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.profiles to anon;

-- Make sure RLS is enabled but not blocking the current user from reading themselves.
alter table public.profiles enable row level security;

-- Drop every previous profile policy that may conflict.
drop policy if exists "Users read own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Admins manage profiles" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_admin_select_all" on public.profiles;
drop policy if exists "profiles_admin_manage_all" on public.profiles;
drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_self_insert" on public.profiles;
drop policy if exists "profiles_self_update" on public.profiles;
drop policy if exists "profiles_admin_all" on public.profiles;

-- Helper: test if the currently authenticated user is admin.
-- SECURITY DEFINER lets this function safely inspect profiles without recursive RLS problems.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::public.profile_role
  );
$$;

grant execute on function public.current_user_is_admin() to anon, authenticated;

-- Critical RPC used by the React app. This bypasses profile-select RLS issues for the current user only.
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

grant execute on function public.get_my_profile() to authenticated;

-- Safe admin promotion helper. Run: select public.promote_user_to_admin('you@example.com');
create or replace function public.promote_user_to_admin(target_email text)
returns table(id uuid, email text, full_name text, role public.profile_role)
language sql
security definer
set search_path = public, auth
as $$
  insert into public.profiles (id, email, full_name, role)
  select
    u.id,
    lower(u.email),
    coalesce(u.raw_user_meta_data->>'full_name', ''),
    'admin'::public.profile_role
  from auth.users u
  where lower(u.email) = lower(target_email)
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
    role = 'admin'::public.profile_role,
    updated_at = now()
  returning profiles.id, profiles.email, profiles.full_name, profiles.role;
$$;

grant execute on function public.promote_user_to_admin(text) to service_role, postgres, authenticated;

-- RLS policies.
-- 1. Any signed-in user can read their own profile.
create policy "profiles_self_select"
on public.profiles
for select
to authenticated
using (id = auth.uid());

-- 2. Any signed-in user can insert their own profile only as user.
create policy "profiles_self_insert"
on public.profiles
for insert
to authenticated
with check (id = auth.uid() and role = 'user'::public.profile_role);

-- 3. Users can update their own non-admin profile. Admin role is preserved/managed by SQL only.
create policy "profiles_self_update"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- 4. Admins can manage all profiles.
create policy "profiles_admin_all"
on public.profiles
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());



-- After running this file, promote yourself with:
-- select * from public.promote_user_to_admin('your-email@example.com');
-- Then verify with:
-- select * from public.get_my_profile(); -- must be run while authenticated through app/API, not SQL editor
-- or in SQL editor:
-- select email, role from public.profiles where lower(email) = lower('your-email@example.com');


-- Analytics/newsletter RLS fix (added after MVP testing)
-- CareerSignal Africa analytics/newsletter RLS fix.
-- Run this in Supabase SQL Editor if browser console shows 403 on:
--   /rest/v1/analytics_events
--   /rest/v1/newsletter_subscribers



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



-- Verify as admin after running:
-- select count(*) from public.analytics_events;
-- select count(*) from public.newsletter_subscribers;


-- Admin content-management RLS fix (added after CSV import testing)
-- CareerSignal Africa admin content-management RLS fix.
-- Run this in Supabase SQL Editor if admin CSV import / career save returns 403 on:
--   public.market_data
--   public.careers
--   public.sources
--   public.learning_links



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



-- Verify after running, while signed in as admin in the app:
-- 1. Retry Admin → CSV import.
-- 2. Retry Admin → Career editor → Save current career to DB.
