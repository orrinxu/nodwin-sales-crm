-- ORR-701 — AI cost/usage dashboard aggregates.
--
-- ai_usage is logged write-only; these read-side aggregates power the admin
-- dashboard. All SECURITY INVOKER, so ai_usage RLS applies — an admin (the only
-- caller, the page is requireRole-gated) sees company-wide totals; a non-admin
-- would see only their own rows. Server-side GROUP BY avoids the PostgREST
-- max_rows client-reduce truncation trap. Costs are summed in USD (the usage
-- logger always records cost in USD).
--
-- Windows are half-open [p_from, p_to + 1 day) on started_at.
-- Idempotent.

CREATE OR REPLACE FUNCTION public.ai_usage_totals(p_from date, p_to date)
RETURNS TABLE (cost numeric, calls bigint, prompt_tokens bigint, completion_tokens bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    coalesce(sum(u.cost_amount), 0)        AS cost,
    count(*)                                AS calls,
    coalesce(sum(u.prompt_tokens), 0)       AS prompt_tokens,
    coalesce(sum(u.completion_tokens), 0)   AS completion_tokens
  FROM public.ai_usage u
  WHERE u.started_at >= p_from AND u.started_at < (p_to + 1)
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_daily_cost(p_from date, p_to date)
RETURNS TABLE (usage_date date, cost numeric, calls bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT
    (u.started_at AT TIME ZONE 'UTC')::date AS usage_date,
    coalesce(sum(u.cost_amount), 0)          AS cost,
    count(*)                                 AS calls
  FROM public.ai_usage u
  WHERE u.started_at >= p_from AND u.started_at < (p_to + 1)
  GROUP BY (u.started_at AT TIME ZONE 'UTC')::date
  ORDER BY usage_date
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_provider(p_from date, p_to date)
RETURNS TABLE (provider text, cost numeric, calls bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT u.provider::text, coalesce(sum(u.cost_amount), 0) AS cost, count(*) AS calls
  FROM public.ai_usage u
  WHERE u.started_at >= p_from AND u.started_at < (p_to + 1)
  GROUP BY u.provider
  ORDER BY cost DESC
$$;

CREATE OR REPLACE FUNCTION public.ai_usage_by_feature(p_from date, p_to date)
RETURNS TABLE (feature text, cost numeric, calls bigint)
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT u.feature::text, coalesce(sum(u.cost_amount), 0) AS cost, count(*) AS calls
  FROM public.ai_usage u
  WHERE u.started_at >= p_from AND u.started_at < (p_to + 1)
  GROUP BY u.feature
  ORDER BY cost DESC
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.ai_usage_totals(date, date)',
    'public.ai_usage_daily_cost(date, date)',
    'public.ai_usage_by_provider(date, date)',
    'public.ai_usage_by_feature(date, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.ai_usage_totals(date, date) IS
  'ORR-701: grand totals of ai_usage over a window. SECURITY INVOKER — RLS scopes '
  'to admin (company-wide) or the caller''s own rows.';
