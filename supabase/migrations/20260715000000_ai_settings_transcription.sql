-- supabase/migrations/20260715000000_ai_settings_transcription.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (ai_settings holds AI endpoint credentials).
--
-- ORR-737 (Voice/Text Record Generator, ORR-732 Track B, gate G2): admin-managed
-- speech-to-text (Whisper) endpoint. Mirrors the embeddings_/generation_ config
-- already on ai_settings — an OpenAI-compatible transcription server (local
-- Whisper on the VPS/lanbox, or cloud). Config resolves DB-first, env-fallback
-- (TRANSCRIPTION_*); the transcription seam reads it via the service-role client.
--
-- Additive columns only — RLS is table-level (admin-only SELECT/INSERT/UPDATE/
-- DELETE + service_role bypass), so new columns need no policy change and the
-- supabase/policies/ai_settings.sql mirror is unaffected.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS transcription_base_url text,
  ADD COLUMN IF NOT EXISTS transcription_model    text,
  -- SECRET — write-only in the admin UI, admin-only + service-role read (RLS).
  ADD COLUMN IF NOT EXISTS transcription_api_key  text,
  ADD COLUMN IF NOT EXISTS transcription_enabled  boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ai_settings.transcription_base_url IS
  'ORR-737: OpenAI-compatible Whisper/STT endpoint base URL (e.g. http://host:9000/v1). DB-first, env-fallback TRANSCRIPTION_BASE_URL.';
COMMENT ON COLUMN public.ai_settings.transcription_api_key IS
  'ORR-737: SECRET bearer key for the transcription endpoint. Write-only in UI; never exposed to non-admins.';
