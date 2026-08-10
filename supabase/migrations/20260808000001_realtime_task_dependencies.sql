-- Ensure dependency table is in Realtime publication (may already exist on some envs).
do $$
begin
  alter publication supabase_realtime add table public.task_dependencies;
exception
  when duplicate_object then null;
  when undefined_table then null;
end $$;
