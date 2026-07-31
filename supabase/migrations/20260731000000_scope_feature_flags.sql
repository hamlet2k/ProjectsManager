-- Project-level feature flags for simple vs power UX.
-- Defaults true preserve current behavior for existing projects.

alter table public.scopes
  add column if not exists dependencies_enabled boolean not null default true;

alter table public.scopes
  add column if not exists advanced_export_enabled boolean not null default true;

comment on column public.scopes.dependencies_enabled is
  'When false, hide app dependency chrome (pills, manage UI). Existing edges are kept.';

comment on column public.scopes.advanced_export_enabled is
  'When false, row/group copy is plain text; Import/Export modal remains available for power tools.';
