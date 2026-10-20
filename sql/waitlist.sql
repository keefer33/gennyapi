-- Run in Supabase SQL editor.
-- Public inserts go through gennyapi service role only (no RLS policies).

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null unique
);

alter table public.waitlist enable row level security;
