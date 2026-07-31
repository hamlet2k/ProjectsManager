-- 1) Who is the database seeing? (call from the app or SQL with a user JWT)
create or replace function public.debug_auth()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'uid', auth.uid(),
    'role', auth.role(),
    'email', auth.jwt() ->> 'email'
  );
$$;

grant execute on function public.debug_auth() to authenticated, anon;

-- 2) Ensure create_scope exists (safe ownership-enforced insert)
create or replace function public.create_scope(
  p_name text,
  p_description text default null
)
returns public.scopes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rank integer;
  v_row public.scopes;
begin
  if v_uid is null then
    raise exception 'Not authenticated (auth.uid() is null). Sign out and sign in again.';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Scope name is required';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Profile missing for current user';
  end if;

  select coalesce(max(s.rank), 0) + 1
  into v_rank
  from public.scopes s
  where s.owner_id = v_uid;

  insert into public.scopes (name, description, owner_id, rank)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_uid, v_rank)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_scope(text, text) from public;
grant execute on function public.create_scope(text, text) to authenticated;

-- 3) Tighten: anon should not write scopes (login is fine; data writes need a user)
revoke insert, update, delete, truncate on table public.scopes from anon;

-- 4) Confirm function is visible
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('create_scope', 'debug_auth')
order by 1, 2;
