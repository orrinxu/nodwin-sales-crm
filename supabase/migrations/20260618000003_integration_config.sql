-- supabase/migrations/20260618000003_integration_config.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-518 / ORR-506-db: Integration config schema.
--
-- Creates:
--   public.integration_settings   — key-value org-level integration toggles
--   public.slack_connections      — Slack workspace connections
--   public.email_settings         — email / Resend domain config
--   public.salesforce_connections — Salesforce instance connections
--
-- Extends:
--   public.drive_config — adds Google Workspace scope toggles
--
-- RLS: read = all authenticated; write = admin only; service_role = full access.
-- Audit: generic audit.attach_trigger() (all tables use uuid PK).
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. INTEGRATION SETTINGS (org-level key-value toggles)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL,
  value       jsonb       NOT NULL DEFAULT '{}',
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_settings_key_unique UNIQUE (key)
);

COMMENT ON TABLE public.integration_settings IS
  'Org-level integration feature toggles and configuration. Key-value store with JSONB values.';

CREATE INDEX IF NOT EXISTS idx_integration_settings_key
  ON public.integration_settings(key);

-- ============================================================================
-- 2. SLACK CONNECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.slack_connections (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   text        NOT NULL,
  workspace_name text,
  event_routing  jsonb       NOT NULL DEFAULT '{}',
  status         text        NOT NULL DEFAULT 'disconnected'
                             CHECK (status IN ('disconnected', 'connecting', 'connected', 'error')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slack_connections_workspace_id_unique UNIQUE (workspace_id)
);

COMMENT ON TABLE public.slack_connections IS
  'Slack workspace connections. event_routing configures which events are listened to and how they are routed.';

COMMENT ON COLUMN public.slack_connections.event_routing IS
  'JSONB: event subscription list and per-channel routing rules.';

CREATE INDEX IF NOT EXISTS idx_slack_connections_status
  ON public.slack_connections(status);

CREATE INDEX IF NOT EXISTS idx_slack_connections_workspace_id
  ON public.slack_connections(workspace_id);

-- ============================================================================
-- 3. EMAIL SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_settings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_domain    text,
  inbound_domain   text,
  template_config  jsonb       NOT NULL DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'inactive'
                               CHECK (status IN ('active', 'inactive', 'error')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_settings IS
  'Email / Resend domain configuration. template_config holds per-template settings as JSONB.';

COMMENT ON COLUMN public.email_settings.template_config IS
  'JSONB: per-template overrides (from name, reply-to, custom headers, etc.).';

CREATE INDEX IF NOT EXISTS idx_email_settings_status
  ON public.email_settings(status);

-- ============================================================================
-- 4. SALESFORCE CONNECTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salesforce_connections (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_url  text,
  oauth_state   jsonb       NOT NULL DEFAULT '{}',
  import_status text        NOT NULL DEFAULT 'disconnected'
                            CHECK (import_status IN ('disconnected', 'connecting', 'connected', 'importing', 'error')),
  last_sync_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.salesforce_connections IS
  'Salesforce instance connections. oauth_state holds OAuth flow state; tokens stored in secure storage.';

COMMENT ON COLUMN public.salesforce_connections.oauth_state IS
  'JSONB: OAuth flow state (nonces, redirect URIs, instance metadata). OAuth tokens stored externally.';

CREATE INDEX IF NOT EXISTS idx_salesforce_connections_import_status
  ON public.salesforce_connections(import_status);

-- ============================================================================
-- 5. EXTEND drive_config — Google Workspace scope toggles
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'drive_config'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.drive_config
      ADD COLUMN IF NOT EXISTS gmail_sync_enabled   boolean NOT NULL DEFAULT false;

    ALTER TABLE public.drive_config
      ADD COLUMN IF NOT EXISTS sheets_access_enabled boolean NOT NULL DEFAULT false;

    ALTER TABLE public.drive_config
      ADD COLUMN IF NOT EXISTS docs_access_enabled   boolean NOT NULL DEFAULT false;

    ALTER TABLE public.drive_config
      ADD COLUMN IF NOT EXISTS slides_access_enabled boolean NOT NULL DEFAULT false;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'drive_config'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    COMMENT ON COLUMN public.drive_config.gmail_sync_enabled IS
      'Whether Gmail sync is enabled for this entity.';
    COMMENT ON COLUMN public.drive_config.sheets_access_enabled IS
      'Whether Google Sheets access is enabled for this entity.';
    COMMENT ON COLUMN public.drive_config.docs_access_enabled IS
      'Whether Google Docs access is enabled for this entity.';
    COMMENT ON COLUMN public.drive_config.slides_access_enabled IS
      'Whether Google Slides access is enabled for this entity.';
  END IF;
END;
$$;

-- ============================================================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_integration_config_timestamps()
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

DROP TRIGGER IF EXISTS integration_settings_timestamps ON public.integration_settings;
CREATE TRIGGER integration_settings_timestamps
  BEFORE UPDATE ON public.integration_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_config_timestamps();

DROP TRIGGER IF EXISTS slack_connections_timestamps ON public.slack_connections;
CREATE TRIGGER slack_connections_timestamps
  BEFORE UPDATE ON public.slack_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_config_timestamps();

DROP TRIGGER IF EXISTS email_settings_timestamps ON public.email_settings;
CREATE TRIGGER email_settings_timestamps
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_config_timestamps();

DROP TRIGGER IF EXISTS salesforce_connections_timestamps ON public.salesforce_connections;
CREATE TRIGGER salesforce_connections_timestamps
  BEFORE UPDATE ON public.salesforce_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_config_timestamps();

-- ============================================================================
-- 7. AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.integration_settings');
SELECT audit.attach_trigger('public.slack_connections');
SELECT audit.attach_trigger('public.email_settings');
SELECT audit.attach_trigger('public.salesforce_connections');

-- ============================================================================
-- 8. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.integration_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salesforce_connections ENABLE ROW LEVEL SECURITY;

-- ── integration_settings ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "integration_settings_select_auth" ON public.integration_settings;
CREATE POLICY "integration_settings_select_auth"
  ON public.integration_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "integration_settings_insert_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_insert_admin"
  ON public.integration_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_update_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_update_admin"
  ON public.integration_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_delete_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_delete_admin"
  ON public.integration_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_service_role" ON public.integration_settings;
CREATE POLICY "integration_settings_service_role"
  ON public.integration_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── slack_connections ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "slack_connections_select_auth" ON public.slack_connections;
CREATE POLICY "slack_connections_select_auth"
  ON public.slack_connections
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "slack_connections_insert_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_insert_admin"
  ON public.slack_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_update_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_update_admin"
  ON public.slack_connections
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_delete_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_delete_admin"
  ON public.slack_connections
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_service_role" ON public.slack_connections;
CREATE POLICY "slack_connections_service_role"
  ON public.slack_connections
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── email_settings ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "email_settings_select_auth" ON public.email_settings;
CREATE POLICY "email_settings_select_auth"
  ON public.email_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "email_settings_insert_admin" ON public.email_settings;
CREATE POLICY "email_settings_insert_admin"
  ON public.email_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_update_admin" ON public.email_settings;
CREATE POLICY "email_settings_update_admin"
  ON public.email_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_delete_admin" ON public.email_settings;
CREATE POLICY "email_settings_delete_admin"
  ON public.email_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_service_role" ON public.email_settings;
CREATE POLICY "email_settings_service_role"
  ON public.email_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── salesforce_connections ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "salesforce_connections_select_auth" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_select_auth"
  ON public.salesforce_connections
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "salesforce_connections_insert_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_insert_admin"
  ON public.salesforce_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_update_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_update_admin"
  ON public.salesforce_connections
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_delete_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_delete_admin"
  ON public.salesforce_connections
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_service_role" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_service_role"
  ON public.salesforce_connections
  TO service_role
  USING (true)
  WITH CHECK (true);
