-- supabase/tests/notification_comms.test.sql
-- pgTAP tests for notification & communication RLS policies.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(35);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep',  'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert entities and fixture data as service role to bypass RLS.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Nodwin Alpha',   'USD'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nodwin Beta',    'INR')
ON CONFLICT (id) DO NOTHING;

-- notification_routing fixture
INSERT INTO public.notification_routing (id, event_type, channel, enabled, entity_id, created_by, updated_by)
VALUES
  ('aaaa0001-0001-0001-0001-000000000001', 'stage_change', 'in_app', true, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('aaaa0002-0002-0002-0002-000000000002', 'deal_won',     'email',  true, NULL,                                          '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

-- user_notification_overrides fixture (rep overrides one event)
INSERT INTO public.user_notification_overrides (id, user_id, event_type, channel, enabled, created_by, updated_by)
VALUES
  ('bbbb0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'mention', 'email', false, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- email_templates fixture
INSERT INTO public.email_templates (id, name, subject, body_html, body_text, variables, created_by, updated_by)
VALUES
  ('cccc0001-0001-0001-0001-000000000001', 'deal_won', 'Congratulations on {deal_name}!', '<p>Congratulations!</p>', 'Congratulations!', '["deal_name","deal_value","account_name"]', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

-- user_notifications fixture (rep has one unread notification)
INSERT INTO public.user_notifications (id, user_id, title, message, metadata, created_by)
VALUES
  ('dddd0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 'Deal won: Acme Corp', 'The ACME-Q3 deal has been marked as won.', '{"event_type":"deal_won","opportunity_id":"11111111-2222-3333-4444-555555555555"}', '22222222-2222-2222-2222-222222222222'),
  ('dddd0002-0002-0002-0002-000000000002', '33333333-3333-3333-3333-333333333333', 'Deal won: Other Corp', 'The Other-Q3 deal has been marked as won.', '{"event_type":"deal_won"}', '22222222-2222-2222-2222-222222222222');

-- ═══════════════════════════════════════════════════════════════════════════════
-- notification_routing tests
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Admin can SELECT notification_routing
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.notification_routing WHERE event_type = 'stage_change'$$,
  'admin can SELECT notification_routing'
);

-- 2. Sales rep can SELECT notification_routing
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.notification_routing WHERE event_type = 'stage_change'$$,
  'sales rep can SELECT notification_routing'
);

-- 3. Admin can INSERT notification_routing
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.notification_routing (id, event_type, channel, enabled, entity_id) VALUES ('aaaa0003-0003-0003-0003-000000000003', 'deal_lost', 'slack', true, NULL)$$,
  'admin can INSERT notification_routing'
);

-- 4. Sales rep cannot INSERT notification_routing
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.notification_routing (id, event_type, channel, enabled) VALUES ('aaaa0004-0004-0004-0004-000000000004', 'deal_lost', 'slack', false)$$,
  '42501',
  NULL,
  'sales rep cannot INSERT notification_routing'
);

-- 5. Admin can UPDATE notification_routing
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.notification_routing SET enabled = false WHERE id = 'aaaa0001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT enabled FROM public.notification_routing WHERE id = 'aaaa0001-0001-0001-0001-000000000001'),
  false,
  'admin can UPDATE notification_routing'
);

-- 6. Sales rep cannot UPDATE notification_routing
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.notification_routing SET enabled = true WHERE id = 'aaaa0001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT enabled FROM public.notification_routing WHERE id = 'aaaa0001-0001-0001-0001-000000000001'),
  false,
  'sales rep cannot UPDATE notification_routing (silently blocked)'
);

-- 7. Admin can DELETE notification_routing
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.notification_routing WHERE id = 'aaaa0003-0003-0003-0003-000000000003'$$,
  'admin can DELETE notification_routing'
);

-- 8. Sales rep cannot DELETE notification_routing
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.notification_routing WHERE id = 'aaaa0002-0002-0002-0002-000000000002';
SELECT isnt_empty(
  $$SELECT id FROM public.notification_routing WHERE id = 'aaaa0002-0002-0002-0002-000000000002'$$,
  'sales rep cannot DELETE notification_routing (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- user_notification_overrides tests
-- ═══════════════════════════════════════════════════════════════════════════════

-- 9. User can SELECT own overrides
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.user_notification_overrides WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own overrides'
);

-- 10. User cannot SELECT another user's overrides
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.user_notification_overrides WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user overrides'
);

-- 11. Admin can SELECT all overrides
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.user_notification_overrides),
  1,
  'admin can SELECT all overrides'
);

-- 12. User can INSERT own override
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.user_notification_overrides (id, user_id, event_type, channel, enabled) VALUES ('bbbb0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'deal_won', 'email', false)$$,
  'user can INSERT own override'
);

-- 13. Admin can INSERT override for another user
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.user_notification_overrides (id, user_id, event_type, channel, enabled) VALUES ('bbbb0003-0003-0003-0003-000000000003', '33333333-3333-3333-3333-333333333333', 'stage_change', 'in_app', false)$$,
  'admin can INSERT override for another user'
);

-- 14. Non-admin cannot INSERT override for another user
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.user_notification_overrides (id, user_id, event_type, channel, enabled) VALUES ('bbbb0004-0004-0004-0004-000000000004', '33333333-3333-3333-3333-333333333333', 'stage_change', 'in_app', false)$$,
  '42501',
  NULL,
  'non-admin cannot INSERT override for another user'
);

-- 15. User can UPDATE own override
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.user_notification_overrides SET enabled = true WHERE id = 'bbbb0002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT enabled FROM public.user_notification_overrides WHERE id = 'bbbb0002-0002-0002-0002-000000000002'),
  true,
  'user can UPDATE own override'
);

-- 16. User cannot UPDATE another user's override
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.user_notification_overrides SET enabled = true WHERE id = 'bbbb0003-0003-0003-0003-000000000003';
-- Verify as admin that the row is unchanged.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT enabled FROM public.user_notification_overrides WHERE id = 'bbbb0003-0003-0003-0003-000000000003'),
  false,
  'user cannot UPDATE another user override (silently blocked)'
);

-- 17. Admin can UPDATE any override
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.user_notification_overrides SET enabled = true WHERE id = 'bbbb0003-0003-0003-0003-000000000003';
SELECT is(
  (SELECT enabled FROM public.user_notification_overrides WHERE id = 'bbbb0003-0003-0003-0003-000000000003'),
  true,
  'admin can UPDATE any override'
);

-- 18. User can DELETE own override
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.user_notification_overrides WHERE id = 'bbbb0002-0002-0002-0002-000000000002'$$,
  'user can DELETE own override'
);

-- 19. User cannot DELETE another user's override
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.user_notification_overrides WHERE id = 'bbbb0003-0003-0003-0003-000000000003';
-- Verify as admin that the row still exists.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.user_notification_overrides WHERE id = 'bbbb0003-0003-0003-0003-000000000003'$$,
  'user cannot DELETE another user override (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- email_templates tests
-- ═══════════════════════════════════════════════════════════════════════════════

-- 20. Admin can SELECT email_templates
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.email_templates WHERE name = 'deal_won'$$,
  'admin can SELECT email_templates'
);

-- 21. Sales rep can SELECT email_templates
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.email_templates WHERE name = 'deal_won'$$,
  'sales rep can SELECT email_templates'
);

-- 22. Admin can INSERT email_templates
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.email_templates (id, name, subject, body_html) VALUES ('cccc0002-0002-0002-0002-000000000002', 'stage_change', 'Deal stage updated: {deal_name}', '<p>Stage updated</p>')$$,
  'admin can INSERT email_templates'
);

-- 23. Sales rep cannot INSERT email_templates
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.email_templates (id, name, subject, body_html) VALUES ('cccc0003-0003-0003-0003-000000000003', 'test', 'Test', '<p>Test</p>')$$,
  '42501',
  NULL,
  'sales rep cannot INSERT email_templates'
);

-- 24. Admin can UPDATE email_templates
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.email_templates SET subject = 'Updated subject' WHERE id = 'cccc0002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT subject FROM public.email_templates WHERE id = 'cccc0002-0002-0002-0002-000000000002'),
  'Updated subject',
  'admin can UPDATE email_templates'
);

-- 25. Sales rep cannot UPDATE email_templates
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.email_templates SET subject = 'Hacked' WHERE id = 'cccc0002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT subject FROM public.email_templates WHERE id = 'cccc0002-0002-0002-0002-000000000002'),
  'Updated subject',
  'sales rep cannot UPDATE email_templates (silently blocked)'
);

-- 26. Admin can DELETE email_templates
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.email_templates WHERE id = 'cccc0002-0002-0002-0002-000000000002'$$,
  'admin can DELETE email_templates'
);

-- 27. Sales rep cannot DELETE email_templates
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.email_templates WHERE id = 'cccc0001-0001-0001-0001-000000000001';
SELECT isnt_empty(
  $$SELECT id FROM public.email_templates WHERE id = 'cccc0001-0001-0001-0001-000000000001'$$,
  'sales rep cannot DELETE email_templates (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- user_notifications tests
-- ═══════════════════════════════════════════════════════════════════════════════

-- 28. User can SELECT own notifications
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.user_notifications WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own notifications'
);

-- 29. User cannot SELECT another user's notifications
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.user_notifications WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user notifications'
);

-- 30. Admin can SELECT all notifications
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.user_notifications),
  2,
  'admin can SELECT all notifications'
);

-- 31. Admin can INSERT user_notifications
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.user_notifications (id, user_id, title, message) VALUES ('dddd0003-0003-0003-0003-000000000003', '11111111-1111-1111-1111-111111111111', 'Test notification', 'Test message')$$,
  'admin can INSERT user_notifications'
);

-- 32. Non-admin cannot INSERT user_notifications
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.user_notifications (id, user_id, title, message) VALUES ('dddd0004-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'Test', 'Test')$$,
  '42501',
  NULL,
  'non-admin cannot INSERT user_notifications'
);

-- 33. User can UPDATE own notification (mark as read)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.user_notifications SET read_at = now() WHERE id = 'dddd0001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT read_at IS NOT NULL FROM public.user_notifications WHERE id = 'dddd0001-0001-0001-0001-000000000001'),
  true,
  'user can UPDATE own notification (mark as read)'
);

-- 34. Admin can DELETE user_notifications
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.user_notifications WHERE id = 'dddd0003-0003-0003-0003-000000000003'$$,
  'admin can DELETE user_notifications'
);

-- 35. Non-admin cannot DELETE user_notifications
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.user_notifications WHERE id = 'dddd0001-0001-0001-0001-000000000001';
SELECT isnt_empty(
  $$SELECT id FROM public.user_notifications WHERE id = 'dddd0001-0001-0001-0001-000000000001'$$,
  'non-admin cannot DELETE user_notifications (silently blocked)'
);

SELECT * FROM finish();

ROLLBACK;
