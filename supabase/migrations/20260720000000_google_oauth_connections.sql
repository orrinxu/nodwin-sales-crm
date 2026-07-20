-- supabase/migrations/20260720000000_google_oauth_connections.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-817 (foundation for ORR-773): per-user Google OAuth token store.
--
-- One row per user holds that user's Google OAuth connection: the granted
-- scopes, the connected Google account email, connection status, and the
-- access / refresh tokens. Tokens are stored ENCRYPTED (app-layer AES-256-GCM,
-- key from the GOOGLE_TOKEN_ENC_KEY server env — see
-- apps/web/lib/security/token-crypto.ts). The DB only ever sees ciphertext;
-- the *_enc columns are never plaintext.
--
-- Access model mirrors public.api_tokens: strictly OWN-ROW RLS. A user manages
-- only their own connection. The future token-refresh routine runs as the
-- service role (which bypasses RLS in Supabase), so there is intentionally no
-- service_role policy here — same shape as api_tokens' out-of-band hash lookup.

CREATE TABLE IF NOT EXISTS public.google_oauth_connections (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One connection per user. ON DELETE CASCADE so removing a user drops their
  -- stored tokens; UNIQUE so upsert-by-user is the write path.
  user_id                  uuid        NOT NULL UNIQUE
                                       REFERENCES public.users(id) ON DELETE CASCADE,
  google_account_email     text,
  -- AES-256-GCM ciphertext (base64 of iv || authTag || ciphertext). Never
  -- plaintext. Nullable so a partial/pending connection row can exist.
  access_token_enc         text,
  refresh_token_enc        text,
  access_token_expires_at  timestamptz,
  granted_scopes           text[]      NOT NULL DEFAULT '{}',
  status                   text        NOT NULL DEFAULT 'connected'
                                       CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  connected_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.google_oauth_connections IS
  'Per-user Google OAuth connection + token store (ORR-817, foundation for '
  'ORR-773). One row per user (UNIQUE user_id). access_token_enc / '
  'refresh_token_enc hold app-layer AES-256-GCM ciphertext only — never '
  'plaintext. Own-row RLS; the service-role refresh routine runs outside RLS.';

COMMENT ON COLUMN public.google_oauth_connections.access_token_enc IS
  'AES-256-GCM ciphertext of the Google access token (base64 iv||authTag||ct). '
  'Encrypt/decrypt via apps/web/lib/security/token-crypto.ts.';

COMMENT ON COLUMN public.google_oauth_connections.refresh_token_enc IS
  'AES-256-GCM ciphertext of the Google refresh token (base64 iv||authTag||ct). '
  'Encrypt/decrypt via apps/web/lib/security/token-crypto.ts.';

CREATE INDEX IF NOT EXISTS idx_google_oauth_connections_user_id
  ON public.google_oauth_connections (user_id);

-- ============================================================================
-- UPDATED_AT TRIGGER (mirrors set_integration_config_timestamps)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_google_oauth_connections_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS google_oauth_connections_timestamps ON public.google_oauth_connections;
CREATE TRIGGER google_oauth_connections_timestamps
  BEFORE UPDATE ON public.google_oauth_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_google_oauth_connections_timestamps();

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.google_oauth_connections');

-- The encrypted token columns must never persist in audit_log even as
-- ciphertext (ciphertext + a leaked key = the secret). Extend the ORR-696 /
-- ORR-781 redaction strip-list to cover them. CREATE OR REPLACE keeps every
-- previously stripped column and adds the two new *_enc columns.
CREATE OR REPLACE FUNCTION audit.redact_secrets(_data jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  -- Strip columns that hold third-party credentials. Applied to every audit
  -- payload; a no-op for tables that don't have these columns.
  SELECT CASE
    WHEN _data IS NULL THEN NULL
    ELSE _data
      - 'api_key'
      - 'smtp_password'
      - 'resend_api_key'
      - 'embeddings_api_key'
      - 'generation_api_key'
      - 'transcription_api_key'
      - 'access_token'
      - 'refresh_token'
      - 'access_token_enc'
      - 'refresh_token_enc'
      - 'webhook_url'
  END;
$$;

COMMENT ON FUNCTION audit.redact_secrets(jsonb) IS
  'ORR-696/ORR-781/ORR-817: removes credential-bearing columns from an audit '
  'payload so secrets (api keys, tokens, encrypted token blobs, smtp/slack-'
  'webhook URLs) never land in audit_log. Keep this list in sync when a new '
  'secret column is added to any audited table.';

-- ============================================================================
-- ROW-LEVEL SECURITY — own-row only (mirrors public.api_tokens)
-- ============================================================================

ALTER TABLE public.google_oauth_connections ENABLE ROW LEVEL SECURITY;

-- A user manages only their own Google connection. The token-refresh routine
-- runs on the service role (which bypasses RLS), so it is intentionally not
-- expressible as an RLS policy here.
CREATE POLICY google_oauth_connections_select_own ON public.google_oauth_connections
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY google_oauth_connections_insert_own ON public.google_oauth_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY google_oauth_connections_update_own ON public.google_oauth_connections
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY google_oauth_connections_delete_own ON public.google_oauth_connections
  FOR DELETE USING (user_id = auth.uid());
