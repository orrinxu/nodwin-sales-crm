-- supabase/migrations/20260711000000_api_tokens.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Personal access tokens for the REST API (ORR — CRM API for external agents).
-- A rep generates a token in the CRM, pastes it into their agent (NanoClaw /
-- OpenClaw / Hermes / a script). The API validates the token, resolves the
-- owning user, and runs every call AS that user (a short-lived Supabase JWT is
-- minted server-side so Postgres RLS applies — the token itself never touches
-- the row-level policies). Only the SHA-256 hash of the token is stored; the
-- plaintext is shown once at creation.

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  -- SHA-256 hex of the plaintext token. Never store the token itself.
  token_hash   text NOT NULL UNIQUE,
  -- Non-secret leading fragment (e.g. "nodpat_ab12cd34") shown in the UI so a
  -- rep can tell their tokens apart without exposing the secret.
  token_prefix text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON public.api_tokens (user_id);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- A rep manages only their own tokens. The pre-auth lookup-by-hash the API does
-- runs on the service role (a session-validation step, not a user data query),
-- so it is intentionally not expressible as an RLS policy here.
CREATE POLICY api_tokens_select_own ON public.api_tokens
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY api_tokens_insert_own ON public.api_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY api_tokens_update_own ON public.api_tokens
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY api_tokens_delete_own ON public.api_tokens
  FOR DELETE USING (user_id = auth.uid());
