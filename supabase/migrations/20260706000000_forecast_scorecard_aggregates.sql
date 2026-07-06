-- supabase/migrations/20260706000000_forecast_scorecard_aggregates.sql
--
-- Revenue Forecasting & Rep Scorecards: read-only SQL rollups.
--
-- WHY SQL (ORR-103 landmine): computing these totals in app-code over a plain
-- `SELECT ... FROM opportunities` is unsafe — PostgREST caps result sets at
-- max_rows (1000) in an unspecified order, so at scale the forecast/scorecard
-- would silently sum a truncated subset. Each function below returns AT MOST one
-- row per (dimension × currency) group, so the row count is bounded by
-- #periods/#stages/#owners × #currencies, never by #opportunities.
--
-- RLS + CONFIDENTIAL TIER: every function is SECURITY INVOKER (the default) and
-- queries the BASE public.opportunities table directly — never a view. So the
-- caller's opportunity RLS (including the Confidential-tier admin fence via
-- opportunity_is_confidential()) is applied per-row BEFORE aggregation. A
-- Confidential deal the caller cannot see is filtered out of the scan, so it can
-- never leak into another user's forecast, committed, revenue-curve, or scorecard
-- totals. See supabase/tests/forecast_scorecard_aggregates.test.sql.
--
-- FX: these functions aggregate per (dimension, CURRENCY) — they never sum mixed
-- currencies. The data layer converts each per-currency subtotal into the
-- viewer's reporting currency through the existing FX path (lib/data/metrics.ts
-- fetchAndConvert → lib/money/convert.ts) and only then sums across currencies.
--
-- All functions are STABLE, read-only, and idempotent (CREATE OR REPLACE).

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. forecast_pipeline_agg — weighted forecast + committed (won), by period/stage/currency
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per (period, stage, currency). Covers OPEN deals (weighted forecast /
-- open pipeline) and closed_won deals (committed). closed_lost is excluded — it
-- contributes to neither forecast nor committed. Period is bucketed from
-- close_date against the quarter boundaries passed by the caller (boundaries are
-- resolved in the data layer so the quarter math lives in ONE place).
--   • weighted_amount — Σ(amount × probability_pct/100) for OPEN rows only.
--   • gross_amount    — Σ(amount): open pipeline value (open rows) or committed
--                       value (closed_won rows), disambiguated by `stage`.
CREATE OR REPLACE FUNCTION public.forecast_pipeline_agg(
  p_this_quarter_start date,
  p_this_quarter_end   date,
  p_next_quarter_end   date
)
RETURNS TABLE (
  period          text,
  stage           text,
  currency        text,
  weighted_amount numeric,
  gross_amount    numeric,
  deal_count      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN o.close_date >= p_this_quarter_start AND o.close_date < p_this_quarter_end THEN 'this_quarter'
      WHEN o.close_date >= p_this_quarter_end   AND o.close_date < p_next_quarter_end THEN 'next_quarter'
      ELSE 'other'
    END AS period,
    o.stage,
    o.currency,
    sum(coalesce(o.amount, 0) * coalesce(o.probability_pct, 0) / 100.0)
      FILTER (WHERE o.stage NOT IN ('closed_won', 'closed_lost')) AS weighted_amount,
    sum(coalesce(o.amount, 0)) AS gross_amount,
    count(*) AS deal_count
  FROM public.opportunities o
  WHERE o.stage <> 'closed_lost'
  GROUP BY 1, o.stage, o.currency
$$;

COMMENT ON FUNCTION public.forecast_pipeline_agg(date, date, date) IS
  'Revenue forecasting: weighted forecast + committed (won) per (period, stage, currency). SECURITY INVOKER — opportunity RLS/Confidential fence applies. One row per group (bounded by stage×currency), never by deal count.';

REVOKE ALL ON FUNCTION public.forecast_pipeline_agg(date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forecast_pipeline_agg(date, date, date) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. forecast_revenue_curve_agg — monthly recognised revenue, by month/currency
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per (month, currency) from opportunity_revenue_schedule. The JOIN to
-- the base opportunities table (for the currency) is what enforces the
-- Confidential fence under SECURITY INVOKER: a schedule row whose parent
-- opportunity is not visible to the caller is dropped by the JOIN (and by the
-- schedule's own visibility RLS) — double-gated.
CREATE OR REPLACE FUNCTION public.forecast_revenue_curve_agg()
RETURNS TABLE (
  month       date,
  currency    text,
  amount      numeric,
  entry_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    date_trunc('month', s.month)::date AS month,
    o.currency,
    sum(s.amount) AS amount,
    count(*) AS entry_count
  FROM public.opportunity_revenue_schedule s
  JOIN public.opportunities o ON o.id = s.opportunity_id
  GROUP BY 1, o.currency
$$;

COMMENT ON FUNCTION public.forecast_revenue_curve_agg() IS
  'Revenue forecasting: monthly recognised revenue per (month, currency) from opportunity_revenue_schedule. SECURITY INVOKER — the JOIN to base opportunities enforces RLS/Confidential. One row per month×currency.';

REVOKE ALL ON FUNCTION public.forecast_revenue_curve_agg() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forecast_revenue_curve_agg() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. rep_scorecard_agg — per-owner pipeline/win/cycle, by owner/currency
-- ═══════════════════════════════════════════════════════════════════════════════
-- One row per (owner_user_id, currency). Money measures (open/weighted/won) are
-- per-currency so the data layer can FX-normalise before summing. Count and
-- cycle-day measures are currency-agnostic and additive across a rep's currency
-- groups (win rate = Σwon/(Σwon+Σlost); avg cycle = Σcycle_days/Σwon), so the
-- data layer folds them per owner.
--   • open_amount / weighted_amount — point-in-time, OPEN deals only.
--   • won_amount / won_count / lost_count / cycle_days_sum — restricted to deals
--     CLOSED (by close_date) within [p_period_start, p_period_end).
--   • cycle_days_sum — Σ(close_date − created_at::date) for won-in-period deals.
CREATE OR REPLACE FUNCTION public.rep_scorecard_agg(
  p_period_start date,
  p_period_end   date
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
  GROUP BY o.owner_user_id, u.full_name, o.currency
$$;

COMMENT ON FUNCTION public.rep_scorecard_agg(date, date) IS
  'Rep scorecards: per (owner, currency) open/weighted pipeline + won/lost/cycle within a period. SECURITY INVOKER — opportunity RLS/Confidential fence applies, so a rep never sees Confidential deals they are not on in the aggregate. One row per owner×currency.';

REVOKE ALL ON FUNCTION public.rep_scorecard_agg(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rep_scorecard_agg(date, date) TO authenticated, service_role;
