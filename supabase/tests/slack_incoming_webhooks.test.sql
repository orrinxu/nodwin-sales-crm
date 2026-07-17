-- pgTAP: Slack incoming-webhook columns (ORR-771)
-- Verifies 20260717010000_slack_incoming_webhooks.sql added the webhook_url
-- (secret) + channel_label columns. slack_connections SELECT is already
-- admin-only (see integration_config.test.sql: "sales rep can read
-- slack_connections (empty, not blocked)"), so the secret is protected at the
-- row level; here we just confirm the columns exist.
BEGIN;
SELECT plan(2);

SELECT has_column(
  'public', 'slack_connections', 'webhook_url',
  'slack_connections has webhook_url (incoming-webhook secret)'
);

SELECT has_column(
  'public', 'slack_connections', 'channel_label',
  'slack_connections has channel_label (display)'
);

SELECT * FROM finish();
ROLLBACK;
