-- supabase/migrations/20260711020000_cashflow_milestone.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Cash-flow milestones (SOW §4.14) — the foundation for the Deal Confirmation /
-- Handoff module. A child of the opportunity making cash events first-class: the
-- client payment schedule (direction='in') and the vendor/production payout
-- schedule (direction='out'). The monthly working-capital grid (P&L sheet today,
-- native Handoff later) becomes a DERIVED view of these (see
-- lib/finance/working-capital.ts). The CRM owns the plan; finance owns actuals.
--
-- Schema + RLS mirror opportunity_revenue_schedule (a milestone is visible/
-- editable exactly when its parent opportunity is), WITH the Confidential-tier
-- fence: even admins are excluded from a Confidential deal's milestones unless
-- they are on the deal. Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE public.cashflow_direction AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.cashflow_milestone (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid          NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  direction       public.cashflow_direction NOT NULL,
  label           text          NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  -- Normalised to the first of the month; monthly granularity is sufficient.
  scheduled_month date          NOT NULL,
  -- Non-negative; sign is carried by `direction`. numeric(20,4) matches opportunity.amount.
  amount          numeric(20,4) NOT NULL CHECK (amount >= 0),
  currency        text          NOT NULL,
  sort_order      int           NOT NULL DEFAULT 0,
  created_by      uuid          NOT NULL REFERENCES public.users(id),
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cashflow_milestone IS
  'Planned cash events per opportunity (in = client receipts, out = vendor payouts). Source for the working-capital derivation.';
COMMENT ON COLUMN public.cashflow_milestone.scheduled_month IS
  'First day of the month this cash event is planned for.';

CREATE INDEX IF NOT EXISTS idx_cashflow_milestone_opportunity
  ON public.cashflow_milestone (opportunity_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_cashflow_milestone_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cashflow_milestone_updated_at_trigger ON public.cashflow_milestone;
CREATE TRIGGER cashflow_milestone_updated_at_trigger
  BEFORE UPDATE ON public.cashflow_milestone
  FOR EACH ROW EXECUTE FUNCTION public.set_cashflow_milestone_updated_at();

SELECT audit.attach_trigger('public.cashflow_milestone');

-- ── RLS: parent-opportunity visibility, with the Confidential-tier admin fence ──
ALTER TABLE public.cashflow_milestone ENABLE ROW LEVEL SECURITY;

-- One shared predicate: on the deal, OR admin on a non-confidential deal.
-- (Confidential deals are fenced from admins per 20260619000006.)
DROP POLICY IF EXISTS "cashflow_milestone_select" ON public.cashflow_milestone;
CREATE POLICY "cashflow_milestone_select" ON public.cashflow_milestone
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  );

DROP POLICY IF EXISTS "cashflow_milestone_insert" ON public.cashflow_milestone;
CREATE POLICY "cashflow_milestone_insert" ON public.cashflow_milestone
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  );

DROP POLICY IF EXISTS "cashflow_milestone_update" ON public.cashflow_milestone;
CREATE POLICY "cashflow_milestone_update" ON public.cashflow_milestone
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  );

DROP POLICY IF EXISTS "cashflow_milestone_delete" ON public.cashflow_milestone;
CREATE POLICY "cashflow_milestone_delete" ON public.cashflow_milestone
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  );
