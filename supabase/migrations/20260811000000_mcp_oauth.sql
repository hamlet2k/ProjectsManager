-- OAuth 2.1 authorization codes for remote MCP connectors (Grok web, etc.).
-- Access tokens issued at exchange are CLI tokens (pmcli_…) already understood by mcp/cli-api.

create table public.mcp_oauth_codes (
  code text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256'
    check (code_challenge_method in ('S256', 'plain')),
  scope text not null default 'mcp',
  can_write boolean not null default true,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index mcp_oauth_codes_user_id_idx on public.mcp_oauth_codes (user_id);
create index mcp_oauth_codes_expires_idx on public.mcp_oauth_codes (expires_at)
  where used_at is null;

comment on table public.mcp_oauth_codes is
  'Short-lived OAuth authorization codes for remote MCP (PKCE). Exchanged once for a CLI access token.';

alter table public.mcp_oauth_codes enable row level security;

-- Users never read codes directly
revoke all on public.mcp_oauth_codes from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Create authorization code (logged-in user consent in SPA)
-- ---------------------------------------------------------------------------
create or replace function public.create_mcp_oauth_code(
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_code_challenge_method text default 'S256',
  p_scope text default 'mcp',
  p_can_write boolean default true
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_method text := upper(coalesce(nullif(trim(p_code_challenge_method), ''), 'S256'));
  v_client text := trim(p_client_id);
  v_redirect text := trim(p_redirect_uri);
  v_challenge text := trim(p_code_challenge);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if v_client is null or v_client = '' then
    raise exception 'client_id required';
  end if;
  -- Public client id for Projects Manager MCP
  if v_client not in ('projects-manager-mcp', 'projects-manager') then
    raise exception 'Unknown client_id';
  end if;
  if v_redirect is null or v_redirect not like 'https://%' then
    raise exception 'redirect_uri must be https://';
  end if;
  if v_challenge is null or char_length(v_challenge) < 16 then
    raise exception 'code_challenge required (PKCE)';
  end if;
  if v_method not in ('S256', 'PLAIN') then
    raise exception 'code_challenge_method must be S256 or plain';
  end if;
  if v_method = 'PLAIN' then
    v_method := 'plain';
  else
    v_method := 'S256';
  end if;

  v_code := encode(gen_random_bytes(32), 'base64');
  -- URL-safe-ish
  v_code := replace(replace(replace(v_code, '+', '-'), '/', '_'), '=', '');

  insert into public.mcp_oauth_codes (
    code, user_id, client_id, redirect_uri, code_challenge, code_challenge_method,
    scope, can_write, expires_at
  ) values (
    v_code, v_uid, v_client, v_redirect, v_challenge, v_method,
    coalesce(nullif(trim(p_scope), ''), 'mcp'),
    coalesce(p_can_write, true),
    now() + interval '10 minutes'
  );

  return v_code;
end;
$$;

revoke all on function public.create_mcp_oauth_code(text, text, text, text, text, boolean) from public;
grant execute on function public.create_mcp_oauth_code(text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Exchange code for CLI access token (service role / Edge only)
-- ---------------------------------------------------------------------------
create or replace function public.exchange_mcp_oauth_code(
  p_code text,
  p_client_id text,
  p_redirect_uri text,
  p_code_verifier text
)
returns table (
  access_token text,
  token_type text,
  expires_in int,
  scope text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.mcp_oauth_codes%rowtype;
  v_expected text;
  v_digest bytea;
  v_prefix text;
  v_secret text;
  v_token text;
  v_hash text;
  v_id uuid;
  v_name text;
begin
  if p_code is null or trim(p_code) = '' then
    raise exception 'code required';
  end if;
  if p_code_verifier is null or char_length(trim(p_code_verifier)) < 16 then
    raise exception 'code_verifier required';
  end if;

  select * into v_row
  from public.mcp_oauth_codes
  where code = trim(p_code)
  for update;

  if not found then
    raise exception 'Invalid authorization code';
  end if;
  if v_row.used_at is not null then
    raise exception 'Authorization code already used';
  end if;
  if v_row.expires_at < now() then
    raise exception 'Authorization code expired';
  end if;
  if v_row.client_id <> trim(p_client_id) then
    raise exception 'client_id mismatch';
  end if;
  if v_row.redirect_uri <> trim(p_redirect_uri) then
    raise exception 'redirect_uri mismatch';
  end if;

  if v_row.code_challenge_method = 'S256' then
    v_digest := digest(convert_to(trim(p_code_verifier), 'UTF8'), 'sha256');
    v_expected := replace(replace(replace(encode(v_digest, 'base64'), '+', '-'), '/', '_'), '=', '');
    if v_expected <> v_row.code_challenge then
      raise exception 'PKCE verification failed';
    end if;
  else
    if trim(p_code_verifier) <> v_row.code_challenge then
      raise exception 'PKCE verification failed';
    end if;
  end if;

  update public.mcp_oauth_codes set used_at = now() where code = v_row.code;

  -- Issue a CLI token (same format mcp Edge already validates)
  v_secret := encode(gen_random_bytes(24), 'hex');
  v_prefix := substr(v_secret, 1, 8);
  v_token := 'pmcli_' || v_prefix || '_' || v_secret;
  v_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_name := 'Grok connector ' || to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI');

  insert into public.cli_access_tokens (
    user_id, name, token_prefix, token_hash, scope_ids, can_write
  ) values (
    v_row.user_id, v_name, v_prefix, v_hash, null, v_row.can_write
  )
  returning public.cli_access_tokens.id into v_id;

  access_token := v_token;
  token_type := 'Bearer';
  expires_in := 31536000; -- 365 days (revoke anytime in Settings)
  scope := v_row.scope;
  return next;
end;
$$;

revoke all on function public.exchange_mcp_oauth_code(text, text, text, text) from public;
-- Only service role should call this (Edge Function)
grant execute on function public.exchange_mcp_oauth_code(text, text, text, text) to service_role;
