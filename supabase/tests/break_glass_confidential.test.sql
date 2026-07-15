-- supabase/tests/break_glass_confidential.test.sql
-- pgTAP tests for the Confidential break-glass self-grant (ORR-716 / T-142).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Proves: an exec self-grants access to ONE specific Confidential deal (audited,
-- per-deal), and that the DEFAULT firewall is unchanged for everyone else — admins
-- and non-invoking users still cannot read a Confidential deal, and other
-- Confidential deals are untouched.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(17);

-- ── Fixtures (as service role) ───────────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'founder@nodwin.com', '{"full_name":"Founder Exec"}'),
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',   '{"full_name":"Owner Rep"}'),
  ('20000000-0000-0000-0000-000000000006', 'override@nodwin.com','{"full_name":"Override User"}'),
  ('80000000-0000-0000-0000-000000000008', 'admin@nodwin.com',   '{"full_name":"Admin User"}'),
  ('70000000-0000-0000-0000-000000000007', 'rep2@nodwin.com',    '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'founder@nodwin.com', 'Founder Exec',  'exec',      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('10000000-0000-0000-0000-000000000001', 'owner@nodwin.com',   'Owner Rep',     'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('20000000-0000-0000-0000-000000000006', 'override@nodwin.com','Override User', 'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('80000000-0000-0000-0000-000000000008', 'admin@nodwin.com',   'Admin User',    'admin',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('70000000-0000-0000-0000-000000000007', 'rep2@nodwin.com',    'Other Rep',     'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'BG Entity')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_units (id, name, entity_id, kind)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BG BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, email_domains)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BG Account', ARRAY['bg.com'])
ON CONFLICT (id) DO NOTHING;

-- C1: Confidential, owned by owner, named list also includes `override`.
-- C2: Confidential, owned by owner, empty named list (per-deal isolation probe).
-- C3: Confidential, owned by the founder itself (already-on-list guard).
-- S1: Standard tier (break-glass must refuse it).
INSERT INTO public.opportunities
  (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier, confidentiality_override_user_ids)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Confidential One', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500000, 'USD', 'confidential',
    ARRAY['20000000-0000-0000-0000-000000000006']::uuid[]),
  ('c2000000-0000-0000-0000-000000000002', 'Confidential Two', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 600000, 'USD', 'confidential',
    ARRAY[]::uuid[]),
  ('c3000000-0000-0000-0000-000000000003', 'Confidential Three', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    'f0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 700000, 'USD', 'confidential',
    ARRAY[]::uuid[]),
  ('51000000-0000-0000-0000-000000000004', 'Standard One', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
    '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard',
    ARRAY[]::uuid[])
ON CONFLICT (id) DO NOTHING;

-- ── 1. Fence holds BEFORE break-glass: exec cannot see C1 ─────────────────────
SELECT tests.as_user('founder@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::int FROM public.opportunities WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'before break-glass: exec cannot SELECT the Confidential deal'
);

-- ── 2-4. Target probe visibility ─────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.confidential_break_glass_target('c1000000-0000-0000-0000-000000000001')),
  1,
  'target probe: exec (not yet entitled) sees the break-glass target'
);

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.confidential_break_glass_target('c1000000-0000-0000-0000-000000000001')),
  0,
  'target probe: admin gets nothing (no existence leak)'
);

SELECT tests.as_user('rep2@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.confidential_break_glass_target('c1000000-0000-0000-0000-000000000001')),
  0,
  'target probe: a rep gets nothing'
);

-- ── 5. The grant succeeds for the exec ───────────────────────────────────────
SELECT tests.as_user('founder@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.break_glass_confidential('c1000000-0000-0000-0000-000000000001', 'Investigating a compliance report') $$,
  'exec break-glass into C1 succeeds'
);

-- ── 6-7. Effects: visibility row + override append ───────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.opportunities WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  1,
  'after break-glass: exec can now SELECT C1'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT ok(
  (SELECT 'f0000000-0000-0000-0000-000000000001'::uuid = ANY (confidentiality_override_user_ids)
     FROM public.opportunities WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  'exec was appended to C1 confidentiality_override_user_ids'
);

-- ── 8. Audit row with actor + reason ─────────────────────────────────────────
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE table_name = 'opportunities'
       AND row_id = 'c1000000-0000-0000-0000-000000000001'
       AND actor_user_id = 'f0000000-0000-0000-0000-000000000001'
       AND (new_data->>'break_glass')::boolean IS TRUE
       AND new_data->>'reason' = 'Investigating a compliance report'
  ),
  'break-glass wrote an audit row with actor + reason'
);

-- ── 9. Per-deal isolation: C2 untouched ──────────────────────────────────────
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.opportunity_visibility
     WHERE opportunity_id = 'c2000000-0000-0000-0000-000000000002'
       AND user_id = 'f0000000-0000-0000-0000-000000000001'
  ),
  'break-glass on C1 did NOT grant access to the other Confidential deal C2'
);

-- ── 10-11. Fence intact for non-invokers ─────────────────────────────────────
SELECT tests.as_user('rep2@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.opportunities WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'fence intact: a non-invoking rep still cannot SELECT C1'
);

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.opportunities WHERE id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'fence intact: an admin still cannot SELECT C1 after someone broke glass'
);

-- ── 12. Target probe after grant: exec already entitled → no target ──────────
SELECT tests.as_user('founder@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.confidential_break_glass_target('c1000000-0000-0000-0000-000000000001')),
  0,
  'target probe: exec who already broke glass no longer sees the target'
);

-- ── 13-14. Non-exec principals cannot break glass ────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.break_glass_confidential('c2000000-0000-0000-0000-000000000002', 'let me in') $$,
  '42501',
  NULL,
  'admin cannot break-glass (insufficient_privilege)'
);

SELECT tests.as_user('rep2@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.break_glass_confidential('c2000000-0000-0000-0000-000000000002', 'let me in') $$,
  '42501',
  NULL,
  'a rep cannot break-glass (insufficient_privilege)'
);

-- ── 15. Reason is mandatory ──────────────────────────────────────────────────
SELECT tests.as_user('founder@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.break_glass_confidential('c2000000-0000-0000-0000-000000000002', '   ') $$,
  '23514',
  NULL,
  'break-glass requires a non-empty reason (check_violation)'
);

-- ── 16. Break-glass refuses non-Confidential deals ───────────────────────────
SELECT throws_ok(
  $$ SELECT public.break_glass_confidential('51000000-0000-0000-0000-000000000004', 'nope') $$,
  '23514',
  NULL,
  'break-glass refuses a Standard-tier deal'
);

-- ── 17. Already-on-list is a no-op error ─────────────────────────────────────
SELECT throws_ok(
  $$ SELECT public.break_glass_confidential('c3000000-0000-0000-0000-000000000003', 'i own this') $$,
  '23505',
  NULL,
  'break-glass refuses a deal the exec already has access to'
);

SELECT * FROM finish();
ROLLBACK;
