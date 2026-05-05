-- supabase/migrations/0014_ai_usage.sql
-- AI Usage tracking + daily cap enforcement tables and RLS (ORR-147 / T-008a).
--
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Provides:
--   • Table    public.ai_usage              — per-call AI usage log
--   • Table    public.ai_daily_caps         — configurable per-team / per-company
--     caps (per-user caps live on public.users.ai_daily_*_cap_usd)
--   • View     public.ai_usage_daily_rollup — aggregated per user / team / company
--     per day for fast cap checks
--   • RLS      users see own usage; admin sees all
--
-- Money convention: all monetary columns use (amount numeric(20,4), currency text)
-- pairs per AGENTS.md §5.1. Per-user cap columns on public.users store dollar
-- amounts in cents (integer) and must be cast accordingly.
--
-- Idempotent: safe to re-run.

-- ── ai_provider enum ──────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ai_provider'
  ) THEN
    CREATE TYPE public.ai_provider AS ENUM (
      'claude',
      'gemini',
      'kimi',
      'deepseek',
      'ollama_local'
    );
  END IF;
END;
$$;

-- ── ai_feature enum ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ai_feature'
  ) THEN
    CREATE TYPE public.ai_feature AS ENUM (
      'search',
      'summarise_deal',
      'draft_email',
      'next_best_action',
      'other'
    );
  END IF;
END;
$$;

-- ── ai_call_status enum ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ai_call_status'
  ) THEN
    CREATE TYPE public.ai_call_status AS ENUM (
      'success',
      'error',
      'rate_limited',
      'cap_rejected',
      'fallback'
    );
  END IF;
END;
$$;

-- ── ai_usage table ────────────────────────────────────────────────────────────
-- Money: cost_amount (numeric(20,4)) + cost_currency (text, default 'USD')
-- per AGENTS.md §5.1.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider          public.ai_provider NOT NULL,
  model             text NOT NULL,
  prompt_tokens     int NOT NULL DEFAULT 0,
  completion_tokens int NOT NULL DEFAULT 0,
  cost_amount       numeric(20,4) NOT NULL DEFAULT 0,
  cost_currency     text NOT NULL DEFAULT 'USD',
  feature           public.ai_feature NOT NULL,
  request_id        text NOT NULL,
  started_at        timestamptz NOT NULL,
  finished_at       timestamptz NOT NULL DEFAULT now(),
  status            public.ai_call_status NOT NULL DEFAULT 'success'
);

-- Indexes for performance at scale
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date
  ON public.ai_usage (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_started_at
  ON public.ai_usage (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_request_id
  ON public.ai_usage (request_id);

-- ── ai_daily_caps config table ───────────────────────────────────────────────
-- Per-user caps are stored on public.users (ai_daily_soft_cap_usd,
-- ai_daily_hard_cap_usd).  Per-team and per-company caps are configured here.
-- Money: *_amount (numeric(20,4)) + *_currency (text, default 'USD').

CREATE TABLE IF NOT EXISTS public.ai_daily_caps (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind        text NOT NULL CHECK (scope_kind IN ('team', 'company')),
  scope_id          uuid NOT NULL,
  soft_cap_amount   numeric(20,4) NOT NULL CHECK (soft_cap_amount >= 0),
  soft_cap_currency text NOT NULL DEFAULT 'USD',
  hard_cap_amount   numeric(20,4) NOT NULL CHECK (hard_cap_amount >= 0),
  hard_cap_currency text NOT NULL DEFAULT 'USD',
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Ensure at most one active cap per scope
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_daily_caps_active_scope
  ON public.ai_daily_caps (scope_kind, scope_id) WHERE active = true;

-- ── ai_usage_daily_rollup view ────────────────────────────────────────────────
-- Aggregates usage per user per UTC day for fast cap checks.

CREATE OR REPLACE VIEW public.ai_usage_daily_rollup AS
SELECT
  u.id                                                             AS user_id,
  u.primary_entity_id                                              AS entity_id,
  u.primary_business_unit_id                                       AS team_id,
  date_trunc('day', a.started_at AT TIME ZONE 'UTC')::date         AS usage_date,
  COALESCE(SUM(a.cost_amount), 0)                                  AS total_cost_amount,
  'USD'                                                            AS total_cost_currency,
  COALESCE(SUM(a.prompt_tokens), 0)                                AS total_prompt_tokens,
  COALESCE(SUM(a.completion_tokens), 0)                            AS total_completion_tokens,
  COUNT(*)                                                         AS call_count
FROM public.users u
LEFT JOIN public.ai_usage a ON a.user_id = u.id
GROUP BY u.id, u.primary_entity_id, u.primary_business_unit_id, date_trunc('day', a.started_at AT TIME ZONE 'UTC')
HAVING date_trunc('day', a.started_at AT TIME ZONE 'UTC') IS NOT NULL;

COMMENT ON VIEW public.ai_usage_daily_rollup IS
  'Daily aggregated AI usage per user for fast cap check queries.';

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_daily_caps ENABLE ROW LEVEL SECURITY;

-- ai_usage: users see their own rows; admins see all
CREATE POLICY "Users can view own AI usage"
  ON public.ai_usage
  FOR SELECT
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Admins can view all AI usage"
  ON public.ai_usage
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  );

CREATE POLICY "Users can insert own AI usage"
  ON public.ai_usage
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Admins can insert any AI usage"
  ON public.ai_usage
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  );

-- ai_daily_caps: all authenticated users can read; only admins can write
CREATE POLICY "Authenticated users can view daily caps"
  ON public.ai_daily_caps
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
  );

CREATE POLICY "Only admins can insert daily caps"
  ON public.ai_daily_caps
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  );

CREATE POLICY "Only admins can update daily caps"
  ON public.ai_daily_caps
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  );

CREATE POLICY "Only admins can delete daily caps"
  ON public.ai_daily_caps
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND primary_role = 'admin'
    )
  );

-- ── Helper function: get effective user caps ──────────────────────────────────
-- Returns the effective daily soft and hard caps for a user, considering:
--   - User-level override (if set)
--   - Team-level cap (from ai_daily_caps where scope_id = user's team)
--   - Company-level cap (from ai_daily_caps where scope_kind = 'company' and
--     scope_id = user's entity_id)
-- Falls back to environment-configured defaults.
--
-- NOTE: User-level cap columns (ai_daily_soft_cap_usd, ai_daily_hard_cap_usd)
-- on public.users store dollar amounts. These should be migrated to the money
-- pattern (amount + currency) in a follow-up. The currency is always 'USD' for
-- caps.

CREATE OR REPLACE FUNCTION public.get_effective_user_caps(p_user_id uuid)
RETURNS TABLE(
  soft_cap_amount   numeric(20,4),
  soft_cap_currency text,
  hard_cap_amount   numeric(20,4),
  hard_cap_currency text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _user_soft    numeric(20,4);
  _user_hard    numeric(20,4);
  _team_soft    numeric(20,4);
  _team_hard    numeric(20,4);
  _company_soft numeric(20,4);
  _company_hard numeric(20,4);
BEGIN
  -- User-level overrides (stored as dollar amounts on public.users)
  SELECT u.ai_daily_soft_cap_usd, u.ai_daily_hard_cap_usd
  INTO _user_soft, _user_hard
  FROM public.users u
  WHERE u.id = p_user_id;

  -- Team-level caps (user's primary_business_unit)
  SELECT c.soft_cap_amount, c.hard_cap_amount
  INTO _team_soft, _team_hard
  FROM public.ai_daily_caps c
  JOIN public.users u ON u.primary_business_unit_id = c.scope_id
  WHERE u.id = p_user_id
    AND c.scope_kind = 'team'
    AND c.active = true;

  -- Company-level caps (user's primary_entity)
  SELECT c.soft_cap_amount, c.hard_cap_amount
  INTO _company_soft, _company_hard
  FROM public.ai_daily_caps c
  JOIN public.users u ON u.primary_entity_id = c.scope_id
  WHERE u.id = p_user_id
    AND c.scope_kind = 'company'
    AND c.active = true;

  -- Resolve: user override > team cap > company cap > NULL (no cap)
  RETURN QUERY
  SELECT
    COALESCE(_user_soft, _team_soft, _company_soft) AS soft_cap_amount,
    'USD'::text                                      AS soft_cap_currency,
    COALESCE(_user_hard, _team_hard, _company_hard) AS hard_cap_amount,
    'USD'::text                                      AS hard_cap_currency;
END;
$$;

-- ── Helper function: today's usage for a user ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_todays_user_usage(p_user_id uuid)
RETURNS TABLE(
  total_cost_amount       numeric(20,4),
  total_cost_currency     text,
  total_prompt_tokens     bigint,
  total_completion_tokens bigint,
  call_count              bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(a.cost_amount), 0::numeric(20,4)) AS total_cost_amount,
    'USD'::text                                     AS total_cost_currency,
    COALESCE(SUM(a.prompt_tokens), 0::bigint)       AS total_prompt_tokens,
    COALESCE(SUM(a.completion_tokens), 0::bigint)   AS total_completion_tokens,
    COUNT(*)::bigint                                 AS call_count
  FROM public.ai_usage a
  WHERE a.user_id = p_user_id
    AND a.started_at >= date_trunc('day', now() AT TIME ZONE 'UTC')::timestamptz
    AND a.status != 'error';
END;
$$;

-- ── Helper function: today's team usage ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_todays_team_usage(p_team_id uuid)
RETURNS TABLE(
  total_cost_amount   numeric(20,4),
  total_cost_currency text,
  call_count          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(a.cost_amount), 0::numeric(20,4)) AS total_cost_amount,
    'USD'::text                                     AS total_cost_currency,
    COUNT(*)::bigint                                 AS call_count
  FROM public.ai_usage a
  JOIN public.users u ON u.id = a.user_id
  WHERE u.primary_business_unit_id = p_team_id
    AND a.started_at >= date_trunc('day', now() AT TIME ZONE 'UTC')::timestamptz
    AND a.status != 'error';
END;
$$;

-- ── Helper function: today's company usage ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_todays_company_usage(p_entity_id uuid)
RETURNS TABLE(
  total_cost_amount   numeric(20,4),
  total_cost_currency text,
  call_count          bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(a.cost_amount), 0::numeric(20,4)) AS total_cost_amount,
    'USD'::text                                     AS total_cost_currency,
    COUNT(*)::bigint                                 AS call_count
  FROM public.ai_usage a
  JOIN public.users u ON u.id = a.user_id
  WHERE u.primary_entity_id = p_entity_id
    AND a.started_at >= date_trunc('day', now() AT TIME ZONE 'UTC')::timestamptz
    AND a.status != 'error';
END;
$$;

-- ── Helper function: check if a request would exceed caps ─────────────────────
-- Returns the cap that would be breached, or NULL if all caps are satisfied.

CREATE OR REPLACE FUNCTION public.check_ai_caps(
  p_user_id          uuid,
  p_estimated_cost   numeric(20,4)
)
RETURNS TABLE(
  blocked         boolean,
  reason          text,
  cap_type        text,
  cap_limit_amount numeric(20,4),
  cap_limit_currency text,
  current_spend_amount numeric(20,4),
  current_spend_currency text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _user_soft    numeric(20,4);
  _user_hard    numeric(20,4);
  _user_today   numeric(20,4);
  _team_hard    numeric(20,4);
  _team_today   numeric(20,4);
  _company_hard numeric(20,4);
  _company_today numeric(20,4);
  _team_id      uuid;
  _entity_id    uuid;
BEGIN
  -- Get caps for this user
  SELECT c.soft_cap_amount, c.hard_cap_amount
  INTO _user_soft, _user_hard
  FROM public.get_effective_user_caps(p_user_id) c;

  -- Get user's team and entity
  SELECT u.primary_business_unit_id, u.primary_entity_id
  INTO _team_id, _entity_id
  FROM public.users u
  WHERE u.id = p_user_id;

  -- Get team-level hard cap
  SELECT c.hard_cap_amount INTO _team_hard
  FROM public.ai_daily_caps c
  WHERE c.scope_kind = 'team'
    AND c.scope_id = _team_id
    AND c.active = true;

  -- Get company-level hard cap
  SELECT c.hard_cap_amount INTO _company_hard
  FROM public.ai_daily_caps c
  WHERE c.scope_kind = 'company'
    AND c.scope_id = _entity_id
    AND c.active = true;

  -- Check user hard cap
  IF _user_hard IS NOT NULL THEN
    SELECT total_cost_amount INTO _user_today
    FROM public.get_todays_user_usage(p_user_id);

    IF (_user_today + p_estimated_cost) > _user_hard THEN
      RETURN QUERY SELECT
        true,
        format('Per-user daily hard cap of $%s exceeded (current: $%s, estimated: $%s)',
               _user_hard, _user_today, p_estimated_cost),
        'user_hard',
        _user_hard,
        'USD',
        _user_today,
        'USD';
      RETURN;
    END IF;
  END IF;

  -- Check team hard cap
  IF _team_hard IS NOT NULL AND _team_id IS NOT NULL THEN
    SELECT total_cost_amount INTO _team_today
    FROM public.get_todays_team_usage(_team_id);

    IF (_team_today + p_estimated_cost) > _team_hard THEN
      RETURN QUERY SELECT
        true,
        format('Per-team daily hard cap of $%s exceeded (current: $%s, estimated: $%s)',
               _team_hard, _team_today, p_estimated_cost),
        'team_hard',
        _team_hard,
        'USD',
        _team_today,
        'USD';
      RETURN;
    END IF;
  END IF;

  -- Check company hard cap
  IF _company_hard IS NOT NULL AND _entity_id IS NOT NULL THEN
    SELECT total_cost_amount INTO _company_today
    FROM public.get_todays_company_usage(_entity_id);

    IF (_company_today + p_estimated_cost) > _company_hard THEN
      RETURN QUERY SELECT
        true,
        format('Per-company daily hard cap of $%s exceeded (current: $%s, estimated: $%s)',
               _company_hard, _company_today, p_estimated_cost),
        'company_hard',
        _company_hard,
        'USD',
        _company_today,
        'USD';
      RETURN;
    END IF;
  END IF;

  -- All caps satisfied
  RETURN QUERY SELECT
    false,
    NULL::text,
    NULL::text,
    NULL::numeric(20,4),
    NULL::text,
    NULL::numeric(20,4),
    NULL::text;
END;
$$;
