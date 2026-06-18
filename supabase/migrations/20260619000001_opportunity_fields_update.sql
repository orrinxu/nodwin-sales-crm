-- supabase/migrations/20260619000001_opportunity_fields_update.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-553 / ORR-551.1: Remove sales_initiator_user_id and add new opportunity fields.
--
-- Changes:
--   1. Drop sales_initiator_user_id column (and FK constraint).
--   2. Add service_type (text[]) — multi-select service categories.
--   3. Add property_type enum — property classification.
--   4. Add barter_value (numeric(20,4)) — barter deal value.
--   5. Add entity_sales_id (uuid REFERENCES entities) — sales entity link.
--   6. Add trigger to default owner_user_id to auth.uid() on insert.
--   7. Drop and recreate INSERT policy (removes sales_initiator_user_id check).
--   8. Add indexes for new columns.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. NEW ENUM: property_type
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'property_type'
  ) THEN
    CREATE TYPE public.property_type AS ENUM (
      'conference',
      'expo',
      'festival',
      'food_festival',
      'scripted_reality_show',
      'talk_show',
      'tournament',
      'consultancy_services'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. DROP sales_initiator_user_id COLUMN AND CONSTRAINT
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop the FK constraint first.
ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_sales_initiator_user_id_fkey;

-- Drop the column.
ALTER TABLE public.opportunities
  DROP COLUMN IF EXISTS sales_initiator_user_id;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ADD NEW COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════

-- service_type: multi-select text array (admin-extensible).
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS service_type text[];

-- property_type: classified property type (enum).
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS property_type public.property_type;

-- barter_value: value of barter component, numeric(20,4) per money rules.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS barter_value numeric(20,4);

-- entity_sales_id: link to the sales entity (same list as billing_entity).
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS entity_sales_id uuid REFERENCES public.entities(id);

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
-- 5. UPDATE RLS INSERT POLICY — remove sales_initiator_user_id check
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "opportunities_insert_authenticated" ON public.opportunities;
CREATE POLICY "opportunities_insert_authenticated"
  ON public.opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. INDEXES FOR NEW COLUMNS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_opportunities_service_type
  ON public.opportunities USING GIN(service_type)
  WHERE service_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_property_type
  ON public.opportunities(property_type)
  WHERE property_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_entity_sales_id
  ON public.opportunities(entity_sales_id)
  WHERE entity_sales_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_barter_value
  ON public.opportunities(barter_value)
  WHERE barter_value IS NOT NULL;
