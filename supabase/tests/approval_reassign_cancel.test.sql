-- supabase/tests/approval_reassign_cancel.test.sql
-- pgTAP: admin reassign / cancel of in-flight approvals (ORR-604 Phase 3b).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   '{"full_name":"Mgr"}'),
  ('dd000000-0000-0000-0000-0000000000d1', 'newp@nodwin.com',  '{"full_name":"New Approver"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES ('e1000000-0000-0000-0000-0000000000e1', 'E1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, manager_user_id) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', 'Admin', 'admin',     'e1000000-0000-0000-0000-0000000000e1', NULL),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   'Rep',   'sales_rep', 'e1000000-0000-0000-0000-0000000000e1', 'cc000000-0000-0000-0000-0000000000c1'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   'Mgr',   'sales_manager', 'e1000000-0000-0000-0000-0000000000e1', NULL),
  ('dd000000-0000-0000-0000-0000000000d1', 'newp@nodwin.com',  'New',   'sales_rep', 'e1000000-0000-0000-0000-0000000000e1', NULL)
ON CONFLICT (id) DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id, primary_role = EXCLUDED.primary_role;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('b1000000-0000-0000-0000-0000000000b1', 'BU', 'e1000000-0000-0000-0000-0000000000e1', 'sales', 'cc000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('a1000000-0000-0000-0000-0000000000a1', 'Acct', 'bb000000-0000-0000-0000-0000000000b1', 'bb000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('0a000000-0000-0000-0000-00000000000a', 'Opp A', 'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('0b000000-0000-0000-0000-00000000000b', 'Opp B', 'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- Submit both (default = submitter's manager).
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.submit_opportunity_for_approval('0a000000-0000-0000-0000-00000000000a');
SELECT public.submit_opportunity_for_approval('0b000000-0000-0000-0000-00000000000b');

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS a_step FROM public.approval_steps s JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '0a000000-0000-0000-0000-00000000000a' \gset
SELECT i.id AS b_inst FROM public.approval_instances i WHERE i.entity_id = '0b000000-0000-0000-0000-00000000000b' \gset
SELECT s.id AS b_step FROM public.approval_steps s JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '0b000000-0000-0000-0000-00000000000b' \gset

-- ── Reassign ─────────────────────────────────────────────────────────────────
-- 1. Non-admin cannot reassign.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.reassign_approval_step(%L, 'dd000000-0000-0000-0000-0000000000d1')$$, :'a_step'),
  '42501', NULL, 'non-admin cannot reassign a step'
);
-- 2. Admin reassigns the step to the new approver.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.reassign_approval_step(%L, 'dd000000-0000-0000-0000-0000000000d1')$$, :'a_step'),
  'admin reassigns the step'
);
-- 3. The step is now a named-user step for the new approver.
SELECT results_eq(
  format($$SELECT approver_user_id, approver_role FROM public.approval_steps WHERE id = %L$$, :'a_step'),
  $$VALUES ('dd000000-0000-0000-0000-0000000000d1'::uuid, NULL::public.user_role)$$,
  'reassigned step names the new approver and clears the role'
);
-- 4. The previous approver (the manager) can no longer decide it.
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'a_step'),
  '42501', NULL, 'the previous approver can no longer decide after reassignment'
);
-- 5. The new approver can decide it.
SELECT tests.as_user('newp@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'a_step'),
  'the reassigned approver can decide'
);

-- ── Cancel ───────────────────────────────────────────────────────────────────
-- 6. Non-admin cannot cancel.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.cancel_approval_instance(%L)$$, :'b_inst'),
  '42501', NULL, 'non-admin cannot cancel an approval'
);
-- 7. Admin cancels the approval.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.cancel_approval_instance(%L)$$, :'b_inst'),
  'admin cancels the approval'
);
-- 8. It is now cancelled.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = :'b_inst'),
  'cancelled', 'the instance is cancelled'
);
-- 9. Cancelling again fails (not pending).
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.cancel_approval_instance(%L)$$, :'b_inst'),
  '23514', NULL, 'cannot cancel an already-resolved approval'
);

SELECT * FROM finish();

ROLLBACK;
