-- supabase/migrations/20260705070000_stuck_deal_settings.sql
--
-- ORR-103: org-wide, admin-configurable per-stage thresholds for the "Stuck
-- Deals" dashboard widget. One row per OPEN pipeline stage; a deal is "stuck"
-- when its days-since-last-activity meets or exceeds the threshold for its stage.
-- Org-wide (no entity scoping) for v1. Admin-only; the widget reads via the
-- service-role client. Idempotent.

CREATE TABLE IF NOT EXISTS public.stuck_deal_settings (
  stage          text        PRIMARY KEY
                 CHECK (stage IN ('qualify', 'meet_and_present', 'propose', 'negotiate', 'verbal_agreement')),
  threshold_days integer     NOT NULL CHECK (threshold_days > 0 AND threshold_days <= 365),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  updated_by     uuid
);

COMMENT ON TABLE public.stuck_deal_settings IS
  'Admin-configurable per-open-stage staleness thresholds (days since last activity) for the Stuck Deals widget (ORR-103). Org-wide; admin-only; widget reads via service role.';

-- Seed the proposed v1 defaults (only open stages). Closed stages never stall.
INSERT INTO public.stuck_deal_settings (stage, threshold_days) VALUES
  ('qualify', 21), ('meet_and_present', 14), ('propose', 10),
  ('negotiate', 7), ('verbal_agreement', 5)
ON CONFLICT (stage) DO NOTHING;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.set_stuck_deal_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS stuck_deal_settings_updated_at ON public.stuck_deal_settings;
CREATE TRIGGER stuck_deal_settings_updated_at
  BEFORE UPDATE ON public.stuck_deal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_stuck_deal_settings_updated_at();

SELECT audit.attach_trigger('public.stuck_deal_settings');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS (mirror: supabase/policies/stuck_deal_settings.sql)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.stuck_deal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stuck_deal_settings_select_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_select_admin" ON public.stuck_deal_settings
  FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_insert_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_insert_admin" ON public.stuck_deal_settings
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_update_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_update_admin" ON public.stuck_deal_settings
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_delete_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_delete_admin" ON public.stuck_deal_settings
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_service_role" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_service_role" ON public.stuck_deal_settings
  TO service_role USING (true) WITH CHECK (true);
