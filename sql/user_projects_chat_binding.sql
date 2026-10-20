-- Run in Supabase SQL editor after clearing user_models_chats (and with empty user_projects).
-- Adds chat scope + project.chat_id binding.

-- Chats: required scope for agent vs project conversations
alter table public.user_models_chats
  add column if not exists scope text not null default 'agent';

alter table public.user_models_chats
  drop constraint if exists user_models_chats_scope_check;

alter table public.user_models_chats
  add constraint user_models_chats_scope_check
  check (scope in ('agent', 'project'));

create index if not exists user_models_chats_user_id_scope_updated_at_idx
  on public.user_models_chats (user_id, scope, updated_at desc);

-- Projects: required chat_id (table must be empty or already have values)
alter table public.user_projects
  add column if not exists chat_id uuid;

-- Enforce NOT NULL + FK once column exists (safe when table is empty)
alter table public.user_projects
  alter column chat_id set not null;

alter table public.user_projects
  drop constraint if exists user_projects_chat_id_fkey;

alter table public.user_projects
  add constraint user_projects_chat_id_fkey
  foreign key (chat_id) references public.user_models_chats (id);
