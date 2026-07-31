-- App-native task blockers (blocked_by). Optional GitHub sync when both tasks have issues.
-- Semantics: blocker_task_id blocks blocked_task_id (same as GitHub "blocked by").

create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references public.scopes (id) on delete cascade,
  blocked_task_id uuid not null references public.tasks (id) on delete cascade,
  blocker_task_id uuid not null references public.tasks (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_dependencies_no_self check (blocked_task_id <> blocker_task_id),
  constraint task_dependencies_unique unique (blocked_task_id, blocker_task_id)
);

create index if not exists task_dependencies_scope_idx
  on public.task_dependencies (scope_id);
create index if not exists task_dependencies_blocked_idx
  on public.task_dependencies (blocked_task_id);
create index if not exists task_dependencies_blocker_idx
  on public.task_dependencies (blocker_task_id);

comment on table public.task_dependencies is
  'Task A (blocked) is blocked by task B (blocker). Mirrors GitHub issue blocked_by.';

alter table public.task_dependencies enable row level security;

create policy task_dependencies_select on public.task_dependencies
  for select to authenticated
  using (public.has_scope_access(scope_id, 'viewer'));

create policy task_dependencies_insert on public.task_dependencies
  for insert to authenticated
  with check (
    public.has_scope_access(scope_id, 'editor')
    and exists (
      select 1 from public.tasks t
      where t.id = blocked_task_id and t.scope_id = scope_id
    )
    and exists (
      select 1 from public.tasks t
      where t.id = blocker_task_id and t.scope_id = scope_id
    )
  );

create policy task_dependencies_delete on public.task_dependencies
  for delete to authenticated
  using (public.has_scope_access(scope_id, 'editor'));

grant select, insert, delete on public.task_dependencies to authenticated;
