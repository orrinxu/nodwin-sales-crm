-- supabase/migrations/20260719060000_metrics_correctness_orr813.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-813 (metrics-semantics coherence). Two report RPCs from 20260716020000
-- reported numbers that read as one thing and counted another:
--
--   (b) report_monthly_agg charted a monthly "Won" line, but bucketed wins by
--       the deal's CREATED month, not its CLOSE month. A deal created Jan and
--       won Jun charted as a January win, so recent months systematically
--       under-showed wins — a phantom decline. Wins are now bucketed by
--       close_date (a DATE, already timezone-free). Separately, the CREATED
--       series was bucketed on created_at (a timestamptz) with no zone, so a
--       deal created just after local midnight could land in the previous
--       month for an India-based user. Created is now bucketed in the caller's
--       preference timezone via a `_tz` param (default UTC), matching the
--       tz-aware close-date resolution shipped in ORR-797. NOTE: ORR-814 owns
--       date/timezone elsewhere and deliberately does NOT touch this RPC — this
--       migration fixes both the close-month bug and the tz bucketing here.
--
--   (c) report_top_accounts_agg summed EVERY stage (open + closed-lost) under a
--       chart titled "Top Accounts by Revenue" — an account with one big
--       closed-LOST deal and zero wins topped the revenue chart. It now sums
--       closed_won only, so the "Revenue" title is truthful; accounts with no
--       wins drop off the ranking entirely.
--
-- Both stay SECURITY INVOKER (plain SQL), so the same per-row opportunity RLS +
-- Confidential fence apply. Idempotent: safe to re-run.

-- ── Reports: monthly trends — created by created-month (in caller TZ), won by
--    close-month ────────────────────────────────────────────────────────────
-- Signature changes (gains _tz), so DROP then CREATE rather than REPLACE.
DROP FUNCTION IF EXISTS public.report_monthly_agg();

CREATE OR REPLACE FUNCTION public.report_monthly_agg(_tz text DEFAULT 'UTC')
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
  -- Created deals, bucketed by the calendar month of created_at in the caller's
  -- timezone (created_at is a timestamptz; AT TIME ZONE shifts it into _tz).
  WITH created AS (
    SELECT
      to_char(o.created_at AT TIME ZONE _tz, 'YYYY-MM') AS month,
      o.currency                                        AS currency,
      count(*)                                          AS created_count
    FROM public.opportunities o
    GROUP BY 1, o.currency
  ),
  -- Won deals, bucketed by the calendar month they actually CLOSED. close_date
  -- is a DATE (already timezone-free), so no AT TIME ZONE is needed or correct.
  won AS (
    SELECT
      to_char(o.close_date, 'YYYY-MM')            AS month,
      o.currency                                  AS currency,
      count(*)                                    AS won_count,
      sum(coalesce(o.amount, 0))                  AS won_amount
    FROM public.opportunities o
    WHERE o.stage = 'closed_won'
      AND o.close_date IS NOT NULL
    GROUP BY 1, o.currency
  )
  SELECT
    coalesce(c.month, w.month)              AS month,
    coalesce(c.currency, w.currency)        AS currency,
    coalesce(c.created_count, 0)            AS created_count,
    coalesce(w.won_count, 0)               AS won_count,
    coalesce(w.won_amount, 0)              AS won_amount
  FROM created c
  FULL OUTER JOIN won w
    ON c.month = w.month AND c.currency = w.currency
$$;

COMMENT ON FUNCTION public.report_monthly_agg(text) IS
  'Per-(month, currency) trends over RLS-visible opportunities: created_count by '
  'created-month (bucketed in _tz, default UTC), won_count/won_amount by CLOSE '
  'month (ORR-813 — was created-month, undercounting recent wins). Bounded '
  'replacement for the JS monthly-trends reduce in getReportData.';

REVOKE ALL ON FUNCTION public.report_monthly_agg(text) FROM public;
GRANT EXECUTE ON FUNCTION public.report_monthly_agg(text) TO authenticated;

-- ── Reports: top accounts by revenue — closed_won only ───────────────────────
-- Same signature as before (no args), so CREATE OR REPLACE. gross_amount and
-- deal_count are now scoped to closed_won, so the "Revenue" ranking counts
-- realised revenue only — open and closed-lost amounts no longer inflate it.
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
    WHERE o.stage = 'closed_won'
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
  'Per-(account, currency) CLOSED-WON deal count + revenue for the top 50 accounts '
  'by won revenue (JS FX-converts + narrows to top 10). ORR-813: added the '
  'closed_won filter so "Top Accounts by Revenue" counts realised revenue only, '
  'not open/lost amounts.';

REVOKE ALL ON FUNCTION public.report_top_accounts_agg() FROM public;
GRANT EXECUTE ON FUNCTION public.report_top_accounts_agg() TO authenticated;
