-- supabase/migrations/20260711010000_cost_of_cash_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Cost-of-cash / working-capital finance settings (Admin → Finance).
-- Home for the parameters the deal working-capital derivation reads:
--   • annual_rate           — annual cost of financing (D2; default 18%/yr).
--   • financing_cost_method — how cost of cash is computed (D3; default the
--     integral method — area under the negative cumulative curve). TBD pending
--     finance sign-off; exposed as a setting so finance can switch it.
--   • deduction_base        — denominator for the project % deduction (D6;
--     default over revenue). May change per finance.
--
-- Scope discriminator mirrors reporting_currency_settings: nullable entity_id
-- where NULL = group-wide default, non-null = per-entity override.
-- RLS: read = all authenticated; write = admin; service_role = full (matches the
-- other financial-settings tables). Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.cost_of_cash_settings (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            uuid          REFERENCES public.entities(id) ON DELETE CASCADE,
  annual_rate          numeric(6,5)  NOT NULL DEFAULT 0.18 CHECK (annual_rate >= 0 AND annual_rate < 10),
  financing_cost_method text         NOT NULL DEFAULT 'integral'
                         CHECK (financing_cost_method IN ('integral', 'peak_duration')),
  deduction_base       text          NOT NULL DEFAULT 'revenue'
                         CHECK (deduction_base IN ('revenue', 'profit')),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cost_of_cash_settings IS
  'Working-capital finance settings. NULL entity_id = group-wide default.';

-- At most one group-wide row (entity_id IS NULL) and one override per entity.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_of_cash_settings_group
  ON public.cost_of_cash_settings ((entity_id IS NULL)) WHERE entity_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cost_of_cash_settings_entity
  ON public.cost_of_cash_settings (entity_id) WHERE entity_id IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_cost_of_cash_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cost_of_cash_settings_updated_at_trigger ON public.cost_of_cash_settings;
CREATE TRIGGER cost_of_cash_settings_updated_at_trigger
  BEFORE UPDATE ON public.cost_of_cash_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_cost_of_cash_settings_updated_at();

SELECT audit.attach_trigger('public.cost_of_cash_settings');

-- ── RLS: read = all authenticated; write = admin; service_role = full ──────────
ALTER TABLE public.cost_of_cash_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_of_cash_settings_select_auth" ON public.cost_of_cash_settings;
CREATE POLICY "cost_of_cash_settings_select_auth"
  ON public.cost_of_cash_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "cost_of_cash_settings_insert_admin" ON public.cost_of_cash_settings;
CREATE POLICY "cost_of_cash_settings_insert_admin"
  ON public.cost_of_cash_settings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "cost_of_cash_settings_update_admin" ON public.cost_of_cash_settings;
CREATE POLICY "cost_of_cash_settings_update_admin"
  ON public.cost_of_cash_settings FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "cost_of_cash_settings_delete_admin" ON public.cost_of_cash_settings;
CREATE POLICY "cost_of_cash_settings_delete_admin"
  ON public.cost_of_cash_settings FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "cost_of_cash_settings_service_role" ON public.cost_of_cash_settings;
CREATE POLICY "cost_of_cash_settings_service_role"
  ON public.cost_of_cash_settings TO service_role USING (true) WITH CHECK (true);
