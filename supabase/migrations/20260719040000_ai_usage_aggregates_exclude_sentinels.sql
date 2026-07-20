-- ORR-807(e) — AI usage dashboard aggregates: stop attributing phantom calls.
--
-- The router logs sentinel rows for non-completions with provider 'ollama_local'
-- and placeholder models ('cap_rejected', 'no_adapter', 'all_failed'), plus (as
-- of ORR-807d) a per-provider 'provider_error' row for each failed adapter
-- attempt. All of these are status 'cap_rejected' or 'error'. The ORR-701
-- aggregate functions counted every row, so:
--   • ai_usage_by_provider attributed the sentinels' phantom calls to
--     ollama_local (a provider that may never have actually run), and
--   • ai_usage_totals inflated the call count with rejections/failures.
--
-- Fix: count only rows that represent a REAL model completion — status IN
-- ('success','fallback'). 'fallback' is a genuine soft-cap Ollama completion and
-- is kept. Sentinels and failed attempts (all cost 0) are excluded from the
-- cost/call/token dashboards. Cost is still summed from cost_amount (a flat
-- per-call estimate); a true token-based cost needs a per-model price table that
-- does not exist yet — a follow-up — but excluding the zero-cost sentinels
-- already removes the phantom attribution this ticket is about.
--
-- SECURITY INVOKER preserved (RLS scopes to admin / own rows). Idempotent.

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
    AND u.status IN ('success', 'fallback')
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
    AND u.status IN ('success', 'fallback')
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
    AND u.status IN ('success', 'fallback')
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
    AND u.status IN ('success', 'fallback')
  GROUP BY u.feature
  ORDER BY cost DESC
$$;

COMMENT ON FUNCTION public.ai_usage_by_provider(date, date) IS
  'ORR-701/ORR-807e: per-provider AI cost/calls over a window. Counts only real '
  'completions (status success|fallback) so router sentinel rows (cap_rejected/'
  'no_adapter/all_failed, logged as ollama_local) and failed attempts are not '
  'attributed as phantom provider calls. SECURITY INVOKER — RLS-scoped.';
