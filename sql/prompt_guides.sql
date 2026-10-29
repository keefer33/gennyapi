-- Run in Supabase SQL editor to add prompting-guide markdown on brands and gen_models.
-- Model prompt_guide overrides the brand guide when both are set.

alter table public.brands
  add column if not exists prompt_guide text;

alter table public.gen_models
  add column if not exists prompt_guide text;
