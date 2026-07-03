-- supabase/migrations/20260703300000_tax_id_types.sql
--
-- Tax ID reference table (ORR-622 Ticket 2, GATE C = seeded reference table,
-- admin CRUD UI deferred). Drives the country -> tax-type mapping on the
-- Account form and per-type format validation.
--
-- ⚠️ PROVISIONAL SEED: the labels and format_regex below are a research starting
-- point and MUST be confirmed with Finance before go-live (per the brief). Treat
-- as non-authoritative until then. All regexes are anchored and free of nested
-- quantifiers (ReDoS-safe) so they're safe to run via new RegExp() in the form.
--
-- Mirrors the currencies reference-table pattern: all authenticated read;
-- admin-only writes; service_role bypass; audit trigger.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.tax_id_types (
  code          text        PRIMARY KEY,
  label         text        NOT NULL,
  country_iso   text        NOT NULL,   -- ISO 3166-1 alpha-2
  format_regex  text,                   -- optional anchored validation pattern
  display_order int         NOT NULL DEFAULT 0,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid,
  CONSTRAINT chk_tax_id_types_country_iso CHECK (country_iso ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_tax_id_types_country_iso
  ON public.tax_id_types(country_iso) WHERE active;

COMMENT ON TABLE public.tax_id_types IS
  'Reference set of tax identifier types per country (drives the Account form tax '
  'rows + per-type format validation). Seeded; admin CRUD UI deferred (ORR-622). '
  'Labels/format_regex are PROVISIONAL pending Finance confirmation.';

-- ── Seed (PROVISIONAL — confirm with Finance) ────────────────────────────────
INSERT INTO public.tax_id_types (code, label, country_iso, format_regex, display_order) VALUES
  ('SG_UEN',   'UEN',                          'SG', '^[0-9A-Z]{9,10}$',                                                  1),
  ('SG_GST',   'GST Reg. No.',                 'SG', '^[0-9A-Z]{9,10}$',                                                  2),
  ('IN_GSTIN', 'GSTIN',                        'IN', '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$',                 1),
  ('IN_PAN',   'PAN',                          'IN', '^[A-Z]{5}[0-9]{4}[A-Z]$',                                          2),
  ('KR_BRN',   'Business Registration Number', 'KR', '^[0-9]{3}-[0-9]{2}-[0-9]{5}$',                                      1),
  ('JP_CN',    'Corporate Number',             'JP', '^[0-9]{13}$',                                                       1),
  ('EU_VAT',   'VAT Number',                   'EU', '^[A-Z]{2}[0-9A-Z]{2,12}$',                                          1),
  ('AE_TRN',   'TRN',                          'AE', '^[0-9]{15}$',                                                       1),
  ('CN_USCC',  'Unified Social Credit Code',   'CN', '^[0-9A-Z]{18}$',                                                    1)
ON CONFLICT (code) DO NOTHING;

-- ── Audit fields trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_tax_id_types_audit_fields()
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

DROP TRIGGER IF EXISTS tax_id_types_audit_fields_trigger ON public.tax_id_types;
CREATE TRIGGER tax_id_types_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.tax_id_types
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_id_types_audit_fields();

-- ── RLS (mirrors currencies: all authenticated read, admin write) ────────────
ALTER TABLE public.tax_id_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_tax_id_types" ON public.tax_id_types;
CREATE POLICY "authenticated_select_tax_id_types"
  ON public.tax_id_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin_insert_tax_id_types" ON public.tax_id_types;
CREATE POLICY "admin_insert_tax_id_types"
  ON public.tax_id_types FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_tax_id_types" ON public.tax_id_types;
CREATE POLICY "admin_update_tax_id_types"
  ON public.tax_id_types FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_delete_tax_id_types" ON public.tax_id_types;
CREATE POLICY "admin_delete_tax_id_types"
  ON public.tax_id_types FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "service_role_all_tax_id_types" ON public.tax_id_types;
CREATE POLICY "service_role_all_tax_id_types"
  ON public.tax_id_types TO service_role USING (true) WITH CHECK (true);

SELECT audit.attach_trigger('public.tax_id_types');
