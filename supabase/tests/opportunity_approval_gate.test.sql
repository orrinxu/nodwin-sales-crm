-- supabase/tests/opportunity_approval_gate.test.sql
-- pgTAP: opportunity_has_approved_approval helper (ORR-604 Phase 3c).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(2);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email) VALUES ('c1000000-0000-0000-0000-0000000000c1', 'owner@nodwin.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role)
VALUES ('c1000000-0000-0000-0000-0000000000c1', 'owner@nodwin.com', 'Owner', 'sales_rep')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.entities (id, name) VALUES ('c1e00000-0000-0000-0000-0000000000e1', 'E')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('c1b00000-0000-0000-0000-0000000000b1', 'BU', 'c1e00000-0000-0000-0000-0000000000e1', 'sales', 'c1000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('c1a00000-0000-0000-0000-0000000000a1', 'Acct', 'c1000000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('c1000000-0000-0000-0000-000000000001', 'Opp', 'c1a00000-0000-0000-0000-0000000000a1', 'negotiate', 'c1000000-0000-0000-0000-0000000000c1', 'c1b00000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- 1. No approval → gate helper returns false.
SELECT is(
  public.opportunity_has_approved_approval('c1000000-0000-0000-0000-000000000001'),
  false, 'false when the opportunity has no approved approval'
);

-- Add an APPROVED approval instance.
INSERT INTO public.approval_workflows (id, name, entity_type)
VALUES ('c1f00000-0000-0000-0000-0000000000f1', 'WF', 'opportunity')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status)
VALUES ('c1f00000-0000-0000-0000-0000000000f1', 'opportunity', 'c1000000-0000-0000-0000-000000000001', 'approved');

-- 2. Now the gate helper returns true.
SELECT is(
  public.opportunity_has_approved_approval('c1000000-0000-0000-0000-000000000001'),
  true, 'true once an approved approval exists'
);

SELECT * FROM finish();

ROLLBACK;
