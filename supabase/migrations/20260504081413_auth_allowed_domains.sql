-- supabase/migrations/20260504081413_auth_allowed_domains.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the auth_allowed_domains table used by the Supabase Auth Hook
-- to validate that sign-up email domains are permitted.  The auth hook
-- Edge Function queries this table on every sign-up attempt; without
-- this migration the hook fails with a table-not-found error.

create table if not exists public.auth_allowed_domains (
  id         uuid        primary key default gen_random_uuid(),
  domain     text        not null unique,
  created_at timestamptz not null default now()
);

alter table public.auth_allowed_domains enable row level security;

-- ── RLS policies ─────────────────────────────────────────────────────────────
-- service_role has BYPASSRLS in Supabase by default; these policies are
-- explicit documentation that the operations are intentionally permitted.
-- anon and authenticated receive no policies and are therefore blocked.

-- Drop-and-recreate pattern keeps the migration idempotent on re-runs.
drop policy if exists "service_role_select_auth_allowed_domains"
  on public.auth_allowed_domains;
create policy "service_role_select_auth_allowed_domains"
  on public.auth_allowed_domains
  for select
  to service_role
  using (true);

drop policy if exists "service_role_insert_auth_allowed_domains"
  on public.auth_allowed_domains;
create policy "service_role_insert_auth_allowed_domains"
  on public.auth_allowed_domains
  for insert
  to service_role
  with check (true);

drop policy if exists "service_role_update_auth_allowed_domains"
  on public.auth_allowed_domains;
create policy "service_role_update_auth_allowed_domains"
  on public.auth_allowed_domains
  for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "service_role_delete_auth_allowed_domains"
  on public.auth_allowed_domains;
create policy "service_role_delete_auth_allowed_domains"
  on public.auth_allowed_domains
  for delete
  to service_role
  using (true);

-- ── Seed default permitted domains ───────────────────────────────────────────
insert into public.auth_allowed_domains (domain) values
  ('nodwin.com'),
  ('trinitygaming.in'),
  ('maxlevel.gg')
on conflict (domain) do nothing;
