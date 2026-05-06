-- supabase/tests/opportunities.test.sql
-- pgTAP tests for public.opportunities, opportunity_splits, and
-- opportunity_team_members tables, RLS policies, and triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(47);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',   '{"full_name":"Owner Rep"}'),
  ('10000000-0000-0000-0000-000000000002', 'manager@nodwin.com', '{"full_name":"Manager"}'),
  ('10000000-0000-0000-0000-000000000003', 'viewer@nodwin.com',  '{"full_name":"Team Viewer"}'),
  ('10000000-0000-0000-0000-000000000004', 'contrib@nodwin.com', '{"full_name":"Team Contrib"}'),
  ('10000000-0000-0000-0000-000000000005', 'other@nodwin.com',   '{"full_name":"Other Rep"}'),
  ('10000000-0000-0000-0000-000000000006', 'admin@nodwin.com',   '{"full_name":"Admin User"}'),
  ('10000000-0000-0000-0000-000000000007', 'gsl@nodwin.com',     '{"full_name":"Group Sales Lead"}')
ON CONFLICT (id) DO NOTHING;

-- Public users with manager chain: owner -> manager.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, manager_user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',   'Owner Rep',      'sales_rep',       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', 'manager@nodwin.com', 'Manager',        'sales_manager',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000003', 'viewer@nodwin.com',  'Team Viewer',    'sales_rep',       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000004', 'contrib@nodwin.com', 'Team Contrib',   'sales_rep',       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000005', 'other@nodwin.com',   'Other Rep',      'sales_rep',       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL),
  ('10000000-0000-0000-0000-000000000006', 'admin@nodwin.com',   'Admin User',     'admin',           'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000007', 'gsl@nodwin.com',     'Group Sales Lead','group_sales_lead','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL)
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id,
  manager_user_id    = EXCLUDED.manager_user_id;

-- Insert prerequisite entity, business units, and accounts (bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Entity'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other Entity');

INSERT INTO public.business_units (id, name, entity_id, kind)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sales'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Other BU', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sales');

INSERT INTO public.accounts (id, name, email_domains)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Account', ARRAY['test.com']);

-- Insert test opportunity (standard tier).
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id,
  sales_unit_id, amount, currency, visibility_tier
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Standard Opp',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'qualify',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  100000, 'USD',
  'standard'
);

-- Insert team members.
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'viewer'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'contributor');

-- Insert split (100%).
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct)
VALUES ('00000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100);

-- ── 1. Owner can SELECT opportunity ───────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can SELECT opportunity'
);

-- ── 2. Team viewer can SELECT opportunity ─────────────────────────────────────
SELECT tests.as_user('viewer@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team viewer can SELECT opportunity'
);

-- ── 3. Team contributor can SELECT opportunity ────────────────────────────────
SELECT tests.as_user('contrib@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team contributor can SELECT opportunity'
);

-- ── 4. Restricted tier denies direct manager ──────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'restricted'
 WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'restricted tier denies direct manager SELECT'
);

-- Reset to standard.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'standard'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── 5. Anon cannot SELECT opportunities ───────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE true$$,
  'anon cannot SELECT opportunities'
);

-- ── 6. Anon cannot SELECT opportunity_splits ──────────────────────────────────
SELECT is_empty(
  $$SELECT id FROM public.opportunity_splits WHERE true$$,
  'anon cannot SELECT opportunity_splits'
);

-- ── 7. Anon cannot SELECT opportunity_team_members ────────────────────────────
SELECT is_empty(
  $$SELECT id FROM public.opportunity_team_members WHERE true$$,
  'anon cannot SELECT opportunity_team_members'
);

-- ── 8. Owner (as sales_initiator) can INSERT opportunity ──────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunities (
    id, name, account_id, stage, owner_user_id, sales_initiator_user_id,
    sales_unit_id, amount, currency, visibility_tier
  ) VALUES (
    '00000000-0000-0000-0000-000000000010',
    'Owner Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000, 'USD', 'standard'
  )$$,
  'owner can INSERT opportunity'
);

-- ── 9. Group sales lead can INSERT opportunity ────────────────────────────────
SELECT tests.as_user('gsl@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunities (
    id, name, account_id, stage, owner_user_id, sales_initiator_user_id,
    sales_unit_id, amount, currency, visibility_tier
  ) VALUES (
    '00000000-0000-0000-0000-000000000011',
    'GSL Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000, 'USD', 'standard'
  )$$,
  'group sales lead can INSERT opportunity'
);

-- ── 10. Unrelated rep cannot INSERT opportunity ───────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunities (
    id, name, account_id, stage, owner_user_id, sales_initiator_user_id,
    sales_unit_id, amount, currency, visibility_tier
  ) VALUES (
    '00000000-0000-0000-0000-000000000012',
    'Bad Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000, 'USD', 'standard'
  )$$,
  '42501',
  NULL,
  'unrelated rep cannot INSERT opportunity'
);

-- ── 11. Owner can UPDATE opportunity ──────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET name = 'Updated by Owner'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can UPDATE opportunity'
);

SELECT is(
  (SELECT name FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000001'),
  'Updated by Owner',
  'owner UPDATE actually changed name'
);

-- ── 12. Team contributor can UPDATE opportunity ───────────────────────────────
SELECT tests.as_user('contrib@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET name = 'Updated by Contrib'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team contributor can UPDATE opportunity'
);

SELECT is(
  (SELECT name FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000001'),
  'Updated by Contrib',
  'team contributor UPDATE actually changed name'
);

-- ── 13. Team viewer cannot UPDATE opportunity ─────────────────────────────────
SELECT tests.as_user('viewer@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunities SET name = 'Hacked by Viewer'
 WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT name FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000001'),
  'Updated by Contrib',
  'team viewer cannot UPDATE opportunity (silently blocked)'
);

-- ── 14. Unrelated user cannot UPDATE opportunity ──────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunities SET name = 'Hacked by Other'
 WHERE id = '00000000-0000-0000-0000-000000000001';
-- Switch to owner to verify (other cannot see the row).
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT name FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000001'),
  'Updated by Contrib',
  'unrelated user cannot UPDATE opportunity (silently blocked)'
);

-- ── 15. Non-admin cannot DELETE opportunity ───────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunities
 WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'non-admin cannot DELETE opportunity (silently blocked)'
);

-- ── 16. Admin can DELETE opportunity ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.opportunities
    WHERE id = '00000000-0000-0000-0000-000000000010'$$,
  'admin can DELETE opportunity'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STAGE TRANSITIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 17. Forward jump (qualify -> propose) allowed ─────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'propose'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows forward jump (qualify -> propose)'
);

-- ── 18. Backward by exactly 1 step allowed ────────────────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'meet_and_present'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows backward by 1 step'
);

-- ── 19. Forward multi-step jump allowed (skip stages) ─────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'negotiate'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows forward multi-step jump'
);

-- ── 20. Backward by >1 step blocked ───────────────────────────────────────────
SELECT throws_ok(
  $$UPDATE public.opportunities SET stage = 'meet_and_present'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'P0001',
  NULL,
  'stage transition blocks backward by >1 step'
);

-- ── 21. close_lost from any non-terminal stage allowed ────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'closed_lost'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows close_lost from any stage'
);

-- ── 22. Reopen to non-terminal allowed ────────────────────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'qualify'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows reopen from terminal to non-terminal'
);

-- ── 23. Reopen to terminal blocked ────────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET stage = 'closed_won'
 WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.opportunities SET stage = 'closed_lost'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'P0001',
  NULL,
  'stage transition blocks reopen to terminal stage'
);

-- Reset to qualify.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET stage = 'qualify'
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ═══════════════════════════════════════════════════════════════════════════════
-- SPLITS SUM CONSTRAINT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 24. Splits sum = 100 succeeds ─────────────────────────────────────────────
SELECT lives_ok(
  $$INSERT INTO public.opportunity_splits
    (opportunity_id, sales_unit_id, pct)
    VALUES ('00000000-0000-0000-0000-000000000001',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', 0)$$,
  'splits sum = 100 succeeds (0 pct + 100 pct = 100)'
);

-- ── 25. Splits sum != 100 throws P0001 ────────────────────────────────────────
DELETE FROM public.opportunity_splits
 WHERE sales_unit_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT throws_ok(
  $$INSERT INTO public.opportunity_splits
    (opportunity_id, sales_unit_id, pct)
    VALUES ('00000000-0000-0000-0000-000000000001',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', 50)$$,
  'P0001',
  NULL,
  'splits sum != 100 throws P0001'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPPORTUNITY SPLITS RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 26. User with visibility can SELECT splits ────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_splits
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'$$,
  'user with visibility can SELECT opportunity_splits'
);

-- ── 27. User without visibility cannot SELECT splits ──────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_splits WHERE true$$,
  'user without visibility cannot SELECT opportunity_splits'
);

-- ── 28. Non-admin cannot INSERT splits ────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_splits
    (opportunity_id, sales_unit_id, pct)
    VALUES ('00000000-0000-0000-0000-000000000001',
            'cccccccc-cccc-cccc-cccc-cccccccccccc', 100)$$,
  '42501',
  NULL,
  'non-admin cannot INSERT opportunity_splits'
);

-- ── 29. Admin can INSERT splits ───────────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id,
  sales_unit_id, amount, currency, visibility_tier
) VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Split Test Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50000, 'USD', 'standard'
);

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunity_splits
    (id, opportunity_id, sales_unit_id, pct)
    VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddd0',
            '00000000-0000-0000-0000-000000000020',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100)$$,
  'admin can INSERT opportunity_splits'
);

-- ── 30. Non-admin cannot UPDATE splits ────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_splits SET pct = 99
 WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddd0';
-- Verify as admin (owner may not have visibility on this opp).
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT pct::int FROM public.opportunity_splits
    WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddd0'),
  100,
  'non-admin cannot UPDATE opportunity_splits (silently blocked)'
);

-- ── 31. Admin can UPDATE splits (no-op: pct stays 100, sum constraint passes) ─
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunity_splits SET pct = 100
    WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddd0'$$,
  'admin can UPDATE opportunity_splits'
);

-- ── 32. Non-admin cannot DELETE splits ────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_splits
 WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddd0';
-- Verify as admin.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_splits
    WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddd0'$$,
  'non-admin cannot DELETE opportunity_splits (silently blocked)'
);

-- Insert 0-pct sibling so sum stays 100 after deletion.
INSERT INTO public.opportunity_splits (id, opportunity_id, sales_unit_id, pct)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee0',
        '00000000-0000-0000-0000-000000000020',
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 0);

-- ── 33. Admin can DELETE splits ───────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.opportunity_splits
    WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee0'$$,
  'admin can DELETE opportunity_splits'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- OPPORTUNITY TEAM MEMBERS RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 34. User with visibility can SELECT team members ──────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_team_members
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'$$,
  'user with visibility can SELECT opportunity_team_members'
);

-- ── 35. User without visibility cannot SELECT team members ────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_team_members WHERE true$$,
  'user without visibility cannot SELECT opportunity_team_members'
);

-- ── 36. Non-admin cannot INSERT team member ───────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_team_members
    (opportunity_id, user_id, role)
    VALUES ('00000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000005', 'viewer')$$,
  '42501',
  NULL,
  'non-admin cannot INSERT opportunity_team_members'
);

-- ── 37. Admin can INSERT team member ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunity_team_members
    (opportunity_id, user_id, role)
    VALUES ('00000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000005', 'viewer')$$,
  'admin can INSERT opportunity_team_members'
);

-- ── 38. Non-admin cannot UPDATE team member ───────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_team_members SET role = 'contributor'
 WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
   AND user_id = '10000000-0000-0000-0000-000000000005';
SELECT is(
  (SELECT role::text FROM public.opportunity_team_members
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000005'),
  'viewer',
  'non-admin cannot UPDATE opportunity_team_members (silently blocked)'
);

-- ── 39. Admin can UPDATE team member ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunity_team_members SET role = 'contributor'
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000005'$$,
  'admin can UPDATE opportunity_team_members'
);

-- ── 40. Non-admin cannot DELETE team member ───────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_team_members
 WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
   AND user_id = '10000000-0000-0000-0000-000000000005';
-- The owner CAN see team members on opp 001 (they own it), but the DELETE should be silently blocked by RLS.
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_team_members
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000005'$$,
  'non-admin cannot DELETE opportunity_team_members (silently blocked)'
);

-- ── 41. Admin can DELETE team member ───────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.opportunity_team_members
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000005'$$,
  'admin can DELETE opportunity_team_members'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 42. Audit log captures opportunity changes ────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT isnt_empty(
  $$SELECT 1 FROM public.audit_log
    WHERE table_name = 'opportunities'
      AND operation = 'INSERT'$$,
  'audit log captures opportunities INSERT'
);

-- ── 43. Audit log captures opportunity_splits changes ─────────────────────────
SELECT isnt_empty(
  $$SELECT 1 FROM public.audit_log
    WHERE table_name = 'opportunity_splits'
      AND operation = 'INSERT'$$,
  'audit log captures opportunity_splits INSERT'
);

-- ── 44. Audit log captures opportunity_team_members changes ───────────────────
SELECT isnt_empty(
  $$SELECT 1 FROM public.audit_log
    WHERE table_name = 'opportunity_team_members'
      AND operation = 'INSERT'$$,
  'audit log captures opportunity_team_members INSERT'
);


-- ── 45. Admin can bypass stage transition guard ────────────────────────────────
UPDATE public.opportunities SET stage = 'closed_won'
 WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'qualify'
    WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'admin can bypass stage transition guard'
);

SELECT * FROM finish();

ROLLBACK;
