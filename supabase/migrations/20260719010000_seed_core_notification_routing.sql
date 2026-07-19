-- supabase/migrations/20260719010000_seed_core_notification_routing.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-798: notifications were dead end-to-end because the core events had NO
-- org-wide notification_routing rows. `evaluateNotificationChannels`
-- (apps/web/lib/notifications/delivery.ts) only delivers on routing rows, so a
-- deal moving to Closed Won, an approval request, a mention, etc. resolved to
-- [] and nothing was ever delivered — even though the Settings UI offers
-- per-event toggles covering every one of them.
--
-- This seeds sane org-wide defaults (entity_id IS NULL) for the six core events:
--   stage_change, deal_assigned, approval_requested, mention, deal_won, deal_lost
-- with in_app + email ENABLED, matching the two existing seeded admin events
-- (confidential_break_glass 20260715020000, direct_report_reassigned
-- 20260715040000).
--
-- We deliberately do NOT seed the `slack` channel here — org-wide Slack routing
-- is admin-managed via /admin/slack (setSlackEventRouting), and seeding slack
-- rows could fan events out to a connected workspace webhook without an admin
-- opting in. The two existing security-event rows are left untouched.
--
-- Idempotent: the UNIQUE (event_type, channel, entity_id) treats a NULL
-- entity_id as distinct, so we guard with NOT EXISTS rather than ON CONFLICT
-- (same pattern as the prior seeds). Safe to re-run.

INSERT INTO public.notification_routing (event_type, channel, enabled)
SELECT ev, ch, true
  FROM (VALUES
          ('stage_change'::public.notification_event_type),
          ('deal_assigned'::public.notification_event_type),
          ('approval_requested'::public.notification_event_type),
          ('mention'::public.notification_event_type),
          ('deal_won'::public.notification_event_type),
          ('deal_lost'::public.notification_event_type)
       ) AS e(ev)
 CROSS JOIN (VALUES
          ('in_app'::public.notification_channel),
          ('email'::public.notification_channel)
       ) AS c(ch)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.notification_routing r
    WHERE r.event_type = e.ev
      AND r.channel = c.ch
      AND r.entity_id IS NULL
 );
