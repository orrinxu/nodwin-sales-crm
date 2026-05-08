-- supabase/policies/business_units.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.business_units table.
-- Embedded in 20260505000004_entities_business_units.sql for self-contained migration.
-- This file exists for security-review readability.

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_units_select_authenticated" ON public.business_units;
CREATE POLICY "business_units_select_authenticated"
  ON public.business_units
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "business_units_insert_admin" ON public.business_units;
CREATE POLICY "business_units_insert_admin"
  ON public.business_units
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "business_units_update_admin" ON public.business_units;
CREATE POLICY "business_units_update_admin"
  ON public.business_units
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "business_units_delete_admin" ON public.business_units;
CREATE POLICY "business_units_delete_admin"
  ON public.business_units
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
