-- Fix: allow users to insert their own profile + backfill missing profiles.
-- Run this in Supabase SQL Editor if scope creation fails after signup.

-- 1) Client can create own profile when the signup trigger did not run
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_self'
  ) then
    create policy profiles_insert_self on public.profiles
      for insert to authenticated
      with check (id = auth.uid());
  end if;
end $$;

-- 2) Backfill profiles for any auth users missing a row
insert into public.profiles (id, username, name, email, theme)
select
  u.id,
  left(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'user_' || substr(replace(u.id::text, '-', ''), 1, 8)
    ),
    80
  ) as username,
  left(
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'username'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'User'
    ),
    80
  ) as name,
  coalesce(u.email, u.id::text || '@users.local'),
  'system'::public.theme_pref
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 3) Uniquify duplicate usernames if any
with dups as (
  select
    id,
    username,
    row_number() over (partition by username order by created_at, id) as rn
  from public.profiles
)
update public.profiles p
set username = left(p.username || '_' || substr(replace(p.id::text, '-', ''), 1, 6), 80)
from dups d
where p.id = d.id
  and d.rn > 1;
