-- supabase/migrations/20260712010000_user_public_profile.sql
-- Colleague Profile Page (ORR-678) — read-only internal-user profiles.
-- HIGH-RISK FILE — see AGENTS.md §6 (identity + RLS).
--
-- Adds the public-profile fields the profile page shows (free-text position +
-- Slack deep-link identifiers) and a SECURITY DEFINER accessor that exposes ONLY
-- the public profile columns of ANY user to any authenticated colleague.
--
-- WHY a function instead of loosening the users SELECT RLS policy:
--   The users SELECT policy is ROW-level, so a blanket `USING (true)` would leak
--   EVERY column (ai_daily_*_cap_usd, crm_inbound_email, custom_data,
--   manager_user_id, …) org-wide — not just the public profile fields.
--   get_user_public_profile() returns a FIXED public column set, giving
--   all-authenticated read of public fields without widening exposure of the
--   sensitive columns. The base-table RLS (users_select_self_and_same_entity)
--   is left UNCHANGED, so direct table reads keep their same-entity scope.
--
-- Idempotent throughout (IF NOT EXISTS / CREATE OR REPLACE).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Public profile columns
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS "position"      text,
  ADD COLUMN IF NOT EXISTS slack_member_id text,
  ADD COLUMN IF NOT EXISTS slack_team_id   text;

COMMENT ON COLUMN public.users."position" IS
  'Free-text job title / position, shown on the read-only colleague profile page.';
COMMENT ON COLUMN public.users.slack_member_id IS
  'Slack member ID (U0…) used to build slack.com/app_redirect DM deep links. '
  'NULL = no Slack action rendered (never fabricate a link from a handle).';
COMMENT ON COLUMN public.users.slack_team_id IS
  'Slack workspace/team ID (T0…), optional; feeds the slack:// desktop-scheme '
  'variant in multi-workspace setups.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Public-profile accessor (all-authenticated read of the public fields only)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_public_profile(target_user_id uuid)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  "position"      text,
  email           text,
  slack_member_id text,
  slack_team_id   text,
  entity_id       uuid,
  entity_name     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u."position",
    u.email,
    u.slack_member_id,
    u.slack_team_id,
    u.primary_entity_id,
    COALESCE(e.display_name, e.name)
  FROM public.users u
  LEFT JOIN public.entities e ON e.id = u.primary_entity_id
  WHERE u.id = target_user_id;
$$;

COMMENT ON FUNCTION public.get_user_public_profile(uuid) IS
  'Read-only PUBLIC profile of any user for the colleague profile page (ORR-678). '
  'SECURITY DEFINER so any authenticated colleague can read the fixed public column '
  'set (name/position/entity/email/slack) without the base-table RLS having to '
  'expose sensitive columns. Returns 0 rows for an unknown id.';

-- Only signed-in users may call it. Revoke from PUBLIC *and* anon explicitly:
-- Supabase's platform default privileges grant EXECUTE on new public functions
-- to anon/authenticated/service_role, and REVOKE FROM PUBLIC does NOT remove
-- that explicit anon grant — so anon must be revoked by name.
REVOKE ALL ON FUNCTION public.get_user_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_public_profile(uuid) TO authenticated;
