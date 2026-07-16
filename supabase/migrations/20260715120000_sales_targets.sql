-- supabase/migrations/20260715120000_sales_targets.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-726: per-rep quarterly sales targets (quotas).
--
-- A closed-won revenue quota per rep per calendar quarter. The dashboard shows
-- won-so-far and weighted pipeline against it. Admins set the targets.
--
-- RLS: a rep reads their own target; admins read/write all.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.sales_targets (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  year          integer       NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  quarter       integer       NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  target_amount numeric(20,4) NOT NULL CHECK (target_amount >= 0),
  currency      text          NOT NULL DEFAULT 'USD' REFERENCES public.currencies(code),
  created_by    uuid          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, quarter)
);

COMMENT ON TABLE public.sales_targets IS
  'Per-rep quarterly closed-won revenue quotas (ORR-726). One row per user per calendar quarter.';

CREATE INDEX IF NOT EXISTS idx_sales_targets_period ON public.sales_targets (year, quarter);

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_sales_targets_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_targets_timestamps ON public.sales_targets;
CREATE TRIGGER sales_targets_timestamps
  BEFORE UPDATE ON public.sales_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_targets_timestamps();

-- ── Audit ────────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.sales_targets');

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_targets_select_own_or_admin" ON public.sales_targets;
CREATE POLICY "sales_targets_select_own_or_admin"
  ON public.sales_targets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_targets_insert_admin" ON public.sales_targets;
CREATE POLICY "sales_targets_insert_admin"
  ON public.sales_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_targets_update_admin" ON public.sales_targets;
CREATE POLICY "sales_targets_update_admin"
  ON public.sales_targets
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_targets_delete_admin" ON public.sales_targets;
CREATE POLICY "sales_targets_delete_admin"
  ON public.sales_targets
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_targets_service_role" ON public.sales_targets;
CREATE POLICY "sales_targets_service_role"
  ON public.sales_targets
  TO service_role
  USING (true)
  WITH CHECK (true);
