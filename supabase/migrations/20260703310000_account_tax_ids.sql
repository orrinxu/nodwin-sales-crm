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

-- ── Account-write helper (single source of truth for the "mirror" rule) ──────
-- SECURITY DEFINER so it reads accounts regardless of RLS, applying the same
-- rule as accounts_update_own_or_admin explicitly. Used by every account_tax_ids
-- policy and the replace RPC, so the rule can never drift across the 6 clauses.
CREATE OR REPLACE FUNCTION public.can_write_account(_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = _account_id
        AND (a.account_owner_user_id = auth.uid() OR a.created_by = auth.uid())
    );
$$;
REVOKE ALL ON FUNCTION public.can_write_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_write_account(uuid) TO authenticated;

-- ── RLS: mirror the parent account (admin OR owner OR creator) ────────────────
ALTER TABLE public.account_tax_ids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_tax_ids_select_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_select_via_account"
  ON public.account_tax_ids FOR SELECT TO authenticated
  USING (public.can_write_account(account_id));

DROP POLICY IF EXISTS "account_tax_ids_insert_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_insert_via_account"
  ON public.account_tax_ids FOR INSERT TO authenticated
  WITH CHECK (public.can_write_account(account_id));

DROP POLICY IF EXISTS "account_tax_ids_update_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_update_via_account"
  ON public.account_tax_ids FOR UPDATE TO authenticated
  USING (public.can_write_account(account_id))
  WITH CHECK (public.can_write_account(account_id));

DROP POLICY IF EXISTS "account_tax_ids_delete_via_account" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_delete_via_account"
  ON public.account_tax_ids FOR DELETE TO authenticated
  USING (public.can_write_account(account_id));

DROP POLICY IF EXISTS "account_tax_ids_service_role_all" ON public.account_tax_ids;
CREATE POLICY "account_tax_ids_service_role_all"
  ON public.account_tax_ids TO service_role USING (true) WITH CHECK (true);

SELECT audit.attach_trigger('public.account_tax_ids');

-- ── Atomic replace RPC (the web write path) ──────────────────────────────────
-- Doing DELETE + INSERT as two supabase-js calls is NOT atomic: if the insert
-- fails after the delete commits, the account is left with zero tax IDs (silent
-- data loss). This SECURITY DEFINER function does both in ONE transaction,
-- authorises via can_write_account, and locks the account row so concurrent
-- replaces are last-write-wins instead of merging to a union.
CREATE OR REPLACE FUNCTION public.replace_account_tax_ids(_account_id uuid, _tax_ids jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF NOT public.can_write_account(_account_id) THEN
    RAISE EXCEPTION 'not authorised to modify tax ids for account %', _account_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialise concurrent replaces on the same account (last-write-wins).
  PERFORM 1 FROM public.accounts WHERE id = _account_id FOR UPDATE;

  DELETE FROM public.account_tax_ids WHERE account_id = _account_id;

  INSERT INTO public.account_tax_ids (account_id, tax_type, value, created_by, updated_by)
  SELECT _account_id, elem->>'tax_type', btrim(elem->>'value'), _uid, _uid
  FROM jsonb_array_elements(coalesce(_tax_ids, '[]'::jsonb)) AS elem
  WHERE btrim(coalesce(elem->>'value', '')) <> ''
  ON CONFLICT (account_id, tax_type, value) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_account_tax_ids(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_account_tax_ids(uuid, jsonb) TO authenticated;

-- ── One-time backfill from custom_data ───────────────────────────────────────
-- This is a one-time data migration, NOT a resurrect-safe idempotent op: it only
-- touches accounts that have NO structured tax IDs yet, so replaying it never
-- re-adds a value a user later deleted via the form on an account that still has
-- other tax IDs. (The source custom_data is intentionally left in place.)
--
-- tax_trn_mena is deliberately NOT auto-mapped: it was a region-wide MENA TRN, so
-- mapping it to a single country (e.g. AE) would mislabel Saudi/Qatari/etc.
-- values. Those need manual reconciliation once Finance confirms the per-country
-- MENA tax-type taxonomy (the seed is provisional).
--
-- Reverse (down-migration) — delete the backfilled rows (btrim to match the
-- forward insert exactly):
--   DELETE FROM public.account_tax_ids ati USING public.accounts a
--   WHERE ati.account_id = a.id AND (
--     (ati.tax_type='IN_GSTIN' AND ati.value = btrim(a.custom_data->>'tax_gst_in')) OR
--     (ati.tax_type='IN_PAN'   AND ati.value = btrim(a.custom_data->>'tax_pan_in')) OR
--     (ati.tax_type='EU_VAT'   AND ati.value = btrim(a.custom_data->>'tax_vat_eu')));
-- The tax_* custom fields are left in place; Ticket 3 stops rendering them.

INSERT INTO public.account_tax_ids (account_id, tax_type, value)
SELECT a.id, m.tax_type, btrim(a.custom_data->>m.cf_key)
FROM public.accounts a
CROSS JOIN (VALUES
  ('tax_gst_in', 'IN_GSTIN'),
  ('tax_pan_in', 'IN_PAN'),
  ('tax_vat_eu', 'EU_VAT')
) AS m(cf_key, tax_type)
WHERE a.custom_data ? m.cf_key
  AND btrim(coalesce(a.custom_data->>m.cf_key, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.account_tax_ids ati WHERE ati.account_id = a.id
  )
ON CONFLICT (account_id, tax_type, value) DO NOTHING;
