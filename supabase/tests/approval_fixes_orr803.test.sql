-- supabase/tests/approval_fixes_orr803.test.sql
-- pgTAP for ORR-803 approval fix cluster:
--   (a) closed_lost is exempt from the enforce gate (a loss is always recordable).
--   (b) the enforce gate evaluates only the ONE workflow submit would resolve
--       (entity-specific first, else org-wide) — no org+entity deadlock.
--   (c) reassign_approval_step collapses a multi-approver step to a single named
--       approver, rewriting approver_user_ids so the step can complete.
--   (d) invalidate_opportunity_approvals cancels standing approved instances and
--       is authorised by can_manage_opportunity.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(11);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('80300000-0000-0000-0000-000000000001', 'admin803@nodwin.com', '{"full_name":"Admin"}'),
  ('80300000-0000-0000-0000-000000000002', 'rep803@nodwin.com',   '{"full_name":"Rep"}'),
  ('80300000-0000-0000-0000-000000000003', 'other803@nodwin.com', '{"full_name":"Other"}'),
  ('80300000-0000-0000-0000-00000000000a', 'a803@nodwin.com',     '{"full_name":"Approver A"}'),
  ('80300000-0000-0000-0000-00000000000b', 'b803@nodwin.com',     '{"full_name":"Approver B"}'),
  ('80300000-0000-0000-0000-00000000000c', 'c803@nodwin.com',     '{"full_name":"Approver C"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Entity first — users reference it via primary_entity_id.
INSERT INTO public.entities (id, name) VALUES ('80310000-0000-0000-0000-0000000000e1', 'E1-803')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('80300000-0000-0000-0000-000000000001', 'admin803@nodwin.com', 'Admin', 'admin',     '80310000-0000-0000-0000-0000000000e1'),
  ('80300000-0000-0000-0000-000000000002', 'rep803@nodwin.com',   'Rep',   'sales_rep', '80310000-0000-0000-0000-0000000000e1'),
  ('80300000-0000-0000-0000-000000000003', 'other803@nodwin.com', 'Other', 'sales_rep', '80310000-0000-0000-0000-0000000000e1'),
  ('80300000-0000-0000-0000-00000000000a', 'a803@nodwin.com',     'A',     'sales_rep', '80310000-0000-0000-0000-0000000000e1'),
  ('80300000-0000-0000-0000-00000000000b', 'b803@nodwin.com',     'B',     'sales_rep', '80310000-0000-0000-0000-0000000000e1'),
  ('80300000-0000-0000-0000-00000000000c', 'c803@nodwin.com',     'C',     'sales_rep', '80310000-0000-0000-0000-0000000000e1')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, primary_entity_id = EXCLUDED.primary_entity_id;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('80320000-0000-0000-0000-0000000000b1', 'BU-803', '80310000-0000-0000-0000-0000000000e1', 'sales', '80300000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('80330000-0000-0000-0000-0000000000a1', 'Acct-803', '80300000-0000-0000-0000-000000000002', '80300000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('80340000-0000-0000-0000-000000000001', 'Opp Gate',     '80330000-0000-0000-0000-0000000000a1', 'qualify', '80300000-0000-0000-0000-000000000002', '80320000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('80340000-0000-0000-0000-000000000002', 'Opp Reassign', '80330000-0000-0000-0000-0000000000a1', 'qualify', '80300000-0000-0000-0000-000000000002', '80320000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('80340000-0000-0000-0000-000000000003', 'Opp Stale',    '80330000-0000-0000-0000-0000000000a1', 'qualify', '80300000-0000-0000-0000-000000000002', '80320000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- BOTH an entity-specific AND an org-wide enforce_gate workflow, triggering at
-- qualify. The old gate looped both and required an approved instance per
-- workflow — but submit only ever instantiates the entity one → deadlock.
INSERT INTO public.approval_workflows (id, name, entity_type, entity_id, enforce_gate, trigger_stage) VALUES
  ('80350000-0000-0000-0000-0000000000e1', 'WF Entity', 'opportunity', '80310000-0000-0000-0000-0000000000e1', true, 'qualify'),
  ('80350000-0000-0000-0000-0000000000ff', 'WF Org',    'opportunity', NULL,                                   true, 'qualify')
ON CONFLICT (id) DO NOTHING;

-- ── (a) closed_lost exemption ────────────────────────────────────────────────
-- 1. A move to closed_lost is always allowed even though enforce-gate workflows
--    are configured and unapproved (a loss must remain recordable).
SELECT is(
  public.opportunity_check_enforce_gate('80340000-0000-0000-0000-000000000001', 'closed_lost'),
  true,
  'closed_lost is exempt from the enforce gate'
);

-- ── (b) org+entity deadlock ──────────────────────────────────────────────────
-- 2. With no approved instance, advancing past qualify is blocked.
SELECT is(
  public.opportunity_check_enforce_gate('80340000-0000-0000-0000-000000000001', 'negotiate'),
  false,
  'enforce gate blocks when the governing workflow has no approved instance'
);

-- Approve ONLY the entity-specific workflow (the one submit would resolve). The
-- org-wide workflow is left unapproved.
INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
VALUES ('80350000-0000-0000-0000-0000000000e1', 'opportunity', '80340000-0000-0000-0000-000000000001', 'approved');

-- 3. The gate clears on the entity workflow's approval alone — the org-wide
--    workflow no longer independently blocks (the deadlock is gone). Under the
--    old loop this stayed false (org-wide unapproved).
SELECT is(
  public.opportunity_check_enforce_gate('80340000-0000-0000-0000-000000000001', 'negotiate'),
  true,
  'gate clears on the governing (entity) workflow alone; org-wide does not deadlock'
);

-- ── (c) reassign rewrites the multi-approver array ───────────────────────────
-- A pending instance with an all_required {A,B} step (approver_user_ids only).
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status)
VALUES ('80360000-0000-0000-0000-000000000002', '80350000-0000-0000-0000-0000000000e1', 'opportunity', '80340000-0000-0000-0000-000000000002', 'pending');
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode, status)
VALUES ('80370000-0000-0000-0000-000000000002', '80360000-0000-0000-0000-000000000002', 1,
        ARRAY['80300000-0000-0000-0000-00000000000a','80300000-0000-0000-0000-00000000000b']::uuid[],
        'all_required', 'pending');

-- 4. Admin reassigns the whole step to C.
SELECT tests.as_user('admin803@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.reassign_approval_step('80370000-0000-0000-0000-000000000002', '80300000-0000-0000-0000-00000000000c')$$,
  'admin reassigns a multi-approver step'
);

-- 5. The array is rewritten: single named approver C, empty array, any_one mode.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$SELECT approver_user_id, approver_user_ids, approver_role, mode::text
    FROM public.approval_steps WHERE id = '80370000-0000-0000-0000-000000000002'$$,
  $$VALUES ('80300000-0000-0000-0000-00000000000c'::uuid, NULL::uuid[], NULL::public.user_role, 'any_one')$$,
  'reassign collapses the step to a single named approver and clears the array'
);

-- 6. C alone can now complete the step (old bug: required set {A,B,C} never met).
SELECT tests.as_user('c803@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.record_approval_decision('80370000-0000-0000-0000-000000000002', 'approved')$$,
  'the reassigned single approver can decide the step'
);
-- 7. The step completes on the single reassigned approver's decision.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = '80370000-0000-0000-0000-000000000002'),
  'approved',
  'the step completes on the single reassigned approver''s decision'
);

-- ── (d) staleness invalidation ───────────────────────────────────────────────
-- An approved instance for Opp Stale that a material change must invalidate.
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status)
VALUES ('80360000-0000-0000-0000-000000000003', '80350000-0000-0000-0000-0000000000e1', 'opportunity', '80340000-0000-0000-0000-000000000003', 'approved');

-- 8. A non-manager (not owner/team/admin/gsl) cannot invalidate.
SELECT tests.as_user('other803@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.invalidate_opportunity_approvals('80340000-0000-0000-0000-000000000003')$$,
  '42501', NULL, 'a non-manager cannot invalidate approvals'
);

-- 9. The owner (can_manage) invalidates: returns 1 (one approved instance cancelled).
SELECT tests.as_user('rep803@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  public.invalidate_opportunity_approvals('80340000-0000-0000-0000-000000000003'),
  1,
  'invalidate cancels the standing approved instance and returns its count'
);

-- 10. The instance is now cancelled.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = '80360000-0000-0000-0000-000000000003'),
  'cancelled',
  'the approved instance is cancelled after invalidation'
);

-- 11. Invalidating again is a no-op (nothing approved remains) → returns 0.
SELECT tests.as_user('rep803@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  public.invalidate_opportunity_approvals('80340000-0000-0000-0000-000000000003'),
  0,
  'invalidate is idempotent — no approved instances left returns 0'
);

SELECT * FROM finish();

ROLLBACK;
