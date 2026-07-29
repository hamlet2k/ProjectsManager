-- Repair grants + scope RLS (common after applying schema via SQL Editor).
-- Run entire file in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Table / function privileges for the authenticated role
-- ---------------------------------------------------------------------------
grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- github_credentials stays locked down: revoke client access
revoke all on table public.github_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ensure helper functions work with request JWT
-- ---------------------------------------------------------------------------
create or replace function public.is_scope_owner(p_scope_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.scopes s
    where s.id = p_scope_id
      and s.owner_id = auth.uid()
  );
$$;

create or replace function public.has_scope_access(
  p_scope_id uuid,
  p_min_role public.share_role default 'viewer'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.is_scope_owner(p_scope_id)
      or exists (
        select 1
        from public.scope_shares ss
        where ss.scope_id = p_scope_id
          and ss.user_id = auth.uid()
          and ss.status = 'accepted'
          and (
            p_min_role = 'viewer'::public.share_role
            or ss.role = 'editor'::public.share_role
          )
      )
    );
$$;

grant execute on function public.is_scope_owner(uuid) to authenticated, anon;
grant execute on function public.has_scope_access(uuid, public.share_role) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Recreate scope policies cleanly
-- ---------------------------------------------------------------------------
drop policy if exists scopes_select on public.scopes;
drop policy if exists scopes_insert on public.scopes;
drop policy if exists scopes_update on public.scopes;
drop policy if exists scopes_delete on public.scopes;

alter table public.scopes enable row level security;

create policy scopes_select on public.scopes
  for select to authenticated
  using (public.has_scope_access(id, 'viewer'::public.share_role));

-- Owner must match the logged-in user
create policy scopes_insert on public.scopes
  for insert to authenticated
  with check (auth.uid() is not null and owner_id = auth.uid());

create policy scopes_update on public.scopes
  for update to authenticated
  using (public.is_scope_owner(id))
  with check (public.is_scope_owner(id) and owner_id = auth.uid());

create policy scopes_delete on public.scopes
  for delete to authenticated
  using (public.is_scope_owner(id));

-- ---------------------------------------------------------------------------
-- Profiles: ensure self read/insert/update
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_self_or_collab on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select_self_or_collab on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.scope_shares ss
      join public.scopes s on s.id = ss.scope_id
      where (ss.user_id = auth.uid() and ss.status = 'accepted' and s.owner_id = profiles.id)
         or (s.owner_id = auth.uid() and ss.user_id = profiles.id)
    )
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Quick diagnostic (optional): shows your JWT user id when run while logged in via SQL won't work;
-- use the app. This just confirms policies exist.
-- ---------------------------------------------------------------------------
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'scopes'
order by policyname;
