-- supabase/tests/approval_correctness_orr695.test.sql
-- pgTAP for ORR-695:
--   A) opportunity_check_enforce_gate scopes to the sales-unit entity, not
--      billing_entity_id.
--   B) partial unique index enforces one pending approval per opportunity.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(5);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES ('d1000000-0000-0000-0000-0000000000d1', 'rep@nodwin.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role)
VALUES ('d1000000-0000-0000-0000-0000000000d1', 'rep@nodwin.com', 'Rep', 'sales_rep')
ON CONFLICT (id) DO NOTHING;

-- Two DISTINCT entities: E1 is the sales-unit entity, E2 is the billing entity.
INSERT INTO public.entities (id, name) VALUES ('d1e10000-0000-0000-0000-0000000000e1', 'E1-sales')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.entities (id, name) VALUES ('d1e20000-0000-0000-0000-0000000000e2', 'E2-billing')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('d1b00000-0000-0000-0000-0000000000b1', 'BU', 'd1e10000-0000-0000-0000-0000000000e1', 'sales', 'd1000000-0000-0000-0000-0000000000d1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('d1a00000-0000-0000-0000-0000000000a1', 'Acct', 'd1000000-0000-0000-0000-0000000000d1', 'd1000000-0000-0000-0000-0000000000d1')
ON CONFLICT (id) DO NOTHING;

-- sales_unit_id → BU → entity E1; billing_entity_id → E2 (deliberately different).
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, billing_entity_id, amount, currency, visibility_tier)
VALUES ('d1000000-0000-0000-0000-000000000001', 'Opp', 'd1a00000-0000-0000-0000-0000000000a1', 'qualify', 'd1000000-0000-0000-0000-0000000000d1', 'd1b00000-0000-0000-0000-0000000000b1', 'd1e20000-0000-0000-0000-0000000000e2', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- enforce_gate workflow keyed to the SALES-UNIT entity (E1), triggering at qualify.
INSERT INTO public.approval_workflows (id, name, entity_type, entity_id, enforce_gate, trigger_stage)
VALUES ('d1f00000-0000-0000-0000-0000000000f1', 'Gate WF', 'opportunity', 'd1e10000-0000-0000-0000-0000000000e1', true, 'qualify')
ON CONFLICT (id) DO NOTHING;

-- ── A. enforce gate scopes to the sales-unit entity ──────────────────────────
-- 1. No approved instance yet → advancing past qualify is BLOCKED (false). Under
--    the old billing_entity_id scoping this returned true (workflow on E1 never
--    matched billing E2) — the fail-open bug.
SELECT is(
  public.opportunity_check_enforce_gate('d1000000-0000-0000-0000-000000000001', 'negotiate'),
  false,
  'enforce gate blocks when the sales-unit entity has an unapproved enforce_gate workflow'
);

-- Add an APPROVED instance for that workflow.
INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
VALUES ('d1f00000-0000-0000-0000-0000000000f1', 'opportunity', 'd1000000-0000-0000-0000-000000000001', 'approved');

-- 2. Now the gate clears.
SELECT is(
  public.opportunity_check_enforce_gate('d1000000-0000-0000-0000-000000000001', 'negotiate'),
  true,
  'enforce gate clears once an approved instance exists for the workflow'
);

-- ── B. one pending approval per opportunity ──────────────────────────────────
-- 3. The partial unique index exists.
SELECT ok(
  EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_approval_instances_one_pending_per_opp'
  ),
  'partial unique index for one-pending-per-opportunity exists'
);

-- First pending instance is fine.
INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
VALUES ('d1f00000-0000-0000-0000-0000000000f1', 'opportunity', 'd1000000-0000-0000-0000-000000000001', 'pending');

-- 4. A second pending instance for the same opportunity is rejected.
SELECT throws_ok(
  $$INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
    VALUES ('d1f00000-0000-0000-0000-0000000000f1', 'opportunity', 'd1000000-0000-0000-0000-000000000001', 'pending')$$,
  '23505',
  NULL,
  'a second pending approval on the same opportunity is rejected by the unique index'
);

-- 5. A terminal (approved/rejected/cancelled) instance is NOT constrained.
SELECT lives_ok(
  $$INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
    VALUES ('d1f00000-0000-0000-0000-0000000000f1', 'opportunity', 'd1000000-0000-0000-0000-000000000001', 'cancelled')$$,
  'a non-pending instance is allowed alongside a pending one'
);

SELECT * FROM finish();

ROLLBACK;
