-- supabase/migrations/20260620000002_opportunity_schema_update.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-553 / ORR-554: Remove sales_initiator_user_id and add new opportunity fields
-- from SOW §4.6: service_type, property_type, barter_value, entity_sales_id.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. DROP RLS INSERT policy — remove sales_initiator_user_id guard
--    (Must happen BEFORE dropping the column, because the policy depends on it.)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "opportunities_insert_authenticated" ON public.opportunities;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DROP sales_initiator_user_id column and constraint
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  DROP COLUMN IF EXISTS sales_initiator_user_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ADD new §4.6 columns
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS service_type   text[],
  ADD COLUMN IF NOT EXISTS property_type  text,
  ADD COLUMN IF NOT EXISTS barter_value   text,
  ADD COLUMN IF NOT EXISTS entity_sales_id text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. TRIGGER: default owner_user_id to auth.uid() on INSERT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_opportunity_owner_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.owner_user_id IS NULL THEN
    NEW.owner_user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_owner_default_trigger ON public.opportunities;
CREATE TRIGGER opportunity_owner_default_trigger
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_opportunity_owner_default();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RECREATE RLS INSERT policy (without sales_initiator_user_id dependency)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "opportunities_insert_authenticated"
  ON public.opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
  );
