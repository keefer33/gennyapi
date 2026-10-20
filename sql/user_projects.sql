-- Run in Supabase SQL editor to create the Projects table.
-- If public.set_updated_at() already exists, you can skip the function block
-- and keep only the table, index, and trigger.

-- Prefer creating user_models_chats.scope first (see user_projects_chat_binding.sql),
-- then create projects with chat_id. If the table already exists without chat_id,
-- run user_projects_chat_binding.sql instead of this create.
create table public.user_projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_name text not null,
  project_brief text not null,
  metadata jsonb not null default '{}'::jsonb,
  chat_id uuid not null references public.user_models_chats (id)
);

create index user_projects_user_id_created_at_idx
  on public.user_projects (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_projects_set_updated_at on public.user_projects;
create trigger user_projects_set_updated_at
  before update on public.user_projects
  for each row execute function public.set_updated_at();

-- RLS: authenticated users can CRUD only their own rows
alter table public.user_projects enable row level security;

drop policy if exists "user_projects_select_own" on public.user_projects;
create policy "user_projects_select_own"
  on public.user_projects
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_projects_insert_own" on public.user_projects;
create policy "user_projects_insert_own"
  on public.user_projects
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_projects_update_own" on public.user_projects;
create policy "user_projects_update_own"
  on public.user_projects
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_projects_delete_own" on public.user_projects;
create policy "user_projects_delete_own"
  on public.user_projects
  for delete
  to authenticated
  using (auth.uid() = user_id);
