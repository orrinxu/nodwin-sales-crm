-- supabase/migrations/20260716020000_report_and_list_aggregates.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-757 (perf audit): replace the remaining "fetch rows, reduce in JS" rollups
-- that go silently partial past PostgREST's row cap with bounded GROUP BY RPCs.
-- All are SECURITY INVOKER (plain SQL, so the same per-row RLS applies) and group
-- by (dimension, currency) so JS can FX-normalise each bucket through
-- fetchAndConvert — the pipeline_metrics_agg / forecast_pipeline_agg pattern.
--
-- Idempotent: safe to re-run.

-- ── Reports: monthly trends (report page) ────────────────────────────────────
-- getReportData built per-month created/won/won-amount by reducing a .limit(500)
-- fetch — partial past 500 deals. This groups the WHOLE visible set by
-- (created-month, currency). Counts need no FX; won_amount is folded per currency
-- in JS. Month buckets are few (months × currencies) so the result is bounded.
CREATE OR REPLACE FUNCTION public.report_monthly_agg()
RETURNS TABLE (
  month         text,
  currency      text,
  created_count bigint,
  won_count     bigint,
  won_amount    numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    to_char(o.created_at, 'YYYY-MM')                                       AS month,
    o.currency,
    count(*)                                                               AS created_count,
    count(*) FILTER (WHERE o.stage = 'closed_won')                         AS won_count,
    sum(coalesce(o.amount, 0)) FILTER (WHERE o.stage = 'closed_won')       AS won_amount
  FROM public.opportunities o
  GROUP BY 1, o.currency
$$;

COMMENT ON FUNCTION public.report_monthly_agg() IS
  'Per-(created-month, currency) created/won counts + won amount over RLS-visible opportunities. Bounded replacement for the JS monthly-trends reduce in getReportData (ORR-757).';

REVOKE ALL ON FUNCTION public.report_monthly_agg() FROM public;
GRANT EXECUTE ON FUNCTION public.report_monthly_agg() TO authenticated;

-- ── Reports: top accounts by revenue (report page) ───────────────────────────
-- getReportData ranked accounts by reducing the same .limit(500) fetch — partial
-- past 500 deals. Rank accounts by RAW summed amount server-side (a cross-currency
-- approximation, like the ORR-755 list amount sort), keep the top 50 ACCOUNTS
-- (all their per-currency buckets), and let JS FX-convert + re-sort to the top 10.
-- Bounded to the top-50 accounts' buckets regardless of deal count.
CREATE OR REPLACE FUNCTION public.report_top_accounts_agg()
RETURNS TABLE (
  account_id   uuid,
  account_name text,
  currency     text,
  deal_count   bigint,
  gross_amount numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH per AS (
    SELECT
      o.account_id,
      a.name                                                        AS account_name,
      o.currency,
      count(*)                                                      AS deal_count,
      sum(coalesce(o.amount, 0))                                    AS gross_amount,
      sum(sum(coalesce(o.amount, 0))) OVER (PARTITION BY o.account_id) AS acct_total
    FROM public.opportunities o
    JOIN public.accounts a ON a.id = o.account_id
    GROUP BY o.account_id, a.name, o.currency
  ),
  ranked AS (
    SELECT per.*, dense_rank() OVER (ORDER BY acct_total DESC) AS rnk
    FROM per
  )
  SELECT account_id, account_name, currency, deal_count, gross_amount
  FROM ranked
  WHERE rnk <= 50
$$;

COMMENT ON FUNCTION public.report_top_accounts_agg() IS
  'Per-(account, currency) deal count + gross amount for the top 50 accounts by raw revenue (JS FX-converts + narrows to top 10). Bounded replacement for the JS top-accounts reduce in getReportData (ORR-757).';

REVOKE ALL ON FUNCTION public.report_top_accounts_agg() FROM public;
GRANT EXECUTE ON FUNCTION public.report_top_accounts_agg() TO authenticated;

-- ── Accounts: distinct industries (filter dropdown) ──────────────────────────
-- getIndustryOptions built the DISTINCT set with `new Set` over one row per
-- account — partial past the row cap. SELECT DISTINCT does it server-side.
CREATE OR REPLACE FUNCTION public.distinct_account_industries()
RETURNS TABLE (industry text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT a.industry
  FROM public.accounts a
  WHERE a.deleted_at IS NULL
    AND a.industry IS NOT NULL
  ORDER BY a.industry
$$;

COMMENT ON FUNCTION public.distinct_account_industries() IS
  'Distinct non-null industries over RLS-visible, non-deleted accounts. Bounded replacement for the JS Set-over-fetch in getIndustryOptions (ORR-757).';

REVOKE ALL ON FUNCTION public.distinct_account_industries() FROM public;
GRANT EXECUTE ON FUNCTION public.distinct_account_industries() TO authenticated;

-- ── Line-items presence for a set of opportunities (list warning badge) ───────
-- getLineItemsSignals fetched EVERY line-item row for the visible page's opps
-- just to dedupe presence into a Set — can exceed the cap on a large page.
-- DISTINCT opportunity_id returns at most one row per input id.
CREATE OR REPLACE FUNCTION public.opportunities_with_line_items(_ids uuid[])
RETURNS TABLE (opportunity_id uuid)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT li.opportunity_id
  FROM public.opportunity_line_items li
  WHERE li.opportunity_id = ANY(_ids)
$$;

COMMENT ON FUNCTION public.opportunities_with_line_items(uuid[]) IS
  'DISTINCT opportunity ids (from the input set) that have >=1 line item, RLS-scoped. Bounded (<= input size) replacement for the presence Set in getLineItemsSignals (ORR-757).';

REVOKE ALL ON FUNCTION public.opportunities_with_line_items(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.opportunities_with_line_items(uuid[]) TO authenticated;

-- ── Stuck deals: total value at risk (dashboard widget) ──────────────────────
-- totalValueAtRisk was `deals.reduce(sum)` over an unbounded .in(open stages)
-- fetch — partial past the cap. Compute the sum per currency server-side over the
-- WHOLE visible open set, applying the SAME stuck predicate (stale via per-stage
-- threshold on last activity, OR overdue via close_date). Thresholds are passed
-- in as jsonb (the caller already resolves them, DB-first with constant
-- fallbacks). SECURITY INVOKER, so opportunities + activities RLS both apply — a
-- visible deal can never be mis-aged by a hidden activity (mirrors
-- stuck_deal_last_activity). JS folds the per-currency subtotals through
-- fetchAndConvert. NOTE: `floor(days) >= t` (the JS predicate) is equivalent to
-- `days >= t` for the integer thresholds, so no flooring is needed here.
CREATE OR REPLACE FUNCTION public.stuck_deals_value_at_risk(_thresholds jsonb)
RETURNS TABLE (
  currency     text,
  deal_count   bigint,
  gross_amount numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.currency,
    count(*)                     AS deal_count,
    sum(coalesce(o.amount, 0))   AS gross_amount
  FROM public.opportunities o
  LEFT JOIN (
    SELECT a.opportunity_id, max(a.created_at) AS last_act
    FROM public.activities a
    WHERE a.opportunity_id IS NOT NULL
    GROUP BY a.opportunity_id
  ) la ON la.opportunity_id = o.id
  WHERE o.stage NOT IN ('closed_won', 'closed_lost')
    AND (
      (EXTRACT(EPOCH FROM (now() - coalesce(la.last_act, o.created_at))) / 86400)
        >= coalesce((_thresholds ->> o.stage::text)::numeric, 1e9)
      OR (o.close_date IS NOT NULL AND o.close_date < current_date)
    )
  GROUP BY o.currency
$$;

COMMENT ON FUNCTION public.stuck_deals_value_at_risk(jsonb) IS
  'Per-currency count + gross amount of stuck open deals (stale-by-threshold OR overdue), thresholds passed as jsonb. Bounded replacement for the totalValueAtRisk reduce in getStuckDeals (ORR-757).';

REVOKE ALL ON FUNCTION public.stuck_deals_value_at_risk(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.stuck_deals_value_at_risk(jsonb) TO authenticated;
