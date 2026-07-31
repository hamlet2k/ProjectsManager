-- Cache GitHub "blocked by" dependencies on task issue links (issue #11 / P2).
alter table public.task_github_configs
  add column if not exists github_blocked_by jsonb not null default '[]'::jsonb;

comment on column public.task_github_configs.github_blocked_by is
  'Array of {number,title,html_url,state,repo?} from GET .../dependencies/blocked_by';
