-- Run in Supabase: SQL Editor → New query → Run
-- Your Node server uses SUPABASE_SERVICE_ROLE_KEY only (never expose in the browser).

create table if not exists public.watchlists (
  profile_slug text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: anon/publishable keys get no access through the Data API.
-- The backend uses the service-role/secret key, which bypasses RLS, so the app keeps working.
alter table public.watchlists enable row level security;
