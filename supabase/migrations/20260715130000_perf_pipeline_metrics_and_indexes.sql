-- supabase/migrations/20260715130000_perf_pipeline_metrics_and_indexes.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Performance batch (audit 2026-07-16):
--   1. pipeline_metrics_agg() — a bounded GROUP BY replacement for the unbounded
--      `SELECT ... FROM opportunities` that getPipelineMetrics / getPipelineSummary
--      previously fetched and reduced in JS. Past 1000 rows PostgREST silently
--      truncated that fetch, so the headline dashboard numbers under-reported.
--      SECURITY INVOKER, so the same per-row RLS applies; grouped by (stage,
--      currency) and folded through fetchAndConvert (asOf = today), exactly like
--      forecast_pipeline_agg.
--   5. idx_opportunities_updated_at — the default sort of the main opportunities
--      list (getOpportunities) and the dashboard recent-deals top-N had no
--      supporting index; every list render sorted the full visible set.
--
-- Idempotent: safe to re-run.

-- ── 1. Pipeline metrics aggregate ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pipeline_metrics_agg()
RETURNS TABLE (
  stage        text,
  currency     text,
  gross_amount numeric,
  deal_count   bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.stage,
    o.currency,
    sum(coalesce(o.amount, 0)) AS gross_amount,
    count(*)                   AS deal_count
  FROM public.opportunities o
  GROUP BY o.stage, o.currency
$$;

COMMENT ON FUNCTION public.pipeline_metrics_agg() IS
  'Per-(stage,currency) deal count + gross amount over RLS-visible opportunities. Bounded replacement for the unbounded JS aggregate in getPipelineMetrics/getPipelineSummary.';

REVOKE ALL ON FUNCTION public.pipeline_metrics_agg() FROM public;
GRANT EXECUTE ON FUNCTION public.pipeline_metrics_agg() TO authenticated;

-- ── 5. Indexes on the opportunities list sort key ────────────────────────────
-- The main list orders by updated_at DESC (getOpportunities) and the dashboard
-- recent-deals reads updated_at DESC LIMIT n.
CREATE INDEX IF NOT EXISTS idx_opportunities_updated_at
  ON public.opportunities (updated_at DESC);

-- "My deals" filters owner_user_id then sorts by updated_at.
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_updated
  ON public.opportunities (owner_user_id, updated_at DESC);
