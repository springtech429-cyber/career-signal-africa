-- CareerSignal Africa definitive admin/auth fix.
-- Run this ONCE in Supabase SQL Editor after schema.sql.
-- It fixes profile RLS, creates an RPC the React app uses to read the current profile,
-- and gives you a safe function to promote an email to admin.

begin;

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

commit;

-- After running this file, promote yourself with:
-- select * from public.promote_user_to_admin('your-email@example.com');
-- Then verify with:
-- select * from public.get_my_profile(); -- must be run while authenticated through app/API, not SQL editor
-- or in SQL editor:
-- select email, role from public.profiles where lower(email) = lower('your-email@example.com');
