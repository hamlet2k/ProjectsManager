-- Fix create_cli_access_token: digest()/gen_random_bytes live in extensions schema.
create or replace function public.create_cli_access_token(
  p_name text,
  p_scope_ids uuid[] default null,
  p_can_write boolean default true
)
returns table (
  id uuid,
  token text,
  token_prefix text,
  name text,
  scope_ids uuid[],
  can_write boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(p_name);
  v_prefix text;
  v_secret text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_scope uuid;
  v_scopes uuid[] := null;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Name must be 1–80 characters';
  end if;

  if p_scope_ids is not null then
    if cardinality(p_scope_ids) = 0 then
      raise exception 'Select at least one project, or leave empty for all accessible projects';
    end if;
    v_scopes := array[]::uuid[];
    foreach v_scope in array p_scope_ids loop
      if not public.has_scope_access(v_scope, 'viewer') then
        raise exception 'No access to project %', v_scope;
      end if;
      if p_can_write and not public.has_scope_access(v_scope, 'editor') then
        raise exception 'Editor access required for write tokens on project %', v_scope;
      end if;
      v_scopes := array_append(v_scopes, v_scope);
    end loop;
  end if;

  v_prefix := substr(encode(gen_random_bytes(6), 'hex'), 1, 8);
  v_secret := encode(gen_random_bytes(24), 'hex');
  v_token := 'pmcli_' || v_prefix || '_' || v_secret;
  v_hash := encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.cli_access_tokens (
    user_id, name, token_prefix, token_hash, scope_ids, can_write
  ) values (
    v_uid, v_name, v_prefix, v_hash, v_scopes, coalesce(p_can_write, true)
  )
  returning cli_access_tokens.id into v_id;

  return query
  select
    v_id,
    v_token,
    v_prefix,
    v_name,
    v_scopes,
    coalesce(p_can_write, true),
    now();
end;
$$;

grant execute on function public.create_cli_access_token(text, uuid[], boolean) to authenticated;
