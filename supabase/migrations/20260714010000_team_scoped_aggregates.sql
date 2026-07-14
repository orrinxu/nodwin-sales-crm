-- ═══════════════════════════════════════════════════════════════════════════════
-- ORR-722 — Team-scoped dashboard aggregates (leaderboard + conversion funnel).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- The dashboard "Team" tab should aggregate over the viewer's REPORTING LINE
-- (ratified D3: My-Team = manager chain), not over everything RLS lets them see.
-- Without this, an admin/exec's Team tab shows the whole company; a mid-level
-- manager's is already narrowed by RLS but only accidentally.
--
-- team_member_ids(root): the recursive report subtree (root + everyone who rolls
-- up to them through users.manager_user_id). SECURITY DEFINER so it can resolve
-- the org chart regardless of RLS on `users` — this is safe because it only ever
-- returns USER IDS (reporting structure, not deal data), and the aggregates that
-- consume it stay SECURITY INVOKER, so opportunity RLS + the Confidential fence
-- still gate every deal that is actually counted.
--
-- The aggregates gain a `p_team_only` flag rather than a manager-id argument: the
-- team is always resolved from auth.uid(), so a caller can only ever scope to
-- THEIR OWN line — no enumerating another manager's reports.

CREATE OR REPLACE FUNCTION public.team_member_ids(_root uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE subtree AS (
    SELECT _root AS id
    UNION
    SELECT u.id
    FROM public.users u
    JOIN subtree s ON u.manager_user_id = s.id
  )
  SELECT id FROM subtree;
$$;

COMMENT ON FUNCTION public.team_member_ids(uuid) IS
  'ORR-722: the reporting subtree of a user (self + all recursive direct reports '
  'via users.manager_user_id). SECURITY DEFINER to resolve the org chart; returns '
  'only user ids, never deal data — the aggregates that use it stay INVOKER.';

REVOKE ALL ON FUNCTION public.team_member_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_member_ids(uuid) TO authenticated, service_role;

-- ── conversion_funnel_agg: add optional team-only narrowing ──────────────────
-- Recreated (not CREATE OR REPLACE) because the signature gains a parameter.
DROP FUNCTION IF EXISTS public.conversion_funnel_agg();

CREATE FUNCTION public.conversion_funnel_agg(p_team_only boolean DEFAULT false)
RETURNS TABLE (
  stage      text,
  deal_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.stage::text AS stage,
    count(*)      AS deal_count
  FROM public.opportunities o
  WHERE (
    NOT p_team_only
    OR o.owner_user_id IN (SELECT public.team_member_ids(auth.uid()))
  )
  GROUP BY o.stage
$$;

COMMENT ON FUNCTION public.conversion_funnel_agg(boolean) IS
  'Conversion-by-Stage funnel: current deal count per stage (≤ 7 rows). SECURITY '
  'INVOKER — opportunity RLS/Confidential fence applies before the count. '
  'p_team_only narrows to the caller''s reporting subtree (team_member_ids), '
  'still on top of RLS so it can only ever remove rows, never add them.';

REVOKE ALL ON FUNCTION public.conversion_funnel_agg(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversion_funnel_agg(boolean) TO authenticated, service_role;

-- ── rep_scorecard_agg: add optional team-only narrowing ──────────────────────
DROP FUNCTION IF EXISTS public.rep_scorecard_agg(date, date);

CREATE FUNCTION public.rep_scorecard_agg(
  p_period_start date,
  p_period_end   date,
  p_team_only    boolean DEFAULT false
)
RETURNS TABLE (
  owner_user_id   uuid,
  owner_name      text,
  currency        text,
  open_amount     numeric,
  weighted_amount numeric,
  won_amount      numeric,
  won_count       bigint,
  lost_count      bigint,
  cycle_days_sum  numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.owner_user_id,
    u.full_name AS owner_name,
    o.currency,
    sum(coalesce(o.amount, 0))
      FILTER (WHERE o.stage NOT IN ('closed_won', 'closed_lost')) AS open_amount,
    sum(coalesce(o.amount, 0) * coalesce(o.probability_pct, 0) / 100.0)
      FILTER (WHERE o.stage NOT IN ('closed_won', 'closed_lost')) AS weighted_amount,
    sum(coalesce(o.amount, 0))
      FILTER (WHERE o.stage = 'closed_won'
                AND o.close_date >= p_period_start AND o.close_date < p_period_end) AS won_amount,
    count(*)
      FILTER (WHERE o.stage = 'closed_won'
                AND o.close_date >= p_period_start AND o.close_date < p_period_end) AS won_count,
    count(*)
      FILTER (WHERE o.stage = 'closed_lost'
                AND o.close_date >= p_period_start AND o.close_date < p_period_end) AS lost_count,
    sum(o.close_date - o.created_at::date)
      FILTER (WHERE o.stage = 'closed_won' AND o.close_date IS NOT NULL
                AND o.close_date >= p_period_start AND o.close_date < p_period_end) AS cycle_days_sum
  FROM public.opportunities o
  LEFT JOIN public.users u ON u.id = o.owner_user_id
  WHERE (
    NOT p_team_only
    OR o.owner_user_id IN (SELECT public.team_member_ids(auth.uid()))
  )
  GROUP BY o.owner_user_id, u.full_name, o.currency
$$;

COMMENT ON FUNCTION public.rep_scorecard_agg(date, date, boolean) IS
  'Rep scorecards: per (owner, currency) open/weighted pipeline + won/lost/cycle '
  'within a period. SECURITY INVOKER — opportunity RLS/Confidential fence applies. '
  'p_team_only narrows to the caller''s reporting subtree (team_member_ids).';

REVOKE ALL ON FUNCTION public.rep_scorecard_agg(date, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rep_scorecard_agg(date, date, boolean) TO authenticated, service_role;
