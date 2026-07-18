-- ORR-781: close audit-log secret-redaction column drift.
--
-- audit.redact_secrets() strips a fixed column list from every audit payload,
-- but two credential columns were added to audited tables AFTER the redaction
-- helper shipped (ORR-696), so they were never redacted:
--   • slack_connections.webhook_url    — added 20260717010000 (a bearer secret:
--     anyone with the URL can post to the channel). slack_connections is audited
--     via the trigger attached in 20260618000003.
--   • ai_settings.transcription_api_key — added 20260715000000; ai_settings is
--     audited via the trigger attached in 20260705000000.
--
-- Both were landing in audit_log.new_data / changed_fields in cleartext and
-- persisting there after rotation/deletion. Add them to the strip list so the
-- ORR-696 invariant ("plaintext secrets never land in audit_log") holds again.
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
      - 'webhook_url'
  END;
$$;

COMMENT ON FUNCTION audit.redact_secrets(jsonb) IS
  'ORR-696/ORR-781: removes credential-bearing columns from an audit payload so '
  'plaintext secrets (api keys, tokens, smtp/slack-webhook URLs) never land in '
  'audit_log. Keep this list in sync when a new secret column is added to any '
  'audited table.';
