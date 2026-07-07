-- supabase/migrations/20260707000000_conversion_funnel_agg.sql
--
-- Conversion-by-Stage funnel (SOW §17): a read-only per-stage deal count.
--
-- WHY SQL (ORR-103 landmine): counting deals per stage in app-code over a plain
-- `SELECT stage FROM opportunities` is unsafe — PostgREST caps result sets at
-- max_rows (1000) in an unspecified order, so at scale the funnel would silently
-- count a truncated subset. This function returns AT MOST one row per stage
-- (≤ 7 rows), so the row count is bounded by #stages, never by #opportunities.
--
-- RLS + CONFIDENTIAL TIER: SECURITY INVOKER (the default), querying the BASE
-- public.opportunities table directly — never a view. The caller's opportunity
-- RLS (including the Confidential-tier admin fence via
-- opportunity_is_confidential()) is applied per-row BEFORE the count, so a
-- Confidential deal the caller cannot see never contributes to their funnel.
--
-- No currency dimension: a conversion funnel counts DEALS, not value, so there
-- is no FX to normalise — the count is currency-agnostic. The data layer folds
-- these counts into the cumulative "reached" series (buildConversionFunnel).
--
-- STABLE, read-only, idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.conversion_funnel_agg()
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
  GROUP BY o.stage
$$;

COMMENT ON FUNCTION public.conversion_funnel_agg() IS
  'Conversion-by-Stage funnel: current deal count per stage (≤ 7 rows). SECURITY INVOKER — opportunity RLS/Confidential fence applies before the count, so a caller never sees deals they cannot read in the funnel. One row per stage.';

REVOKE ALL ON FUNCTION public.conversion_funnel_agg() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversion_funnel_agg() TO authenticated, service_role;
