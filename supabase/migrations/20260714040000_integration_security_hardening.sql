-- ═══════════════════════════════════════════════════════════════════════════════
-- ORR-696 — Security hardening: integration-table read scope + audit redaction.
-- HIGH-RISK FILE (audit schema + RLS) — see AGENTS.md §6.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Two independent data-exposure fixes surfaced by the 2026-07 audit:
--
-- 1. World-readable integration/config tables. integration_settings,
--    slack_connections, email_settings, salesforce_connections and drive_config
--    all had `FOR SELECT TO authenticated USING (true)` — any signed-in user could
--    read integration config (OAuth state, workspace/channel routing, Drive folder
--    ids, inbound domains). Their WRITE policies are already admin-only; only SELECT
--    was too broad. Tighten SELECT to admin, matching the newer secret tables
--    (email_transport / ai_settings / ai_providers).
--
-- 2. Plaintext secrets in audit_log. audit.log_change() serialised the whole row
--    via to_jsonb(NEW/OLD) with no column filtering, so rotating an api_key /
--    smtp_password wrote its plaintext value into audit_log.{old,new,changed}_data.
--    Redact a fixed set of secret columns before serialising — a single-point fix
--    that covers every audited table (the keys simply don't exist on non-secret
--    tables, so it's a no-op there).
--
-- Idempotent: safe to re-run.

-- ── 1. Secret redaction helper + audit.log_change() rewrite ──────────────────

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
      - 'access_token'
      - 'refresh_token'
  END;
$$;

COMMENT ON FUNCTION audit.redact_secrets(jsonb) IS
  'ORR-696: removes credential-bearing columns from an audit payload so plaintext '
  'secrets never land in audit_log. No-op for tables without those columns.';

-- Rewrite of audit.log_change() (from 20260619000004) — IDENTICAL except each
-- to_jsonb(OLD/NEW) is wrapped in audit.redact_secrets(). Redacting before the
-- diff keeps the diff free of secret values too.
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_user_id  uuid;
  _actor_source   text;
  _old_data       jsonb;
  _new_data       jsonb;
  _changed_fields jsonb;
  _row_id         uuid;
BEGIN
  BEGIN
    _actor_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _actor_user_id := NULL;
  END;

  IF _actor_user_id IS NULL THEN
    BEGIN
      _actor_user_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _actor_user_id := NULL;
    END;
  END IF;

  IF _actor_user_id IS NOT NULL THEN
    _actor_source := 'user';
  ELSE
    _actor_source := 'system';
  END IF;

  IF TG_OP = 'DELETE' THEN
    _old_data := audit.redact_secrets(to_jsonb(OLD));
    _new_data := NULL;
    _changed_fields := _old_data;
    BEGIN
      _row_id := (_old_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id, _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN OLD;

  ELSIF TG_OP = 'INSERT' THEN
    _old_data := NULL;
    _new_data := audit.redact_secrets(to_jsonb(NEW));
    _changed_fields := _new_data;
    BEGIN
      _row_id := (_new_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id, _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;

  ELSE -- UPDATE
    _old_data := audit.redact_secrets(to_jsonb(OLD));
    _new_data := audit.redact_secrets(to_jsonb(NEW));
    _changed_fields := audit.jsonb_diff(_old_data, _new_data);
    BEGIN
      _row_id := (_new_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id, _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;
  END IF;
END;
$$;

-- ── 2. Tighten SELECT on the world-readable integration/config tables ────────
-- Read is now admin-only (matches email_transport / ai_settings / ai_providers).
-- Write policies are unchanged (already admin-only).

DROP POLICY IF EXISTS "integration_settings_select_auth" ON public.integration_settings;
CREATE POLICY "integration_settings_select_auth"
  ON public.integration_settings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_select_auth" ON public.slack_connections;
CREATE POLICY "slack_connections_select_auth"
  ON public.slack_connections FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_select_auth" ON public.email_settings;
CREATE POLICY "email_settings_select_auth"
  ON public.email_settings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_select_auth" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_select_auth"
  ON public.salesforce_connections FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "drive_config_select_authenticated" ON public.drive_config;
CREATE POLICY "drive_config_select_authenticated"
  ON public.drive_config FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');
