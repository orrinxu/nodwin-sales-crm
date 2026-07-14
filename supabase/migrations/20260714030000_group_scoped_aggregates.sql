-- ═══════════════════════════════════════════════════════════════════════════════
-- ORR-723 — Group-scoped dashboard aggregates (region/exec management rollups).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- The dashboard "Group" tab rolls up deals across a management tier's REGION
-- (regional_head) or the whole GROUP (exec / group_sales_lead), built on the
-- ORR-714 region engine. It mirrors the ORR-722 Team tab, but the scope axis is
-- the deal's selling entity (entity_sales_id → entities.region_id) rather than the
-- owner's manager chain.
--
-- region_entity_ids(caller): the set of entity ids the caller's role can roll up —
-- ALL entities for exec/group_sales_lead, same-region entities for a regional_head
-- (dormant until regions are configured), none otherwise. SECURITY DEFINER so it
-- can resolve the org/region structure regardless of RLS on users/entities; it
-- returns only ENTITY IDS (never deal data), and the aggregates that consume it
-- stay SECURITY INVOKER, so opportunity RLS + the Confidential fence still gate
-- every deal actually counted. The role/region logic mirrors
-- can_view_opportunity_by_role_scope (ORR-714) exactly.
--
-- The aggregates gain a `p_group` flag (never a caller-id argument): the entity
-- set is always resolved from auth.uid(), so a caller can only ever scope to their
-- own region/group — no enumerating another region's deals.

CREATE OR REPLACE FUNCTION public.region_entity_ids(_caller uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.entities e
  WHERE CASE (SELECT cu.primary_role FROM public.users cu WHERE cu.id = _caller)
    -- Group-wide leadership: every entity.
    WHEN 'exec' THEN true
    WHEN 'group_sales_lead' THEN true
    -- Region-wide: entities in the same region as the caller's own entity (both
    -- regions must be set). Dormant until regions are configured.
    WHEN 'regional_head' THEN (
      e.region_id IS NOT NULL
      AND e.region_id = (
        SELECT ce.region_id
        FROM public.users cu2
        JOIN public.entities ce ON ce.id = cu2.primary_entity_id
        WHERE cu2.id = _caller
      )
    )
    ELSE false
  END;
$$;

COMMENT ON FUNCTION public.region_entity_ids(uuid) IS
  'ORR-723: the entity ids a caller''s role can roll up — all entities for '
  'exec/group_sales_lead, same-region entities for a regional_head, else none. '
  'SECURITY DEFINER to resolve region structure; returns only entity ids, never '
  'deal data — the aggregates that use it stay INVOKER. Mirrors ORR-714 role scope.';

REVOKE ALL ON FUNCTION public.region_entity_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.region_entity_ids(uuid) TO authenticated, service_role;

-- ── conversion_funnel_agg: add optional group (region) narrowing ─────────────
-- Recreated (not CREATE OR REPLACE) because the signature gains a parameter.
DROP FUNCTION IF EXISTS public.conversion_funnel_agg(boolean);

CREATE FUNCTION public.conversion_funnel_agg(
  p_team_only boolean DEFAULT false,
  p_group     boolean DEFAULT false
)
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
    (NOT p_team_only AND NOT p_group)
    OR (p_team_only AND o.owner_user_id IN (SELECT public.team_member_ids(auth.uid())))
    OR (p_group AND o.entity_sales_id IN (SELECT public.region_entity_ids(auth.uid())))
  )
  GROUP BY o.stage
$$;

COMMENT ON FUNCTION public.conversion_funnel_agg(boolean, boolean) IS
  'Conversion-by-Stage funnel: current deal count per stage (≤ 7 rows). SECURITY '
  'INVOKER — opportunity RLS/Confidential fence applies before the count. '
  'p_team_only narrows to the caller''s reporting subtree (team_member_ids); '
  'p_group narrows to the caller''s region/group entities (region_entity_ids). '
  'Both sit on top of RLS, so they can only ever remove rows, never add them.';

REVOKE ALL ON FUNCTION public.conversion_funnel_agg(boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversion_funnel_agg(boolean, boolean) TO authenticated, service_role;

-- ── rep_scorecard_agg: add optional group (region) narrowing ─────────────────
DROP FUNCTION IF EXISTS public.rep_scorecard_agg(date, date, boolean);

CREATE FUNCTION public.rep_scorecard_agg(
  p_period_start date,
  p_period_end   date,
  p_team_only    boolean DEFAULT false,
  p_group        boolean DEFAULT false
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
    (NOT p_team_only AND NOT p_group)
    OR (p_team_only AND o.owner_user_id IN (SELECT public.team_member_ids(auth.uid())))
    OR (p_group AND o.entity_sales_id IN (SELECT public.region_entity_ids(auth.uid())))
  )
  GROUP BY o.owner_user_id, u.full_name, o.currency
$$;

COMMENT ON FUNCTION public.rep_scorecard_agg(date, date, boolean, boolean) IS
  'Rep scorecards: per (owner, currency) open/weighted pipeline + won/lost/cycle '
  'within a period. SECURITY INVOKER — opportunity RLS/Confidential fence applies. '
  'p_team_only narrows to the reporting subtree; p_group narrows to the caller''s '
  'region/group entities (region_entity_ids).';

REVOKE ALL ON FUNCTION public.rep_scorecard_agg(date, date, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rep_scorecard_agg(date, date, boolean, boolean) TO authenticated, service_role;
