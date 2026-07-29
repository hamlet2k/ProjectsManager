-- Projects Manager — initial schema, helpers, RLS, triggers
-- Target: Supabase (Postgres 15+)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.share_role as enum ('viewer', 'editor');
create type public.share_status as enum ('pending', 'accepted', 'revoked', 'rejected');
create type public.notification_type as enum (
  'scope_share_invite',
  'scope_share_response'
);
create type public.notification_status as enum ('pending', 'accepted', 'rejected', 'read');
create type public.app_role as enum ('user', 'admin');
create type public.theme_pref as enum ('light', 'dark', 'system');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  name text not null,
  email text unique not null,
  role public.app_role not null default 'user',
  theme public.theme_pref not null default 'system',
  github_integration_enabled boolean not null default false,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_len check (char_length(username) between 2 and 80),
  constraint profiles_name_len check (char_length(name) between 1 and 80)
);

create table public.github_credentials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token_encrypted text not null,
  token_hint text,
  scopes text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scopes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  rank integer not null default 1,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scopes_name_len check (char_length(name) between 1 and 80)
);

create index scopes_owner_id_idx on public.scopes (owner_id);
create index scopes_owner_rank_idx on public.scopes (owner_id, rank);

create table public.scope_shares (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  inviter_id uuid references public.profiles (id) on delete set null,
  role public.share_role not null default 'editor',
  status public.share_status not null default 'pending',
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_id, user_id)
);

create index scope_shares_user_status_idx on public.scope_shares (user_id, status);
create index scope_shares_scope_status_idx on public.scope_shares (scope_id, status);

create table public.scope_invites (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  role public.share_role not null default 'editor',
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint scope_invites_max_uses_positive check (max_uses is null or max_uses > 0)
);

create index scope_invites_scope_id_idx on public.scope_invites (scope_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  parent_task_id uuid references public.tasks (id) on delete cascade,
  owner_id uuid references public.profiles (id) on delete set null,
  name text not null,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  rank integer not null default 0,
  completed boolean not null default false,
  completed_date timestamptz,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_not_self_parent check (parent_task_id is distinct from id),
  constraint tasks_name_not_empty check (char_length(name) >= 1)
);

create index tasks_scope_rank_idx on public.tasks (scope_id, rank);
create index tasks_parent_idx on public.tasks (parent_task_id);
create index tasks_scope_completed_idx on public.tasks (scope_id, completed);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  name text not null,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  unique (scope_id, name),
  constraint tags_name_len check (char_length(name) between 1 and 64)
);

create table public.task_tags (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (task_id, tag_id)
);

create table public.scope_github_configs (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  github_integration_enabled boolean not null default false,
  github_repo_id bigint,
  github_repo_name text,
  github_repo_owner text,
  github_project_id text,
  github_project_name text,
  github_milestone_number integer,
  github_milestone_title text,
  github_label_name text,
  is_shared_repo boolean not null default false,
  source_user_id uuid references public.profiles (id) on delete set null,
  is_detached boolean not null default false,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_id, user_id)
);

create table public.task_github_configs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  github_issue_id bigint,
  github_issue_node_id text,
  github_issue_number integer,
  github_issue_url text,
  github_issue_state text,
  github_repo_id bigint,
  github_repo_name text,
  github_repo_owner text,
  github_project_id text,
  github_project_name text,
  github_milestone_number integer,
  github_milestone_title text,
  github_milestone_due_on timestamptz,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope_id uuid references public.scopes (id) on delete cascade,
  share_id uuid references public.scope_shares (id) on delete set null,
  notification_type public.notification_type not null,
  title text not null,
  message text not null,
  status public.notification_status not null default 'pending',
  requires_action boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  legacy_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz
);

create index notifications_user_status_idx on public.notifications (user_id, status);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create index sync_logs_task_created_idx on public.sync_logs (task_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger github_credentials_set_updated_at
  before update on public.github_credentials
  for each row execute function public.set_updated_at();

create trigger scopes_set_updated_at
  before update on public.scopes
  for each row execute function public.set_updated_at();

create trigger scope_shares_set_updated_at
  before update on public.scope_shares
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create trigger scope_github_configs_set_updated_at
  before update on public.scope_github_configs
  for each row execute function public.set_updated_at();

create trigger task_github_configs_set_updated_at
  before update on public.task_github_configs
  for each row execute function public.set_updated_at();

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth: create profile on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_name text;
begin
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    split_part(new.email, '@', 1)
  );
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    v_username
  );

  -- Ensure unique username
  if exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := v_username || '_' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into public.profiles (id, username, name, email, theme)
  values (
    new.id,
    v_username,
    v_name,
    new.email,
    coalesce((new.raw_user_meta_data ->> 'theme')::public.theme_pref, 'system')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer to avoid recursive policies)
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
    public.is_scope_owner(p_scope_id)
    or exists (
      select 1
      from public.scope_shares ss
      where ss.scope_id = p_scope_id
        and ss.user_id = auth.uid()
        and ss.status = 'accepted'
        and (
          p_min_role = 'viewer'
          or ss.role = 'editor'
        )
    );
$$;

create or replace function public.can_view_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and public.has_scope_access(t.scope_id, 'viewer')
  );
$$;

grant execute on function public.is_scope_owner(uuid) to authenticated;
grant execute on function public.has_scope_access(uuid, public.share_role) to authenticated;
grant execute on function public.can_view_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications for shares
-- ---------------------------------------------------------------------------
create or replace function public.notify_scope_share_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_name text;
  v_inviter_name text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select s.name into v_scope_name from public.scopes s where s.id = new.scope_id;
  select p.name into v_inviter_name from public.profiles p where p.id = new.inviter_id;

  insert into public.notifications (
    user_id, scope_id, share_id, notification_type, title, message,
    status, requires_action, payload
  ) values (
    new.user_id,
    new.scope_id,
    new.id,
    'scope_share_invite',
    'Scope share invitation',
    coalesce(v_inviter_name, 'Someone') || ' invited you to collaborate on "' || coalesce(v_scope_name, 'a scope') || '" as ' || new.role || '.',
    'pending',
    true,
    jsonb_build_object(
      'role', new.role,
      'scope_name', v_scope_name,
      'inviter_id', new.inviter_id
    )
  );
  return new;
end;
$$;

create trigger scope_shares_notify_invite
  after insert on public.scope_shares
  for each row execute function public.notify_scope_share_invite();

create or replace function public.notify_scope_share_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope_name text;
  v_user_name text;
  v_owner_id uuid;
  v_title text;
  v_message text;
begin
  if old.status = new.status then
    return new;
  end if;
  if new.status not in ('accepted', 'rejected') then
    return new;
  end if;

  select s.name, s.owner_id into v_scope_name, v_owner_id
  from public.scopes s where s.id = new.scope_id;
  select p.name into v_user_name from public.profiles p where p.id = new.user_id;

  if new.status = 'accepted' then
    v_title := 'Share accepted';
    v_message := coalesce(v_user_name, 'A user') || ' accepted your invitation to "' || coalesce(v_scope_name, 'a scope') || '".';
  else
    v_title := 'Share declined';
    v_message := coalesce(v_user_name, 'A user') || ' declined your invitation to "' || coalesce(v_scope_name, 'a scope') || '".';
  end if;

  -- Notify owner (and inviter if different)
  insert into public.notifications (
    user_id, scope_id, share_id, notification_type, title, message,
    status, requires_action, payload
  ) values (
    v_owner_id,
    new.scope_id,
    new.id,
    'scope_share_response',
    v_title,
    v_message,
    'pending',
    false,
    jsonb_build_object('status', new.status, 'user_id', new.user_id)
  );

  if new.inviter_id is not null and new.inviter_id is distinct from v_owner_id then
    insert into public.notifications (
      user_id, scope_id, share_id, notification_type, title, message,
      status, requires_action, payload
    ) values (
      new.inviter_id,
      new.scope_id,
      new.id,
      'scope_share_response',
      v_title,
      v_message,
      'pending',
      false,
      jsonb_build_object('status', new.status, 'user_id', new.user_id)
    );
  end if;

  -- Resolve related invite notifications for the invitee
  update public.notifications n
  set status = case when new.status = 'accepted' then 'accepted'::public.notification_status else 'rejected'::public.notification_status end,
      resolved_at = now(),
      read_at = coalesce(n.read_at, now())
  where n.share_id = new.id
    and n.user_id = new.user_id
    and n.notification_type = 'scope_share_invite'
    and n.resolved_at is null;

  return new;
end;
$$;

create trigger scope_shares_notify_response
  after update of status on public.scope_shares
  for each row execute function public.notify_scope_share_response();

-- Accept invite by token (callable by authenticated users)
create or replace function public.accept_scope_invite(p_token text)
returns public.scope_shares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.scope_invites%rowtype;
  v_share public.scope_shares%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.scope_invites i
  where i.token = p_token
  for update;

  if not found then
    raise exception 'Invalid invite token';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'Invite has been revoked';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'Invite has expired';
  end if;
  if v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses then
    raise exception 'Invite has reached maximum uses';
  end if;
  if public.is_scope_owner(v_invite.scope_id) then
    raise exception 'You already own this scope';
  end if;

  insert into public.scope_shares (scope_id, user_id, inviter_id, role, status)
  values (v_invite.scope_id, v_uid, v_invite.created_by, v_invite.role, 'accepted')
  on conflict (scope_id, user_id) do update
    set role = excluded.role,
        status = 'accepted',
        inviter_id = coalesce(public.scope_shares.inviter_id, excluded.inviter_id),
        updated_at = now()
  returning * into v_share;

  update public.scope_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_share;
end;
$$;

grant execute on function public.accept_scope_invite(text) to authenticated;

-- Profile lookup for invites (limited fields)
create or replace function public.search_profiles(p_query text)
returns table (
  id uuid,
  username text,
  name text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.name, p.email
  from public.profiles p
  where p.id <> auth.uid()
    and (
      p.username ilike '%' || p_query || '%'
      or p.email ilike '%' || p_query || '%'
      or p.name ilike '%' || p_query || '%'
    )
  order by p.username
  limit 20;
$$;

grant execute on function public.search_profiles(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.github_credentials enable row level security;
alter table public.scopes enable row level security;
alter table public.scope_shares enable row level security;
alter table public.scope_invites enable row level security;
alter table public.tasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.scope_github_configs enable row level security;
alter table public.task_github_configs enable row level security;
alter table public.notifications enable row level security;
alter table public.sync_logs enable row level security;

-- profiles
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
         or (ss.user_id = profiles.id and ss.status in ('pending', 'accepted') and public.is_scope_owner(ss.scope_id))
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- github_credentials: no client access (service role / edge functions only)
-- intentionally no policies for authenticated

-- scopes
create policy scopes_select on public.scopes
  for select to authenticated
  using (public.has_scope_access(id, 'viewer'));

create policy scopes_insert on public.scopes
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy scopes_update on public.scopes
  for update to authenticated
  using (public.is_scope_owner(id))
  with check (public.is_scope_owner(id));

create policy scopes_delete on public.scopes
  for delete to authenticated
  using (public.is_scope_owner(id));

-- scope_shares
create policy scope_shares_select on public.scope_shares
  for select to authenticated
  using (
    public.is_scope_owner(scope_id)
    or user_id = auth.uid()
  );

create policy scope_shares_insert on public.scope_shares
  for insert to authenticated
  with check (
    public.is_scope_owner(scope_id)
    and inviter_id = auth.uid()
    and user_id <> auth.uid()
  );

create policy scope_shares_update on public.scope_shares
  for update to authenticated
  using (
    public.is_scope_owner(scope_id)
    or user_id = auth.uid()
  )
  with check (
    public.is_scope_owner(scope_id)
    or user_id = auth.uid()
  );

create policy scope_shares_delete on public.scope_shares
  for delete to authenticated
  using (public.is_scope_owner(scope_id));

-- scope_invites
create policy scope_invites_select on public.scope_invites
  for select to authenticated
  using (public.is_scope_owner(scope_id));

create policy scope_invites_insert on public.scope_invites
  for insert to authenticated
  with check (
    public.is_scope_owner(scope_id)
    and created_by = auth.uid()
  );

create policy scope_invites_update on public.scope_invites
  for update to authenticated
  using (public.is_scope_owner(scope_id))
  with check (public.is_scope_owner(scope_id));

create policy scope_invites_delete on public.scope_invites
  for delete to authenticated
  using (public.is_scope_owner(scope_id));

-- tasks
create policy tasks_select on public.tasks
  for select to authenticated
  using (public.has_scope_access(scope_id, 'viewer'));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.has_scope_access(scope_id, 'editor')
    and (owner_id is null or owner_id = auth.uid())
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.has_scope_access(scope_id, 'editor'))
  with check (public.has_scope_access(scope_id, 'editor'));

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    public.is_scope_owner(scope_id)
    or owner_id = auth.uid()
  );

-- tags
create policy tags_select on public.tags
  for select to authenticated
  using (public.has_scope_access(scope_id, 'viewer'));

create policy tags_insert on public.tags
  for insert to authenticated
  with check (public.has_scope_access(scope_id, 'editor'));

create policy tags_update on public.tags
  for update to authenticated
  using (public.has_scope_access(scope_id, 'editor'))
  with check (public.has_scope_access(scope_id, 'editor'));

create policy tags_delete on public.tags
  for delete to authenticated
  using (public.has_scope_access(scope_id, 'editor'));

-- task_tags
create policy task_tags_select on public.task_tags
  for select to authenticated
  using (public.can_view_task(task_id));

create policy task_tags_insert on public.task_tags
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.has_scope_access(t.scope_id, 'editor')
    )
    and exists (
      select 1 from public.tags g
      join public.tasks t on t.id = task_id
      where g.id = tag_id and g.scope_id = t.scope_id
    )
  );

create policy task_tags_delete on public.task_tags
  for delete to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id and public.has_scope_access(t.scope_id, 'editor')
    )
  );

-- scope_github_configs: own row if can view scope
create policy scope_github_configs_select on public.scope_github_configs
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.has_scope_access(scope_id, 'viewer')
  );

create policy scope_github_configs_insert on public.scope_github_configs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_scope_access(scope_id, 'viewer')
  );

create policy scope_github_configs_update on public.scope_github_configs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy scope_github_configs_delete on public.scope_github_configs
  for delete to authenticated
  using (user_id = auth.uid());

-- task_github_configs
create policy task_github_configs_select on public.task_github_configs
  for select to authenticated
  using (
    user_id = auth.uid()
    and public.can_view_task(task_id)
  );

create policy task_github_configs_insert on public.task_github_configs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_task(task_id)
  );

create policy task_github_configs_update on public.task_github_configs
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy task_github_configs_delete on public.task_github_configs
  for delete to authenticated
  using (user_id = auth.uid());

-- notifications
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- sync_logs
create policy sync_logs_select on public.sync_logs
  for select to authenticated
  using (public.can_view_task(task_id));

create policy sync_logs_insert on public.sync_logs
  for insert to authenticated
  with check (
    public.can_view_task(task_id)
    and (user_id is null or user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.scopes;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.task_tags;
alter publication supabase_realtime add table public.scope_shares;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.scope_github_configs;
alter publication supabase_realtime add table public.task_github_configs;
