-- supabase/tests/visibility.test.sql
-- pgTAP tests for public.opportunity_visibility table and recompute logic.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(56);

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

-- ── Cross-entity fixtures (Scope §2) ───────────────────────────────────────────

-- Second entity (NG India) — the "other" rep moved here so cross-entity
-- isolation is tested with real entity boundaries, not just unrelated users.
INSERT INTO public.entities (id, name)
VALUES ('f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'NG India Entity');

-- Second business unit under NG India entity.
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES
  ('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', 'NG India Sales', 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'sales', '10000000-0000-0000-0000-000000000005');

-- Move "other" rep to NG India entity (before they had placeholder entity bbbbbbbb).
UPDATE public.users
   SET primary_entity_id = 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0'
 WHERE id = '10000000-0000-0000-0000-000000000007';

-- NG India deal — owned by other@nodwin.com.
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES (
  'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0',
  'NG India Opp',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'propose',
  '10000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000007',
  'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0',
  50000, 'INR',
  'standard'
);

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

-- Restore the owner's manager so later tests don't inherit stale visibility.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.users
   SET manager_user_id = '10000000-0000-0000-0000-000000000002'
 WHERE id = '10000000-0000-0000-0000-000000000001';

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

-- ── 34. Non-admin can select entities (T-019: all authenticated users can read) ──
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE true$$,
  'non-admin can select entities'
);

-- ── 35. Admin can select entities ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'admin can select entities'
);

-- ── 36. Non-manager can select business_units (T-019: all authenticated users can read) ──
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE true$$,
  'non-manager can select business_units'
);

-- ── 37. Manager can select business_units ─────────────────────────────────────
SELECT tests.as_user('split_mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'manager can select their business_units'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Expanded RLS Tests (ORR-486 — PRE-CUTOVER SECURITY GATE)
-- Covers: cross-entity isolation, visibility refresh on tier/owner/split change,
-- write-path denial (non-admin DELETE, non-admin opportunity_splits write),
-- and admin bypass verification.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 39. Cross-entity: East Asia rep cannot see NG India deal ───────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
-- Ensure the NG India deal has correct visibility computed.
SELECT public.recompute_visibility_for_opportunity('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0');

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'cross-entity: East Asia rep cannot see NG India deal'
);

-- ── 40. NG India rep can see own deal ──────────────────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'ng india rep can see own deal'
);

-- ── 41. Cross-entity team member add grants visibility ─────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role)
VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', '10000000-0000-0000-0000-000000000001', 'viewer');

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'cross-entity: team member add grants visibility across entities'
);

-- ── 42. Cross-entity team member remove revokes visibility ─────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
DELETE FROM public.opportunity_team_members
 WHERE opportunity_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'
   AND user_id = '10000000-0000-0000-0000-000000000001';

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'cross-entity: team member remove revokes visibility'
);

-- ── 43. Visibility tier change: standard→restricted removes manager visibility ─
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'standard' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'tier change: manager sees standard deal (baseline)'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'restricted' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'tier change: standard→restricted removes manager visibility'
);

-- ── 44. Visibility tier change: restricted→standard restores manager visibility ─
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET visibility_tier = 'standard' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('manager@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'tier change: restricted→standard restores manager visibility'
);

-- ── 45. Owner change: new owner gains, old owner loses visibility ──────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET owner_user_id = '10000000-0000-0000-0000-000000000004' WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner change: old owner loses visibility'
);

SELECT tests.as_user('team@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'owner change: new owner gains visibility'
);

-- Restore original owner for remaining tests.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunities SET owner_user_id = '10000000-0000-0000-0000-000000000001' WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── 46. Split-unit manager gains visibility when split targets their BU ───────
-- Use the NG India deal (which has no splits).  Create a BU managed by override
-- and add a split to it.  override should gain visibility.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 'Override BU', 'f0f0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0', 'sales', '10000000-0000-0000-0000-000000000006');

-- verify override (not owner, not team, not in manager chain) cannot see NG India deal yet
SELECT tests.as_user('override@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'override cannot see NG India deal before split targets their BU'
);

-- Add split targeting override's BU.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct)
VALUES ('d0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0', 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0', 100);

-- override@nodwin.com should now see the deal as split-unit manager.
SELECT tests.as_user('override@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'override gains visibility after split targets their BU'
);

-- ── 47. Split BU change removes visibility for departed unit manager ───────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.opportunity_splits
   SET sales_unit_id = 'b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0'
 WHERE opportunity_id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'
   AND sales_unit_id = 'c0c0c0c0-c0c0-c0c0-c0c0-c0c0c0c0c0c0';

-- verify override loses visibility (BU change removed their BU as a split target)
SELECT tests.as_user('override@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'override loses visibility after split BU changes away from their BU'
);

-- verify the new BU manager (split_mgr) gains visibility
SELECT tests.as_user('split_mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'split_mgr gains visibility after split BU changes to their BU'
);

-- ── 48. Non-owner sales_rep cannot DELETE opportunity (admin-only policy) ──────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001';
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'non-admin cannot delete opportunity (silently blocked)'
);

-- ── 49. Non-admin cannot INSERT into opportunity_splits ────────────────────────
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_splits (id, opportunity_id, sales_unit_id, pct) VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 50)$$,
  '42501',
  NULL,
  'non-admin cannot insert opportunity_splits'
);

-- ── 50. Admin can see all opportunities including cross-entity deals ───────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'd0d0d0d0-d0d0-d0d0-d0d0-d0d0d0d0d0d0'$$,
  'admin can see ng india deal (cross-entity)'
);

SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'admin can see standard opportunity'
);

-- ── 51. Admin can delete any opportunity (including CASCADE of splits) ─────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000001'$$,
  'admin can delete opportunity with splits (CASCADE)'
);

SELECT * FROM finish();

ROLLBACK;
