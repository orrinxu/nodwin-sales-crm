-- supabase/migrations/20260710000000_file_type_categories.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-659: file_type_categories lookup table + migrate document_category enum
-- to text FK referencing it.
--
-- Steps:
--   1. Create public.file_type_categories lookup table (text PK).
--   2. Seed with the 8 existing document_category enum values.
--   3. Migrate documents.category     from enum → text FK.
--   4. Migrate document_chunks.category from enum → text FK.
--   5. Update search_document_chunks() return type (category → text).
--   6. RLS, audit trigger, updated_at trigger on file_type_categories.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Create file_type_categories lookup table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.file_type_categories (
  code         text        PRIMARY KEY,
  label        text        NOT NULL,
  description  text,
  active       boolean     NOT NULL DEFAULT true,
  display_order int        NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_file_type_categories_active
  ON public.file_type_categories(active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_file_type_categories_display_order
  ON public.file_type_categories(display_order);

-- Drop generic audit trigger if attached in a prior run (it expects uuid "id";
-- this table uses text "code" as PK — custom trigger below).
DROP TRIGGER IF EXISTS audit_trigger ON public.file_type_categories;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Seed with existing document_category enum values
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.file_type_categories (code, label, description, display_order) VALUES
  ('rfp',          'RFP',           'Request for Proposal',                1),
  ('budget',       'Budget',        'Budget documents and financial plans', 2),
  ('proposal',     'Proposal',      'Sales proposals and pitches',          3),
  ('contract',     'Contract',      'Contracts and legal agreements',       4),
  ('po',           'Purchase Order','Purchase orders',                     5),
  ('invoice',      'Invoice',       'Invoices and billing documents',       6),
  ('presentation', 'Presentation',  'Presentations and slide decks',        7),
  ('other',        'Other',         'Miscellaneous document types',        99)
ON CONFLICT (code) DO UPDATE SET
  label         = EXCLUDED.label,
  description   = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Migrate documents.category from enum to text FK
-- ═══════════════════════════════════════════════════════════════════════════════

-- 3a. Check if column is still an enum (idempotency guard).
DO $$
DECLARE
  _col_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO _col_type
  FROM pg_attribute
  WHERE attrelid  = 'public.documents'::regclass
    AND attname   = 'category'
    AND NOT attisdropped;

  IF _col_type LIKE '%document_category' THEN
    ALTER TABLE public.documents
      ALTER COLUMN category SET DATA TYPE text USING category::text;
  END IF;
END;
$$;

-- 3b. Re-assert NOT NULL and DEFAULT (SET DATA TYPE may drop these).
ALTER TABLE public.documents
  ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.documents
  ALTER COLUMN category SET DEFAULT 'other';

-- 3c. Add FK (guarded against race).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = 'public.documents'::regclass
      AND  conname  = 'fk_documents_category'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT fk_documents_category
      FOREIGN KEY (category) REFERENCES public.file_type_categories(code);
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Migrate document_chunks.category from enum to text FK
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  _col_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO _col_type
  FROM pg_attribute
  WHERE attrelid  = 'public.document_chunks'::regclass
    AND attname   = 'category'
    AND NOT attisdropped;

  IF _col_type LIKE '%document_category' THEN
    ALTER TABLE public.document_chunks
      ALTER COLUMN category SET DATA TYPE text USING category::text;
  END IF;
END;
$$;

-- 4b. Add FK (guarded). Column stays nullable (as it was for document_chunks).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid = 'public.document_chunks'::regclass
      AND  conname  = 'fk_document_chunks_category'
  ) THEN
    ALTER TABLE public.document_chunks
      ADD CONSTRAINT fk_document_chunks_category
      FOREIGN KEY (category) REFERENCES public.file_type_categories(code);
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Update search_document_chunks() — category return type text (ex-enum)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop first so we can change the return type (CREATE OR REPLACE cannot).
DROP FUNCTION IF EXISTS public.search_document_chunks(vector, text, integer, double precision);

CREATE FUNCTION public.search_document_chunks(
  _query          vector,
  _model          text,
  _match_count    integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.25
)
RETURNS TABLE (
  id              uuid,
  document_id     uuid,
  drive_file_id   text,
  page_ref        text,
  chunk_index     integer,
  opportunity_id  uuid,
  account_id      uuid,
  visibility_tier public.visibility_tier,
  category        text,
  content         text,
  similarity      double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH candidates AS MATERIALIZED (
    SELECT dc.*
    FROM public.document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND dc.embedding_model = _model
      AND dc.embedding_dim = vector_dims(_query)
      AND EXISTS (
        SELECT 1 FROM public.opportunity_visibility ov
        WHERE ov.opportunity_id = dc.opportunity_id
          AND ov.user_id = auth.uid()
      )
  )
  SELECT
    c.id, c.document_id, c.drive_file_id, c.page_ref, c.chunk_index,
    c.opportunity_id, c.account_id, c.visibility_tier, c.category, c.content,
    1 - (c.embedding <=> _query) AS similarity
  FROM candidates c
  WHERE (1 - (c.embedding <=> _query)) >= _min_similarity
  ORDER BY c.embedding <=> _query
  LIMIT GREATEST(_match_count, 0);
$$;

COMMENT ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) IS
  'ORR-621 cross-deal knowledge retrieval (category column migrated to text FK per ORR-659). Returns document_chunks ranked by cosine similarity, filtered in-query to chunks whose opportunity the caller is entitled to via opportunity_visibility (auth.uid()). All tiers gated on membership — Standard is NOT org-open. SECURITY DEFINER; entitlement cannot be spoofed via arguments.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Trigger: audit fields on file_type_categories
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_file_type_categories_audit_fields()
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

DROP TRIGGER IF EXISTS file_type_categories_audit_fields_trigger ON public.file_type_categories;
CREATE TRIGGER file_type_categories_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.file_type_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_file_type_categories_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Custom audit-log trigger (text PK — cannot use generic audit.attach_trigger)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_file_type_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_user_id     uuid;
  _actor_source      text;
  _code              text;
  _old_data          jsonb;
  _new_data          jsonb;
  _changed_fields    jsonb;
BEGIN
  BEGIN
    _actor_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _actor_user_id := NULL;
  END;

  IF _actor_user_id IS NULL THEN
    BEGIN
      _actor_user_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _actor_user_id := NULL;
    END;
  END IF;

  _actor_source := CASE WHEN _actor_user_id IS NOT NULL THEN 'user' ELSE 'system' END;

  IF TG_OP = 'DELETE' THEN
    _code := OLD.code;
    _old_data := to_jsonb(OLD);
    _new_data := NULL;
    _changed_fields := _old_data;
  ELSIF TG_OP = 'INSERT' THEN
    _code := NEW.code;
    _old_data := NULL;
    _new_data := to_jsonb(NEW);
    _changed_fields := _new_data;
  ELSE
    _code := NEW.code;
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _changed_fields := audit.jsonb_diff(_old_data, _new_data);
  END IF;

  INSERT INTO public.audit_log (
    table_name, row_id, operation, changed_fields, old_data, new_data,
    actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
  ) VALUES (
    TG_TABLE_NAME,
    md5(_code)::uuid,
    TG_OP,
    _changed_fields,
    _old_data,
    _new_data,
    _actor_user_id,
    _actor_source,
    audit.get_request_header('x-forwarded-for'),
    audit.get_request_header('user-agent'),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_file_type_category_trigger ON public.file_type_categories;
CREATE TRIGGER audit_file_type_category_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.file_type_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_file_type_category();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.file_type_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read.
DROP POLICY IF EXISTS "file_type_categories_select_authenticated" ON public.file_type_categories;
CREATE POLICY "file_type_categories_select_authenticated"
  ON public.file_type_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: admin only.
DROP POLICY IF EXISTS "file_type_categories_insert_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_insert_admin"
  ON public.file_type_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- UPDATE: admin only.
DROP POLICY IF EXISTS "file_type_categories_update_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_update_admin"
  ON public.file_type_categories
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- DELETE: admin only.
DROP POLICY IF EXISTS "file_type_categories_delete_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_delete_admin"
  ON public.file_type_categories
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- service_role bypass.
DROP POLICY IF EXISTS "file_type_categories_service_role_all" ON public.file_type_categories;
CREATE POLICY "file_type_categories_service_role_all"
  ON public.file_type_categories
  TO service_role
  USING (true)
  WITH CHECK (true);
