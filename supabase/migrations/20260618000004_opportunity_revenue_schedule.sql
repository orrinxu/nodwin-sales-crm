-- supabase/migrations/20260618000000_opportunity_revenue_schedule.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-491 REV-1: opportunity_revenue_schedule table for storing custom-split
-- monthly revenue amounts per opportunity.
--
-- Each row represents one month's allocated revenue for an opportunity.
-- The (opportunity_id, month) pair is unique — at most one amount per month.
--
-- Provides:
--   • Table    public.opportunity_revenue_schedule
--   • Trigger  updated_at auto-set
--   • RLS      visibility-based: user can access rows iff they can see the parent opportunity
--   • Audit    trigger via audit.attach_trigger
--
-- Idempotent: safe to re-run.

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.opportunity_revenue_schedule (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid          NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  month           date          NOT NULL,
  amount          numeric(20,4) NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_revenue_schedule_unique_month
    UNIQUE (opportunity_id, month)
);

COMMENT ON TABLE public.opportunity_revenue_schedule IS
  'Monthly revenue amounts per opportunity for custom recurring-revenue splits.';

COMMENT ON COLUMN public.opportunity_revenue_schedule.month IS
  'First day of the month this revenue entry applies to.';
COMMENT ON COLUMN public.opportunity_revenue_schedule.amount IS
  'Revenue amount allocated to this month in the opportunity currency.';

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_opp_rev_schedule_opportunity
  ON public.opportunity_revenue_schedule (opportunity_id);

CREATE INDEX IF NOT EXISTS idx_opp_rev_schedule_month
  ON public.opportunity_revenue_schedule (month);

-- ── Trigger: updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_opportunity_revenue_schedule_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_revenue_schedule_updated_at_trigger ON public.opportunity_revenue_schedule;
CREATE TRIGGER opportunity_revenue_schedule_updated_at_trigger
  BEFORE UPDATE ON public.opportunity_revenue_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.set_opportunity_revenue_schedule_updated_at();

-- ── Audit log ──────────────────────────────────────────────────────────────

SELECT audit.attach_trigger('public.opportunity_revenue_schedule');

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.opportunity_revenue_schedule ENABLE ROW LEVEL SECURITY;

-- SELECT: user can view schedule rows iff they can see the parent opportunity.
DROP POLICY IF EXISTS "opportunity_revenue_schedule_select_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_select_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- INSERT: user can insert schedule rows iff they can see the parent opportunity.
DROP POLICY IF EXISTS "opportunity_revenue_schedule_insert_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_insert_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- UPDATE: user can update schedule rows iff they can see the parent opportunity.
DROP POLICY IF EXISTS "opportunity_revenue_schedule_update_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_update_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- DELETE: user can delete schedule rows iff they can see the parent opportunity.
DROP POLICY IF EXISTS "opportunity_revenue_schedule_delete_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_delete_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- Service role has full access.
DROP POLICY IF EXISTS "service_role_all_opportunity_revenue_schedule" ON public.opportunity_revenue_schedule;
CREATE POLICY "service_role_all_opportunity_revenue_schedule"
  ON public.opportunity_revenue_schedule
  TO service_role
  USING (true)
  WITH CHECK (true);
