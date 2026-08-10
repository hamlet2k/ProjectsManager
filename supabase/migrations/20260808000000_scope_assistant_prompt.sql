-- Per-project AI context for the voice/text assistant.

alter table public.scopes
  add column if not exists assistant_prompt text;

comment on column public.scopes.assistant_prompt is
  'Optional project-specific instructions for the assistant (terminology, stores, workflow).';
