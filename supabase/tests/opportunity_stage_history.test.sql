-- supabase/tests/opportunity_stage_history.test.sql
-- pgTAP tests for public.opportunity_stage_history table, RLS policies,
-- and schema.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(21);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',    '{"full_name":"Owner Rep"}'),
  ('10000000-0000-0000-0000-000000000005', 'other@nodwin.com',    '{"full_name":"Other Rep"}'),
  ('10000000-0000-0000-0000-000000000006', 'admin@nodwin.com',    '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

-- Public users.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',  'Owner Rep',    'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('10000000-0000-0000-0000-000000000005', 'other@nodwin.com',  'Other Rep',    'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('10000000-0000-0000-0000-000000000006', 'admin@nodwin.com',  'Admin User',   'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert test data bypassing RLS.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.opportunity_stage_history
  (id, opportunity_id, from_stage, to_stage, event, reason, created_by)
VALUES
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000001',
   'qualify', 'meet_and_present',
   'stage_change', 'Initial move',
   '10000000-0000-0000-0000-000000000001'),

  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000001',
   'meet_and_present', 'propose',
   'stage_change', 'Second move',
   '10000000-0000-0000-0000-000000000005'),

  ('00000000-0000-0000-0000-0000000000a3',
   '00000000-0000-0000-0000-000000000001',
   'propose', 'negotiate',
   'stage_change', 'created by owner',
   '10000000-0000-0000-0000-000000000001');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SCHEMA VALIDATION
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Table exists.
SELECT has_table(
  'public', 'opportunity_stage_history',
  'opportunity_stage_history table exists'
);

-- 2-9. Columns.
SELECT has_column('public', 'opportunity_stage_history', 'id',             'column id exists');
SELECT has_column('public', 'opportunity_stage_history', 'opportunity_id', 'column opportunity_id exists');
SELECT has_column('public', 'opportunity_stage_history', 'from_stage',     'column from_stage exists');
SELECT has_column('public', 'opportunity_stage_history', 'to_stage',       'column to_stage exists');
SELECT has_column('public', 'opportunity_stage_history', 'event',          'column event exists');
SELECT has_column('public', 'opportunity_stage_history', 'reason',         'column reason exists');
SELECT has_column('public', 'opportunity_stage_history', 'created_by',     'column created_by exists');
SELECT has_column('public', 'opportunity_stage_history', 'created_at',     'column created_at exists');

-- 10-11. Indexes.
SELECT has_index(
  'public', 'opportunity_stage_history', 'idx_osh_opportunity_id',
  'index idx_osh_opportunity_id exists'
);
SELECT has_index(
  'public', 'opportunity_stage_history', 'idx_osh_created_at',
  'index idx_osh_created_at exists'
);

-- 12. RLS enabled.
SELECT has_rls(
  'public', 'opportunity_stage_history',
  'opportunity_stage_history has RLS enabled'
);

-- 13-14. Policies exist.
SELECT has_policy(
  'public', 'opportunity_stage_history',
  'Users can view stage history for their opportunities',
  'SELECT policy exists'
);
SELECT has_policy(
  'public', 'opportunity_stage_history',
  'Users can insert stage history for their opportunities',
  'INSERT policy exists'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: SELECT
-- ═══════════════════════════════════════════════════════════════════════════════

-- 15. Owner can SELECT stage history they created.
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_stage_history
    WHERE created_by = '10000000-0000-0000-0000-000000000001'$$,
  'owner can SELECT their own stage history'
);

-- 16. Owner cannot SELECT stage history created by another user.
SELECT is_empty(
  $$SELECT id FROM public.opportunity_stage_history
    WHERE created_by = '10000000-0000-0000-0000-000000000005'$$,
  'owner cannot SELECT other user stage history'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: INSERT
-- ═══════════════════════════════════════════════════════════════════════════════

-- 17. Owner can INSERT with created_by = auth.uid().
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.opportunity_stage_history
    (id, opportunity_id, from_stage, to_stage, event, reason, created_by)
    VALUES ('00000000-0000-0000-0000-0000000000a4',
            '00000000-0000-0000-0000-000000000001',
            'negotiate', 'verbal_agreement',
            'stage_change', 'owner move',
            '10000000-0000-0000-0000-000000000001')$$,
  'owner can INSERT stage history with matching created_by'
);

-- 18. Owner cannot INSERT with created_by != auth.uid().
SELECT throws_ok(
  $$INSERT INTO public.opportunity_stage_history
    (id, opportunity_id, from_stage, to_stage, event, reason, created_by)
    VALUES ('00000000-0000-0000-0000-0000000000a5',
            '00000000-0000-0000-0000-000000000001',
            'negotiate', 'verbal_agreement',
            'stage_change', 'spoof attempt',
            '10000000-0000-0000-0000-000000000005')$$,
  '42501',
  NULL,
  'owner cannot INSERT stage history with mismatched created_by'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: UPDATE (default-deny — no UPDATE policy)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 19. Owner cannot UPDATE stage history (silently blocked).
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_stage_history
   SET event = 'hacked'
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT is(
  (SELECT event FROM public.opportunity_stage_history
    WHERE id = '00000000-0000-0000-0000-0000000000a1'),
  'stage_change',
  'owner cannot UPDATE stage history (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: DELETE (default-deny — no DELETE policy)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 20. Owner cannot DELETE stage history (silently blocked).
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_stage_history
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_stage_history
    WHERE id = '00000000-0000-0000-0000-0000000000a1'$$,
  'owner cannot DELETE stage history (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ANON ACCESS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 21. Anon cannot SELECT stage history.
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_stage_history WHERE true$$,
  'anon cannot SELECT stage history'
);

SELECT * FROM finish();

ROLLBACK;
