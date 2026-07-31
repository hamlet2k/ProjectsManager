-- I4 + issue #35 adapted: GitHub binding change notifications
-- and helpers for user/project-level enable/disable.

-- New notification type (idempotent-ish: ignore if already present)
do $$
begin
  alter type public.notification_type add value if not exists 'github_binding_changed';
exception
  when duplicate_object then null;
end $$;

-- Notify other project members when GitHub repo binding changes / is cleared
create or replace function public.notify_github_binding_change(
  p_scope_id uuid,
  p_title text,
  p_message text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_scope_access(p_scope_id, 'editor') then
    raise exception 'forbidden';
  end if;

  insert into public.notifications (
    user_id, scope_id, notification_type, title, message, status, requires_action, payload
  )
  select distinct
    m.user_id,
    p_scope_id,
    'github_binding_changed'::public.notification_type,
    p_title,
    p_message,
    'pending'::public.notification_status,
    false,
    coalesce(p_payload, '{}'::jsonb)
  from (
    select s.owner_id as user_id
    from public.scopes s
    where s.id = p_scope_id
    union
    select ss.user_id
    from public.scope_shares ss
    where ss.scope_id = p_scope_id
      and ss.status = 'accepted'
  ) m
  where m.user_id is not null
    and m.user_id is distinct from uid;
end;
$$;

revoke all on function public.notify_github_binding_change(uuid, text, text, jsonb) from public;
grant execute on function public.notify_github_binding_change(uuid, text, text, jsonb) to authenticated;

-- Disable all of the current user's project GitHub bindings (keep repo fields for re-enable)
create or replace function public.disable_my_github_scope_configs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.scope_github_configs
  set github_integration_enabled = false,
      updated_at = now()
  where user_id = uid
    and github_integration_enabled = true;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.disable_my_github_scope_configs() from public;
grant execute on function public.disable_my_github_scope_configs() to authenticated;

-- Soft-disable every binding on a project (one-repo model: project no longer integrated)
create or replace function public.disable_scope_github_binding(p_scope_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_scope_access(p_scope_id, 'editor') then
    raise exception 'forbidden';
  end if;

  update public.scope_github_configs
  set github_integration_enabled = false,
      updated_at = now()
  where scope_id = p_scope_id
    and github_integration_enabled = true;
end;
$$;

revoke all on function public.disable_scope_github_binding(uuid) from public;
grant execute on function public.disable_scope_github_binding(uuid) to authenticated;
