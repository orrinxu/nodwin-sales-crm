-- supabase/migrations/20260505000009_rate_limits.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the rate_limits table and rate_limit_increment RPC for the
-- rate-limiting middleware (ORR-127 / T-012).
--
-- The RPC atomically increments a sliding-window counter and returns the
-- decision so the application layer can return 429 + Retry-After.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_key_window
  ON public.rate_limits (key, window_start);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits (window_start);

COMMENT ON TABLE public.rate_limits IS
  'Rate-limiting counters per (key, window_start). Key encodes route+user/IP.';

-- ── rate_limit_increment RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rate_limit_increment(
  p_key          text,
  p_window_start timestamptz,
  p_window_ms    int,
  p_max          int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count      int;
  v_window_end timestamptz;
  v_retry_after int;
BEGIN
  v_window_end := p_window_start + (p_window_ms || ' milliseconds')::interval;

  -- Purge stale entries for this key (older than the current window)
  DELETE FROM public.rate_limits
  WHERE key = p_key
    AND window_start < p_window_start;

  -- Upsert: insert 1 or increment by 1
  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  v_retry_after := GREATEST(1, EXTRACT(EPOCH FROM (v_window_end - now()))::int);

  RETURN jsonb_build_object(
    'allowed',    v_count <= p_max,
    'remaining',  GREATEST(0, p_max - v_count),
    'retryAfter', v_retry_after
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_limit_increment(text, timestamptz, int, int)
  TO authenticated;

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role can manage rate_limits"
  ON public.rate_limits
  USING (true)
  WITH CHECK (true);
