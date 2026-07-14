-- supabase/migrations/20260714020000_opportunity_extraction_provenance.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (new RLS table).
--
-- ORR-682: persist AI extraction provenance for the Opportunity Generator.
--
-- When a user confirms an AI-prefilled opportunity, record which source snippet
-- each suggested field came from, its confidence, and the model/feature used —
-- linked to the created opportunity so AI-assisted creates are auditable. Written
-- on the confirm path only; manual creates never touch this table.
--
-- One immutable row per confirmed AI generation. Per-field detail lives in the
-- `fields` jsonb ({status, confidence, source, raw} keyed by create-form field).
--
-- RLS mirrors public.documents (deal viewers + creator + admin, Confidential-tier
-- fenced via the centralized opportunity_is_confidential() helper).
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.opportunity_extraction_provenance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  feature         text NOT NULL,
  model           text,
  source_kind     text NOT NULL,
  fields          jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes           jsonb NOT NULL DEFAULT '[]'::jsonb,
  truncated       boolean NOT NULL DEFAULT false,
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- source_kind: 'document' when an uploaded RFP file was the source (ORR-683
-- retains it as a deal document), 'text' for pasted text / text files.
ALTER TABLE public.opportunity_extraction_provenance
  DROP CONSTRAINT IF EXISTS opportunity_extraction_provenance_source_kind_check;
ALTER TABLE public.opportunity_extraction_provenance
  ADD CONSTRAINT opportunity_extraction_provenance_source_kind_check
  CHECK (source_kind IN ('document', 'text'));

CREATE INDEX IF NOT EXISTS idx_opportunity_extraction_provenance_opportunity_id
  ON public.opportunity_extraction_provenance(opportunity_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Audit fields trigger (mirrors public.set_document_audit_fields)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_extraction_provenance_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS extraction_provenance_audit_fields_trigger
  ON public.opportunity_extraction_provenance;
CREATE TRIGGER extraction_provenance_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.opportunity_extraction_provenance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_extraction_provenance_audit_fields();

SELECT audit.attach_trigger('public.opportunity_extraction_provenance');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunity_extraction_provenance ENABLE ROW LEVEL SECURITY;

-- SELECT: creator, anyone with visibility on the linked opportunity, or a
-- non-Confidential admin. Confidential-tier deals are fenced from admins via the
-- centralized opportunity_is_confidential() helper, matching public.documents.
DROP POLICY IF EXISTS "extraction_provenance_select_scoped"
  ON public.opportunity_extraction_provenance;
CREATE POLICY "extraction_provenance_select_scoped"
  ON public.opportunity_extraction_provenance
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_extraction_provenance.opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(
        public.opportunity_extraction_provenance.opportunity_id
      )
    )
  );

-- INSERT: an authenticated user records provenance for a create they performed.
DROP POLICY IF EXISTS "extraction_provenance_insert_self"
  ON public.opportunity_extraction_provenance;
CREATE POLICY "extraction_provenance_insert_self"
  ON public.opportunity_extraction_provenance
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- No UPDATE/DELETE policies: provenance rows are immutable audit records. They
-- are removed only by ON DELETE CASCADE when the parent opportunity is deleted.
