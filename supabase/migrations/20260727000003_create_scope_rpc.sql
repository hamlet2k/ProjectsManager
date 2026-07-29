-- Bulletproof scope creation via SECURITY DEFINER RPC.
-- Forces owner_id = auth.uid() so clients cannot spoof ownership.
-- Bypasses fragile INSERT RLS edge cases while remaining safe.

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
    raise exception 'Not authenticated (auth.uid() is null)';
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
  values (trim(p_name), nullif(trim(p_description), ''), v_uid, v_rank)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_scope(text, text) from public;
grant execute on function public.create_scope(text, text) to authenticated;

-- Also fix base INSERT policy (still useful for direct inserts)
drop policy if exists scopes_insert on public.scopes;
create policy scopes_insert on public.scopes
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Ensure authenticated can execute and that table privileges exist
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.scopes to authenticated;
