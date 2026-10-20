-- Rename project_description → project_brief (run in Supabase SQL editor).
alter table public.user_projects
  rename column project_description to project_brief;
