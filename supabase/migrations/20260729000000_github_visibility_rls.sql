-- I1: Allow scope members to SEE GitHub bindings/links even if not the configuring user.
-- Mutations remain limited to own rows (existing policies).

-- scope_github_configs: any viewer of the scope can read all configs for that scope
drop policy if exists scope_github_configs_select on public.scope_github_configs;
create policy scope_github_configs_select on public.scope_github_configs
  for select to authenticated
  using (public.has_scope_access(scope_id, 'viewer'));

-- task_github_configs: any viewer of the task can read all links for that task
drop policy if exists task_github_configs_select on public.task_github_configs;
create policy task_github_configs_select on public.task_github_configs
  for select to authenticated
  using (public.can_view_task(task_id));

-- Optional: per-scope "close issue when task completed" (defaults false)
alter table public.scope_github_configs
  add column if not exists close_issue_on_complete boolean not null default false;
