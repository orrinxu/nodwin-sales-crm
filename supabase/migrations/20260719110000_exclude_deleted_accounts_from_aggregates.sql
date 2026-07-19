-- supabase/migrations/20260719110000_exclude_deleted_accounts_from_aggregates.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-804 (c): reconcile the cross-widget aggregate disagreement over a
-- soft-deleted account's opportunities.
--
-- Today the report/pipeline rollups disagree about deals that belong to a
-- soft-deleted account:
--   • pipeline_metrics_agg / pipeline_metrics_agg_scoped / report_monthly_agg
--     read `FROM opportunities` only. The opportunity's own RLS says nothing
--     about its account's deleted_at, so those deals stay fully live for
--     everyone.
--   • report_top_accounts_agg JOINs accounts. Under the accounts SELECT policy
--     (20260618000004) a non-admin cannot see a soft-deleted account, so its
--     deals silently drop out — but an admin (who can see deleted accounts) still
--     counts them. Same page, different widgets, different totals; and the
--     behaviour even differs by role.
--
-- DECISION: a soft-deleted account's opportunities are EXCLUDED from every
-- reporting aggregate, consistently for every role. This matches the ORR-804
-- export/search fix (a deleted account disappears from CSV export and global
-- search) and the soft-delete intent (a "deleted" account should not keep
-- inflating pipeline/forecast/report numbers). The alternative — showing them
-- everywhere — would resurrect deleted accounts in reporting and contradict that.
--
-- The exclusion must be ROLE-INDEPENDENT: admins can see deleted accounts through
-- RLS, so we cannot lean on the accounts SELECT policy to hide them. We add a
-- SECURITY DEFINER predicate account_is_deleted(uuid) — same pattern as the
-- opportunity_is_confidential() fence — and apply it inside the aggregates, which
-- stay SECURITY INVOKER so per-row opportunity RLS (Confidential fence included)
-- is unchanged. Idempotent (CREATE OR REPLACE).

-- ── Role-independent soft-delete predicate ───────────────────────────────────
-- SECURITY DEFINER so the check does not depend on whether the caller can SELECT
-- the (deleted) account row. account_is_deleted(NULL) = false; opportunities.
-- account_id is NOT NULL today, but a false-for-unknown result keeps callers safe.
CREATE OR REPLACE FUNCTION public.account_is_deleted(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _account_id AND a.deleted_at IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.account_is_deleted(uuid) IS
  'True when the account is soft-deleted (deleted_at IS NOT NULL). SECURITY DEFINER so reporting aggregates can exclude a deleted account''s opportunities consistently for every role, independent of the accounts SELECT policy. ORR-804.';

REVOKE ALL ON FUNCTION public.account_is_deleted(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.account_is_deleted(uuid) TO authenticated;

-- ── Pipeline metrics (dashboard) ─────────────────────────────────────────────
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
  WHERE NOT public.account_is_deleted(o.account_id)  -- ORR-804
  GROUP BY o.stage, o.currency
$$;

-- ── Pipeline metrics, scoped (board totals) ──────────────────────────────────
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
    AND NOT public.account_is_deleted(o.account_id)  -- ORR-804
  GROUP BY o.stage, o.currency
$$;

-- ── Reports: monthly trends ──────────────────────────────────────────────────
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
  WHERE NOT public.account_is_deleted(o.account_id)  -- ORR-804
  GROUP BY 1, o.currency
$$;

-- ── Reports: top accounts by revenue ─────────────────────────────────────────
-- The INNER JOIN already dropped deleted accounts for non-admins; the explicit
-- predicate makes admins behave identically, matching the other rollups.
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
    WHERE NOT public.account_is_deleted(o.account_id)  -- ORR-804
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
