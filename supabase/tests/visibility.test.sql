-- supabase/tests/visibility.test.sql
-- pgTAP tests for public.opportunity_visibility table and recompute logic.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(38);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',  '{"full_name":"Owner Rep"}'),
  ('10000000-0000-0000-0000-000000000002', 'manager@nodwin.com','{"full_name":"Manager"}'),
  ('10000000-0000-0000-0000-000000000003', 'director@nodwin.com','{"full_name":"Director"}'),
  ('10000000-0000-0000-0000-000000000004', 'team@nodwin.com',   '{"full_name":"Team Member"}'),
  ('10000000-0000-0000-0000-000000000005', 'split_mgr@nodwin.com','{"full_name":"Split Mgr"}'),
  ('10000000-0000-0000-0000-000000000006', 'override@nodwin.com','{"full_name":"Override"}'),
  ('10000000-0000-0000-0000-000000000007', 'other@nodwin.com',  '{"full_name":"Other Rep"}'),
  ('10000000-0000-0000-0000-000000000008', 'admin@nodwin.com',  '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

-- Public users with manager chain: owner -> manager -> director.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, manager_user_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',   'Owner Rep',   'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000002', 'manager@nodwin.com', 'Manager',     'sales_manager', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', 'director@nodwin.com','Director',    'regional_head', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000004', 'team@nodwin.com',    'Team Member', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000005', 'split_mgr@nodwin.com','Split Mgr',  'sales_manager', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000006', 'override@nodwin.com','Override',    'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL),
  ('10000000-0000-0000-0000-000000000007', 'other@nodwin.com',   'Other Rep',   'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', NULL),
  ('10000000-0000-0000-0000-000000000008', 'admin@nodwin.com',   'Admin User',  'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id,
  manager_user_id = EXCLUDED.manager_user_id;

-- Insert test entity and business unit (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', '10000000-0000-0000-0000-000000000005');

-- Insert test account.
INSERT INTO public.accounts (id, name, email_domains)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Account', ARRAY['test.com']);

-- Insert test opportunity (standard tier).
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier
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

-- Insert team member.
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'contributor');

-- Insert split so split-unit manager gets visibility.
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct)
VALUES ('00000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100);

-- ── 1. Owner can see standard opportunity ─────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can see standard opportunity'
);

-- ── 2. Team member can see standard opportunity ───────────────────────────────
SELECT tests.as_user('team@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team member can see standard opportunity'
);

-- ── 3. Direct manager can see standard opportunity ────────────────────────────
SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'direct manager can see standard opportunity'
);

-- ── 4. Director in manager chain can see standard opportunity ─────────────────
SELECT tests.as_user('director@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'director in chain can see standard opportunity'
);

-- ── 5. Split-unit manager can see standard opportunity ────────────────────────
SELECT tests.as_user('split_mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'split-unit manager can see standard opportunity'
);

-- ── 6. Unrelated user cannot see standard opportunity ─────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'unrelated user cannot see standard opportunity'
);

-- ── 7. Anon cannot see opportunities ──────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE true$$,
  'anon cannot see any opportunities'
);

-- ── 8. Restricted tier: owner still sees it ───────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'restricted' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can see restricted opportunity'
);

-- ── 9. Restricted tier: team still sees it ────────────────────────────────────
SELECT tests.as_user('team@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team member can see restricted opportunity'
);

-- ── 10. Restricted tier: manager does NOT see it ──────────────────────────────
SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'manager cannot see restricted opportunity'
);

-- ── 11. Restricted tier: director does NOT see it ─────────────────────────────
SELECT tests.as_user('director@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'director cannot see restricted opportunity'
);

-- ── 12. Restricted tier: split-unit manager does NOT see it ───────────────────
SELECT tests.as_user('split_mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'split-unit manager cannot see restricted opportunity'
);

-- ── 13. Confidential tier: owner sees it ──────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'confidential' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can see confidential opportunity'
);

-- ── 14. Confidential tier: team does NOT see it ───────────────────────────────
SELECT tests.as_user('team@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'team member cannot see confidential opportunity'
);

-- ── 15. Confidential tier: override user sees it ──────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities
   SET confidentiality_override_user_ids = ARRAY['10000000-0000-0000-0000-000000000006'::uuid]
 WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('override@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'confidentiality override user can see confidential opportunity'
);

-- ── 16. Adding team member creates visibility row ─────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'standard' WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'viewer');

SELECT is(
  (SELECT count(*)::int FROM public.opportunity_visibility
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000007'),
  1,
  'adding team member creates visibility row'
);

-- ── 17. Removing team member deletes visibility row ───────────────────────────
DELETE FROM public.opportunity_team_members
 WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
   AND user_id = '10000000-0000-0000-0000-000000000007';

SELECT is(
  (SELECT count(*)::int FROM public.opportunity_visibility
    WHERE opportunity_id = '00000000-0000-0000-0000-000000000001'
      AND user_id = '10000000-0000-0000-0000-000000000007'),
  0,
  'removing team member deletes visibility row'
);

-- ── 18. Manager change updates visibility chain ───────────────────────────────
-- Make the other rep the manager of the owner.
UPDATE public.users
   SET manager_user_id = '10000000-0000-0000-0000-000000000007'
 WHERE id = '10000000-0000-0000-0000-000000000001';

-- The other rep should now see the opportunity via manager_chain.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'manager change updates visibility chain'
);

-- ── 19. Visibility table has correct reasons for standard opp ─────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT bag_eq(
  $$SELECT reason FROM public.opportunity_visibility WHERE opportunity_id = '00000000-0000-0000-0000-000000000001' AND user_id = '10000000-0000-0000-0000-000000000001'$$,
  $$VALUES ('owner')$$,
  'owner visibility reason is owner'
);

SELECT bag_eq(
  $$SELECT reason FROM public.opportunity_visibility WHERE opportunity_id = '00000000-0000-0000-0000-000000000001' AND user_id = '10000000-0000-0000-0000-000000000004'$$,
  $$VALUES ('team:contributor')$$,
  'team member visibility reason includes role'
);

-- ── 20. Splits sum trigger enforced ───────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct) VALUES ('00000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 10)$$,
  'P0001',
  NULL,
  'splits sum trigger rejects non-100 total'
);

-- ── 21. Stage transition blocks backward jump > 1 ─────────────────────────────
-- First set stage to negotiate so we can attempt a multi-step backward jump.
UPDATE public.opportunities SET stage = 'negotiate' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$UPDATE public.opportunities SET stage = 'qualify' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'P0001',
  NULL,
  'stage transition blocks illegal backward jump'
);

-- ── 22. Stage transition allows forward jump ──────────────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'verbal_agreement' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows forward jump'
);

-- ── 23. Stage transition allows close_lost from any stage ─────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'closed_lost' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows close_lost'
);

-- ── 24. Stage transition blocks reopen to terminal ────────────────────────────
SELECT throws_ok(
  $$UPDATE public.opportunities SET stage = 'closed_won' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'P0001',
  NULL,
  'stage transition blocks reopen to terminal stage'
);

-- ── 25. Stage transition allows reopen to non-terminal ────────────────────────
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'qualify' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'stage transition allows reopen to non-terminal'
);

-- ── 26. Admin can force illegal transition ────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET stage = 'closed_won' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'admin can force stage transition'
);

-- ── 27. Owner can update opportunity ──────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.opportunities SET name = 'Updated Name' WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner can update opportunity'
);

-- ── 28. Team viewer cannot update opportunity ─────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
-- Reset stage to something non-terminal.
UPDATE public.opportunities SET stage = 'qualify' WHERE id = '00000000-0000-0000-0000-000000000001';

-- Add a viewer team member.
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'viewer')
ON CONFLICT (opportunity_id, user_id) DO NOTHING;

SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunities SET name = 'Hacked' WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT name FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'),
  'Updated Name',
  'team viewer cannot update opportunity (silently blocked)'
);

-- ── 29. Non-owner cannot insert opportunity ───────────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES ('00000000-0000-0000-0000-000000000002', 'Bad Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard')$$,
  '42501',
  NULL,
  'non-owner cannot insert opportunity'
);

-- ── 30. Owner can insert opportunity ──────────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES ('00000000-0000-0000-0000-000000000003', 'New Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard')$$,
  'owner can insert opportunity'
);

-- ── 31. Owner cannot spoof another user's opportunity ─────────────────────────
SELECT throws_ok(
  $$INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES ('00000000-0000-0000-0000-000000000004', 'Spoofed Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard')$$,
  '42501',
  NULL,
  'owner cannot insert opportunity for another user'
);

-- ── 32. User cannot see other users' opportunity_visibility rows ──────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_visibility WHERE user_id = '10000000-0000-0000-0000-000000000001'$$,
  'user cannot see other users opportunity_visibility rows'
);

-- ── 33. User can see their own opportunity_visibility rows ────────────────────
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_visibility WHERE user_id = '10000000-0000-0000-0000-000000000007'$$,
  'user can see their own opportunity_visibility rows'
);

-- ── 34. Non-admin cannot select entities ──────────────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.entities WHERE true$$,
  'non-admin cannot select entities'
);

-- ── 35. Admin can select entities ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'admin can select entities'
);

-- ── 36. Non-manager cannot select business_units ───────────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.business_units WHERE true$$,
  'non-manager cannot select business_units'
);

-- ── 37. Manager can select business_units ─────────────────────────────────────
SELECT tests.as_user('split_mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'manager can select their business_units'
);

SELECT * FROM finish();

ROLLBACK;
