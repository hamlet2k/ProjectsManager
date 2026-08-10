-- Grok CLI / MCP access tokens: user-scoped PATs with optional project allow-list.

create table public.cli_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  token_prefix text not null,
  token_hash text not null unique,
  -- null = every project the user can access; otherwise only these scope ids
  scope_ids uuid[] null,
  can_write boolean not null default true,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cli_access_tokens_name_len check (char_length(name) between 1 and 80),
  constraint cli_access_tokens_prefix_len check (char_length(token_prefix) between 4 and 32)
);

create index cli_access_tokens_user_id_idx on public.cli_access_tokens (user_id)
  where revoked_at is null;

comment on table public.cli_access_tokens is
  'Personal access tokens for Grok CLI / MCP. Only token_hash is stored; plaintext shown once at create.';

alter table public.cli_access_tokens enable row level security;

create policy cli_access_tokens_select on public.cli_access_tokens
  for select to authenticated
  using (user_id = auth.uid());

-- Inserts/updates go through security definer RPCs only
revoke insert, update, delete on public.cli_access_tokens from authenticated, anon;
grant select on public.cli_access_tokens to authenticated;

-- ---------------------------------------------------------------------------
-- Create token (returns plaintext once)
-- ---------------------------------------------------------------------------
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
-- extensions required for digest() / gen_random_bytes (pgcrypto)
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

  -- Validate allow-list: each scope must be accessible at least as viewer
  if p_scope_ids is not null then
    if cardinality(p_scope_ids) = 0 then
      raise exception 'Select at least one project, or leave empty for all accessible projects';
    end if;
    v_scopes := array[]::uuid[];
    foreach v_scope in array p_scope_ids loop
      if not public.has_scope_access(v_scope, 'viewer') then
        raise exception 'No access to project %', v_scope;
      end if;
      -- owner counts as editor via has_scope_access
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

-- ---------------------------------------------------------------------------
-- Revoke token
-- ---------------------------------------------------------------------------
create or replace function public.revoke_cli_access_token(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  update public.cli_access_tokens t
  set revoked_at = now()
  where t.id = p_id
    and t.user_id = v_uid
    and t.revoked_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

grant execute on function public.revoke_cli_access_token(uuid) to authenticated;
