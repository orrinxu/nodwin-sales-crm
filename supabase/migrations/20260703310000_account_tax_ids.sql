-- supabase/migrations/20260703310000_account_tax_ids.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (new table + RLS on client data).
--
-- Structured tax IDs for accounts (ORR-622 Ticket 2, GATE A = child table).
-- Replaces the hardcoded per-type tax custom fields (tax_gst_in / tax_pan_in /
-- tax_vat_eu / tax_trn_mena in custom_data). Independently queryable, supports
-- per-type validation and import dedupe. Depends on 20260703300000 (tax_id_types).
--
-- RLS mirrors accounts: a user may read/write an account's tax IDs iff they can
-- read/write the parent account (admin OR owner OR creator — see
-- accounts_select_scoped / accounts_update_own_or_admin).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.account_tax_ids (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  tax_type   text        NOT NULL REFERENCES public.tax_id_types(code),
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT chk_account_tax_ids_value_nonempty CHECK (length(btrim(value)) > 0),
  -- Dedupe: an account can hold multiple tax IDs (incl. multiple of a type with
  -- different values), but never an exact duplicate row.
  UNIQUE (account_id, tax_type, value)
);

CREATE INDEX IF NOT EXISTS idx_account_tax_ids_account_id
  ON public.account_tax_ids(account_id);

-- Supports "find the account with this GSTIN" and Salesforce-import dedupe.
CREATE INDEX IF NOT EXISTS idx_account_tax_ids_type_value
  ON public.account_tax_ids(tax_type, value);

COMMENT ON TABLE public.account_tax_ids IS
  'Structured tax identifiers per account (GATE A child table, ORR-622). RLS '
  'mirrors the parent account. Replaces the tax_* custom fields in '
  'accounts.custom_data (backfilled below).';

-- ── Audit fields trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_account_tax_ids_audit_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS account_tax_ids_audit_fields_trigger ON public.account_tax_ids;
CREATE TRIGGER account_tax_ids_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.account_tax_ids
  FOR EACH ROW EXECUTE FUNCTION public.set_account_tax_ids_audit_fields();

-- ── RLS: mirror the parent account (admin OR owner OR creator) ────────────────
ALTER TABLE public.account_tax_ids ENABLE ROW LEVEL SECURITY;

-- A single predicate expressed inline per policy: the caller may act on the tax
-- row iff they are admin OR own/created the parent account.
DROP POLICY IF EXISTS "account_tax_ids_select_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_select_via_account"
  ON public.account_tax_ids FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_tax_ids.account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "account_tax_ids_insert_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_insert_via_account"
  ON public.account_tax_ids FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_tax_ids.account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "account_tax_ids_update_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_update_via_account"
  ON public.account_tax_ids FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_tax_ids.account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_tax_ids.account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "account_tax_ids_delete_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_delete_via_account"
  ON public.account_tax_ids FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = account_tax_ids.account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "account_tax_ids_service_role_all" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_service_role_all"
  ON public.account_tax_ids TO service_role USING (true) WITH CHECK (true);

SELECT audit.attach_trigger('public.account_tax_ids');

-- ── Backfill from custom_data (idempotent) ───────────────────────────────────
-- Reverse (down-migration, documented in the PR): delete the backfilled rows —
--   DELETE FROM public.account_tax_ids ati USING public.accounts a
--   WHERE ati.account_id = a.id AND (
--     (ati.tax_type='IN_GSTIN' AND ati.value = a.custom_data->>'tax_gst_in') OR
--     (ati.tax_type='IN_PAN'   AND ati.value = a.custom_data->>'tax_pan_in') OR
--     (ati.tax_type='EU_VAT'   AND ati.value = a.custom_data->>'tax_vat_eu') OR
--     (ati.tax_type='AE_TRN'   AND ati.value = a.custom_data->>'tax_trn_mena'));
-- The tax_* custom fields are intentionally left in place; Ticket 3 stops
-- rendering them and a later cleanup removes the definitions.

INSERT INTO public.account_tax_ids (account_id, tax_type, value)
SELECT a.id, m.tax_type, btrim(a.custom_data->>m.cf_key)
FROM public.accounts a
CROSS JOIN (VALUES
  ('tax_gst_in',   'IN_GSTIN'),
  ('tax_pan_in',   'IN_PAN'),
  ('tax_vat_eu',   'EU_VAT'),
  ('tax_trn_mena', 'AE_TRN')
) AS m(cf_key, tax_type)
WHERE a.custom_data ? m.cf_key
  AND btrim(coalesce(a.custom_data->>m.cf_key, '')) <> ''
ON CONFLICT (account_id, tax_type, value) DO NOTHING;
