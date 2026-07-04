-- supabase/migrations/20260705000000_ai_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-635: AI settings configuration table.
--
-- Creates:
--   • Table: ai_settings (one row per entity)
--   • updated_at trigger
--   • Audit log trigger
--   • RLS: all authenticated read; admin-only write
--
-- Idempotent: safe to re-run.

-- ── Table: ai_settings ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         uuid NOT NULL UNIQUE REFERENCES public.entities(id) ON DELETE CASCADE,
  default_provider  text,
  default_model     text,
  temperature       numeric(3,2) NOT NULL DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
  max_tokens        integer NOT NULL DEFAULT 4096 CHECK (max_tokens > 0),
  system_prompt     text,
  features_enabled  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_entity_id
  ON public.ai_settings(entity_id);

COMMENT ON TABLE public.ai_settings IS
  'Per-entity AI configuration settings (provider, model, features, prompts).';
COMMENT ON COLUMN public.ai_settings.default_provider IS
  'Default AI provider (e.g. claude, gemini, deepseek).';
COMMENT ON COLUMN public.ai_settings.default_model IS
  'Default AI model to use for this entity.';
COMMENT ON COLUMN public.ai_settings.temperature IS
  'Temperature setting for AI generation (0-2, default 0.7).';
COMMENT ON COLUMN public.ai_settings.max_tokens IS
  'Maximum tokens per AI completion (default 4096).';
COMMENT ON COLUMN public.ai_settings.system_prompt IS
  'Entity-specific system prompt override.';
COMMENT ON COLUMN public.ai_settings.features_enabled IS
  'JSON object of feature flags controlling which AI features are active (e.g. {"search": true, "draft_email": true}).';

-- ── Trigger: keep updated_at current ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_ai_settings_updated_at()
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

DROP TRIGGER IF EXISTS ai_settings_updated_at_trigger ON public.ai_settings;
CREATE TRIGGER ai_settings_updated_at_trigger
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_ai_settings_updated_at();

-- ── Audit log ──────────────────────────────────────────────────────────────────

SELECT audit.attach_trigger('public.ai_settings');

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read AI settings.
DROP POLICY IF EXISTS "ai_settings_select_authenticated" ON public.ai_settings;
CREATE POLICY "ai_settings_select_authenticated"
  ON public.ai_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin users can insert AI settings.
DROP POLICY IF EXISTS "ai_settings_insert_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_insert_admin"
  ON public.ai_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Only admin users can update AI settings.
DROP POLICY IF EXISTS "ai_settings_update_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_update_admin"
  ON public.ai_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- Only admin users can delete AI settings.
DROP POLICY IF EXISTS "ai_settings_delete_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_delete_admin"
  ON public.ai_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Service role bypass for backend operations.
DROP POLICY IF EXISTS "service_role_all_ai_settings" ON public.ai_settings;
CREATE POLICY "service_role_all_ai_settings"
  ON public.ai_settings
  TO service_role
  USING (true)
  WITH CHECK (true);
