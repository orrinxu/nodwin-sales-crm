-- supabase/migrations/20260717010000_slack_incoming_webhooks.sql
-- HIGH-RISK FILE — holds a Slack incoming-webhook URL (a bearer secret).
--
-- ORR-771: make the Slack notification channel actually deliver, via per-workspace
-- incoming webhooks (no per-user OAuth). Adds the secret webhook_url + a display
-- label to slack_connections. SELECT on slack_connections is ALREADY admin-only
-- (see 20260714040000_integration_security_hardening.sql), so the URL never leaks
-- to non-admins; the server posts to it via the service role. This is the same
-- credential-table posture as public.email_transport.
--
-- No notification_routing is seeded here on purpose: the admin picks which events
-- broadcast to Slack in the /admin/slack page (writing notification_routing rows),
-- which also keeps this migration clear of the notification_comms pgTAP fixtures.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.slack_connections
  ADD COLUMN IF NOT EXISTS webhook_url   text,
  ADD COLUMN IF NOT EXISTS channel_label text;

COMMENT ON COLUMN public.slack_connections.webhook_url IS
  'Slack incoming-webhook URL — a bearer secret. SELECT on this table is admin-only; '
  'the server posts via the service role. Never expose to non-admins or the client.';

COMMENT ON COLUMN public.slack_connections.channel_label IS
  'Display-only label of the channel the webhook posts to (e.g. #sales). Not a secret.';
