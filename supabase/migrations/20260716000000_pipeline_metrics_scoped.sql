-- supabase/migrations/20260716000000_pipeline_metrics_scoped.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-755 (server-driven list pagination). The opportunities BOARD can't
-- paginate — it shows every deal grouped by stage. Under the server-driven
-- rewrite the board now does a BOUNDED fetch (a capped page of cards), so the
-- per-stage column totals can no longer be summed in JS over the fetched list
-- (that list is truncated). This RPC computes accurate per-(stage,currency)
-- gross / weighted / count over the caller's FULL scoped set, server-side.
--
-- It mirrors pipeline_metrics_agg() from 20260715130000 but honours the same
-- narrowing filters the board's scope presets apply (owner scope, close-date
-- window, selling entity) so the column totals match exactly the set the board
-- represents. SECURITY INVOKER (the default for a plain SQL function), so the
-- identical per-row RLS applies — the filters below can only ever NARROW the
-- RLS-visible set, never widen it. Amounts stay per-currency; FX normalisation
-- into the viewer's reporting currency happens in JS via fetchAndConvert, as
-- with every other money rollup.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.pipeline_metrics_agg_scoped(
  _owner_only boolean DEFAULT false,
  _close_from date    DEFAULT NULL,
  _close_to   date    DEFAULT NULL,
  _entity_id  uuid    DEFAULT NULL
)
RETURNS TABLE (
  stage           text,
  currency        text,
  gross_amount    numeric,
  weighted_amount numeric,
  deal_count      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.stage,
    o.currency,
    sum(coalesce(o.amount, 0))                                        AS gross_amount,
    sum(coalesce(o.amount, 0) * coalesce(o.probability_pct, 0) / 100) AS weighted_amount,
    count(*)                                                          AS deal_count
  FROM public.opportunities o
  WHERE (NOT _owner_only OR o.owner_user_id = auth.uid())
    AND (_close_from IS NULL OR o.close_date >= _close_from)
    AND (_close_to   IS NULL OR o.close_date <= _close_to)
    AND (_entity_id  IS NULL OR o.entity_sales_id = _entity_id)
  GROUP BY o.stage, o.currency
$$;

COMMENT ON FUNCTION public.pipeline_metrics_agg_scoped(boolean, date, date, uuid) IS
  'Per-(stage,currency) deal count + gross + probability-weighted amount over the caller''s RLS-visible opportunities, narrowed by owner scope / close-date window / selling entity. Backs the bounded ORR-755 board totals.';

REVOKE ALL ON FUNCTION public.pipeline_metrics_agg_scoped(boolean, date, date, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pipeline_metrics_agg_scoped(boolean, date, date, uuid) TO authenticated;
