-- supabase/migrations/20260509000000_drive_config.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-311 / T-034: Drive folder configuration table.
--
-- Creates:
--   • Table: drive_config (one row per entity)
--   • RLS: all authenticated read; admin-only write
--   • Audit log trigger
--
-- Idempotent: safe to re-run.

-- ── Table: drive_config ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.drive_config (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                       uuid NOT NULL UNIQUE REFERENCES public.entities(id) ON DELETE CASCADE,
  accounts_parent_folder_id       text,
  opportunities_parent_folder_id  text,
  pnl_parent_folder_id            text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drive_config_entity_id
  ON public.drive_config(entity_id);

COMMENT ON TABLE public.drive_config IS
  'Per-entity Google Drive parent folder configuration for accounts, opportunities, and P&L sheets.';

COMMENT ON COLUMN public.drive_config.accounts_parent_folder_id IS
  'Google Drive folder ID under which per-account folders are created.';
COMMENT ON COLUMN public.drive_config.opportunities_parent_folder_id IS
  'Google Drive folder ID under which per-opportunity folders are created.';
COMMENT ON COLUMN public.drive_config.pnl_parent_folder_id IS
  'Google Drive folder ID under which P&L spreadsheets are created.';

-- ── Trigger: keep updated_at current ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_drive_config_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drive_config_updated_at_trigger ON public.drive_config;
CREATE TRIGGER drive_config_updated_at_trigger
  BEFORE UPDATE ON public.drive_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_drive_config_updated_at();

-- ── Audit log ──────────────────────────────────────────────────────────────────

SELECT audit.attach_trigger('public.drive_config');

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.drive_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the drive configuration.
DROP POLICY IF EXISTS "drive_config_select_authenticated" ON public.drive_config;
CREATE POLICY "drive_config_select_authenticated"
  ON public.drive_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin users can insert drive configuration.
DROP POLICY IF EXISTS "drive_config_insert_admin" ON public.drive_config;
CREATE POLICY "drive_config_insert_admin"
  ON public.drive_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Only admin users can update drive configuration.
DROP POLICY IF EXISTS "drive_config_update_admin" ON public.drive_config;
CREATE POLICY "drive_config_update_admin"
  ON public.drive_config
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- Only admin users can delete drive configuration.
DROP POLICY IF EXISTS "drive_config_delete_admin" ON public.drive_config;
CREATE POLICY "drive_config_delete_admin"
  ON public.drive_config
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Service role bypass for backend operations.
DROP POLICY IF EXISTS "service_role_all_drive_config" ON public.drive_config;
CREATE POLICY "service_role_all_drive_config"
  ON public.drive_config
  TO service_role
  USING (true)
  WITH CHECK (true);
