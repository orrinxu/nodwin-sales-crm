-- supabase/tests/notification_routing_seed.test.sql
-- pgTAP tests for the ORR-798 core-event routing seed
-- (20260719010000_seed_core_notification_routing.sql).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(4);

-- Each of the six core events must have an org-wide (entity_id NULL) in_app +
-- email routing row, ENABLED — this is what makes notifications actually deliver.
SELECT is(
  (SELECT count(*)::int
     FROM public.notification_routing
    WHERE entity_id IS NULL
      AND enabled
      AND channel IN ('in_app', 'email')
      AND event_type IN (
        'stage_change', 'deal_assigned', 'approval_requested',
        'mention', 'deal_won', 'deal_lost'
      )),
  12,
  'all 6 core events seeded with enabled in_app + email org-wide rows'
);

-- The seed must NOT create slack rows for the core events — org-wide Slack
-- routing is admin-managed via /admin/slack, and auto-seeding could fan events
-- out to a connected workspace webhook without an admin opting in.
SELECT is(
  (SELECT count(*)::int
     FROM public.notification_routing
    WHERE channel = 'slack'
      AND entity_id IS NULL
      AND event_type IN (
        'stage_change', 'deal_assigned', 'approval_requested',
        'mention', 'deal_won', 'deal_lost'
      )),
  0,
  'no slack rows seeded for core events'
);

-- The pre-existing security-event seeds must be untouched.
SELECT is(
  (SELECT count(*)::int
     FROM public.notification_routing
    WHERE event_type = 'confidential_break_glass'
      AND entity_id IS NULL
      AND enabled
      AND channel IN ('in_app', 'email')),
  2,
  'confidential_break_glass routing preserved'
);

SELECT is(
  (SELECT count(*)::int
     FROM public.notification_routing
    WHERE event_type = 'direct_report_reassigned'
      AND entity_id IS NULL
      AND enabled
      AND channel IN ('in_app', 'email')),
  2,
  'direct_report_reassigned routing preserved'
);

SELECT * FROM finish();
ROLLBACK;
