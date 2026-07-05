-- supabase/migrations/20260705000000_ai_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (holds AI endpoint credentials).
--
-- ORR-634 / feat/orr-634-admin-ai-settings: admin-configurable AI / Knowledge
-- settings. Moves the ORR-620/621 seams (embeddings endpoint, self-hosted RAG
-- generation endpoint, feature toggles) from env-only into an admin-managed
-- table. Config resolves DB-first, env-fallback (see lib/data/ai-settings.ts).
--
-- Like email_transport, SELECT is ADMIN-ONLY so the API keys never leak to
-- non-admins; the server/worker reads via the service-role client (bypasses RLS).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Embeddings — ingestion AND query must use the same model.
  embeddings_base_url text,
  embeddings_model    text,
  embeddings_api_key  text,        -- SECRET — write-only in UI, admin-only + service-role read
  -- Generation — self-hosted RAG (llama.cpp / OpenAI-compatible).
  generation_base_url text,
  generation_model    text,
  generation_api_key  text,        -- SECRET
  -- Feature toggles.
  ingestion_enabled   boolean     NOT NULL DEFAULT true,
  search_enabled      boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid
);

COMMENT ON TABLE public.ai_settings IS
  'Admin-managed AI / Knowledge config (ORR-634). Resolves DB-first, env-fallback. SELECT admin-only; secrets never exposed to non-admins.';

-- updated_at touch
CREATE OR REPLACE FUNCTION public.set_ai_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ai_settings_updated_at ON public.ai_settings;
CREATE TRIGGER ai_settings_updated_at
  BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_settings_updated_at();

-- Audit config changes.
SELECT audit.attach_trigger('public.ai_settings');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS  (mirror in supabase/policies/ai_settings.sql for the coverage linter)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings_select_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_select_admin"
  ON public.ai_settings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_insert_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_insert_admin"
  ON public.ai_settings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_update_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_update_admin"
  ON public.ai_settings FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_delete_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_delete_admin"
  ON public.ai_settings FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_service_role" ON public.ai_settings;
CREATE POLICY "ai_settings_service_role"
  ON public.ai_settings TO service_role
  USING (true) WITH CHECK (true);
