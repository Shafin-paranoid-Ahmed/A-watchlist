-- Run in Supabase: SQL Editor → New query → Run
-- Your Node server uses SUPABASE_SERVICE_ROLE_KEY only (never expose in the browser).

create table if not exists public.watchlists (
  profile_slug text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- No RLS: only your backend calls Supabase with the service role key.
alter table public.watchlists disable row level security;
