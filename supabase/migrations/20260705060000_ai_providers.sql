-- supabase/migrations/20260705060000_ai_providers.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (holds AI provider credentials).
--
-- ORR-635: admin-configurable AI providers. Moves the general AI provider config
-- (endpoints / models / API keys) from env-only (audit ARCH-1) into an
-- admin-managed table, and adds provider SELECTION: a primary provider + an
-- ordered fallback chain. Resolves DB-first, env-fallback.
--
-- One row per provider. base_url is the endpoint (IP:port, e.g.
-- http://192.168.88.51:8080/v1) for self-hosted providers (llama.cpp /
-- Ollama); cloud providers use their default endpoint unless overridden.
-- SELECT is ADMIN-ONLY so api_key never leaks to non-admins; the server reads
-- via the service-role client.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.ai_providers (
  provider    text        PRIMARY KEY
              CHECK (provider IN ('claude', 'gemini', 'kimi', 'deepseek', 'openai_compatible', 'ollama_local')),
  enabled     boolean     NOT NULL DEFAULT false,
  base_url    text,        -- endpoint (ip:port) — required for self-hosted, optional override for cloud
  model       text,
  api_key     text,        -- SECRET — write-only in UI, admin-only + service-role read
  priority    integer     NOT NULL DEFAULT 100,   -- fallback order; lower runs first
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid
);

COMMENT ON TABLE public.ai_providers IS
  'Admin-managed AI provider config + selection (ORR-635). Resolves DB-first, env-fallback. SELECT admin-only; api_key never exposed to non-admins.';

-- Seed the known providers (disabled) so the admin page lists them all.
INSERT INTO public.ai_providers (provider, priority) VALUES
  ('claude', 10), ('gemini', 20), ('kimi', 30),
  ('deepseek', 40), ('openai_compatible', 50), ('ollama_local', 60)
ON CONFLICT (provider) DO NOTHING;

-- The selected primary provider (runs first, ahead of the priority order).
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS primary_provider text
    REFERENCES public.ai_providers(provider) ON DELETE SET NULL;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.set_ai_providers_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS ai_providers_updated_at ON public.ai_providers;
CREATE TRIGGER ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_providers_updated_at();

SELECT audit.attach_trigger('public.ai_providers');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS (mirror: supabase/policies/ai_providers.sql)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_providers_select_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_select_admin" ON public.ai_providers
  FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_insert_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_insert_admin" ON public.ai_providers
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_update_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_update_admin" ON public.ai_providers
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_delete_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_delete_admin" ON public.ai_providers
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_service_role" ON public.ai_providers;
CREATE POLICY "ai_providers_service_role" ON public.ai_providers
  TO service_role USING (true) WITH CHECK (true);
