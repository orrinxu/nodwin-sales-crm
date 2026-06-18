-- supabase/tests/opportunity_revenue_schedule.test.sql
-- pgTAP tests for public.opportunity_revenue_schedule table, RLS policies, and audit trigger.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(16);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('f0000100-0000-0000-0000-000000000001', 'opp_owner@nodwin.com',   '{"full_name":"Opp Owner"}'),
  ('f0000100-0000-0000-0000-000000000002', 'other_rep@nodwin.com',   '{"full_name":"Other Rep"}'),
  ('f0000100-0000-0000-0000-000000000003', 'admin_user@nodwin.com',  '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('f0000100-0000-0000-0000-000000000001', 'opp_owner@nodwin.com',  'Opp Owner',  'sales_rep', 'f0000200-0000-0000-0000-000000000001'),
  ('f0000100-0000-0000-0000-000000000002', 'other_rep@nodwin.com',  'Other Rep',  'sales_rep', 'f0000200-0000-0000-0000-000000000001'),
  ('f0000100-0000-0000-0000-000000000003', 'admin_user@nodwin.com', 'Admin User', 'admin',     'f0000200-0000-0000-0000-000000000001')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert entity, business unit, account, and opportunity (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('f0000200-0000-0000-0000-000000000001', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES
  ('f0000300-0000-0000-0000-000000000001', 'Test BU', 'f0000200-0000-0000-0000-000000000001', 'sales', 'f0000100-0000-0000-0000-000000000001');

INSERT INTO public.accounts (id, name, email_domains)
VALUES ('f0000400-0000-0000-0000-000000000001', 'Test Account', ARRAY['test.com']);

INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES (
  'f0000500-0000-0000-0000-000000000001',
  'Test Opportunity',
  'f0000400-0000-0000-0000-000000000001',
  'qualify',
  'f0000100-0000-0000-0000-000000000001',
  'f0000100-0000-0000-0000-000000000001',
  'f0000300-0000-0000-0000-000000000001',
  100000, 'USD',
  'standard'
);

-- Insert test schedule data (as service role).
INSERT INTO public.opportunity_revenue_schedule (id, opportunity_id, month, amount)
VALUES
  ('f0000600-0000-0000-0000-000000000001', 'f0000500-0000-0000-0000-000000000001', '2026-01-01', 25000),
  ('f0000600-0000-0000-0000-000000000002', 'f0000500-0000-0000-0000-000000000001', '2026-02-01', 25000);

-- ── SELECT tests ─────────────────────────────────────────────────────────────

-- 1. Opportunity owner can SELECT schedule rows.
SELECT tests.as_user('opp_owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'f0000500-0000-0000-0000-000000000001'$$,
  'opp owner can SELECT schedule rows for their opportunity'
);

-- 2. Unrelated user (not in team, not in manager chain) cannot SELECT schedule rows.
SELECT tests.as_user('other_rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'f0000500-0000-0000-0000-000000000001'$$,
  'unrelated user cannot SELECT schedule rows'
);

-- 3. Admin user can SELECT schedule rows.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'f0000500-0000-0000-0000-000000000001'$$,
  'admin can SELECT schedule rows'
);

-- 4. Anon cannot SELECT schedule rows.
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE true$$,
  'anon cannot SELECT any schedule rows'
);

-- ── INSERT tests ─────────────────────────────────────────────────────────────

-- 5. Opportunity owner can INSERT a new schedule row.
SELECT tests.as_user('opp_owner@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.opportunity_revenue_schedule (id, opportunity_id, month, amount)
VALUES ('f0000600-0000-0000-0000-000000000003', 'f0000500-0000-0000-0000-000000000001', '2026-03-01', 25000);

SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000003'$$,
  'opp owner can INSERT a schedule row for their opportunity'
);

-- 6. Unrelated user cannot INSERT a schedule row.
SELECT tests.as_user('other_rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_revenue_schedule (id, opportunity_id, month, amount) VALUES (gen_random_uuid(), 'f0000500-0000-0000-0000-000000000001', '2026-04-01', 25000)$$,
  '42501',
  NULL,
  'unrelated user cannot INSERT a schedule row'
);

-- 7. Admin can INSERT a schedule row.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.opportunity_revenue_schedule (id, opportunity_id, month, amount)
VALUES ('f0000600-0000-0000-0000-000000000004', 'f0000500-0000-0000-0000-000000000001', '2026-05-01', 25000);

SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000004'$$,
  'admin can INSERT a schedule row'
);

-- ── UPDATE tests ─────────────────────────────────────────────────────────────

-- 8. Opportunity owner can UPDATE a schedule row.
SELECT tests.as_user('opp_owner@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_revenue_schedule
   SET amount = 30000
 WHERE id = 'f0000600-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT amount FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000001'$$,
  $$VALUES (30000::numeric(20,4))$$,
  'opp owner can UPDATE a schedule row'
);

-- 9. Unrelated user cannot UPDATE a schedule row (RLS filters silently).
SELECT tests.as_user('other_rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_revenue_schedule
   SET amount = 99999
 WHERE id = 'f0000600-0000-0000-0000-000000000001';

-- Switch to admin to verify the value was NOT changed.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT amount FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000001'$$,
  $$VALUES (30000::numeric(20,4))$$,
  'unrelated user cannot UPDATE a schedule row (value unchanged)'
);

-- 10. Admin can UPDATE a schedule row.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.opportunity_revenue_schedule
   SET amount = 35000
 WHERE id = 'f0000600-0000-0000-0000-000000000001';

SELECT results_eq(
  $$SELECT amount FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000001'$$,
  $$VALUES (35000::numeric(20,4))$$,
  'admin can UPDATE a schedule row'
);

-- ── DELETE tests ─────────────────────────────────────────────────────────────

-- 11. Opportunity owner cannot DELETE a schedule row (DELETE is admin-only).
SELECT tests.as_user('opp_owner@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_revenue_schedule
 WHERE id = 'f0000600-0000-0000-0000-000000000002';

-- Switch to admin to verify the row was NOT deleted.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000002'$$,
  'opp owner cannot DELETE a schedule row (row still exists)'
);

-- 12. Unrelated user cannot DELETE a schedule row (RLS filters silently).
SELECT tests.as_user('other_rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_revenue_schedule
 WHERE id = 'f0000600-0000-0000-0000-000000000001';

-- Switch to admin to verify the row was NOT deleted.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000001'$$,
  'unrelated user cannot DELETE a schedule row (row still exists)'
);

-- 13. Admin can DELETE a schedule row.
SELECT tests.as_user('admin_user@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.opportunity_revenue_schedule
 WHERE id = 'f0000600-0000-0000-0000-000000000001';

SELECT is_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE id = 'f0000600-0000-0000-0000-000000000001'$$,
  'admin can DELETE a schedule row'
);

-- ── Audit trigger test ───────────────────────────────────────────────────────

-- 14. Audit log records INSERT.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.opportunity_revenue_schedule (id, opportunity_id, month, amount)
VALUES ('f0000700-0000-0000-0000-000000000001', 'f0000500-0000-0000-0000-000000000001', '2026-06-01', 50000);

SELECT isnt_empty(
  $$SELECT id FROM public.audit_log
     WHERE table_name = 'opportunity_revenue_schedule'
       AND row_id = 'f0000700-0000-0000-0000-000000000001'
       AND operation = 'INSERT'$$,
  'audit log records INSERT on opportunity_revenue_schedule'
);

-- 15. Audit log records UPDATE.
UPDATE public.opportunity_revenue_schedule
   SET amount = 60000
 WHERE id = 'f0000700-0000-0000-0000-000000000001';

SELECT isnt_empty(
  $$SELECT id FROM public.audit_log
     WHERE table_name = 'opportunity_revenue_schedule'
       AND row_id = 'f0000700-0000-0000-0000-000000000001'
       AND operation = 'UPDATE'$$,
  'audit log records UPDATE on opportunity_revenue_schedule'
);

-- 16. Audit log records DELETE.
DELETE FROM public.opportunity_revenue_schedule
 WHERE id = 'f0000700-0000-0000-0000-000000000001';

SELECT isnt_empty(
  $$SELECT id FROM public.audit_log
     WHERE table_name = 'opportunity_revenue_schedule'
       AND row_id = 'f0000700-0000-0000-0000-000000000001'
       AND operation = 'DELETE'$$,
  'audit log records DELETE on opportunity_revenue_schedule'
);

-- ── Finish ───────────────────────────────────────────────────────────────────

SELECT * FROM finish();

ROLLBACK;
