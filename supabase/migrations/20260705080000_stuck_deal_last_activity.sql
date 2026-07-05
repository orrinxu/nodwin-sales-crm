-- supabase/migrations/20260705080000_stuck_deal_last_activity.sql
--
-- ORR-103 (CTO review H1): server-side MAX(activities.created_at) per opportunity
-- for the Stuck Deals widget. Computing the max in app-code over a plain
-- `select opportunity_id, created_at` is unsafe: PostgREST caps result sets at
-- max_rows (1000) in an unspecified order, so at scale the widget would age deals
-- from a truncated/arbitrary activity set and corrupt the staleness signal.
--
-- This aggregate returns AT MOST one row per opportunity, so the row count is
-- bounded by #open-deals, not #activities. SECURITY INVOKER (the default) — RLS
-- on public.activities applies to the caller, so it only sees activities for
-- opportunities they are entitled to (same opportunity_visibility gate). The
-- widget therefore inherits visibility here too; it adds no new access path.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.stuck_deal_last_activity(opp_ids uuid[])
RETURNS TABLE (opportunity_id uuid, last_activity_at timestamptz)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT a.opportunity_id, max(a.created_at)
  FROM public.activities a
  WHERE a.opportunity_id = ANY(opp_ids)
  GROUP BY a.opportunity_id
$$;

COMMENT ON FUNCTION public.stuck_deal_last_activity(uuid[]) IS
  'ORR-103: RLS-safe (SECURITY INVOKER) MAX(activities.created_at) per opportunity for the Stuck Deals staleness signal. One row per opportunity — bounded by deal count, not activity count.';

REVOKE ALL ON FUNCTION public.stuck_deal_last_activity(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stuck_deal_last_activity(uuid[]) TO authenticated, service_role;
