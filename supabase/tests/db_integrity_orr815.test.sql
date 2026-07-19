-- supabase/tests/db_integrity_orr815.test.sql
-- pgTAP for ORR-815 DB-integrity cluster:
--   (a) business_units manager change recomputes split-unit visibility
--   (b) line-item DIRECT DML recomputes opportunities.amount (rollup safety net)
--   (c) manager-chain cycle / self-manager rejected
--   (d) opportunity_splits can be fully cleared (sum 0 tolerated)
--   (e) FK delete actions (stage_history, primary_contact, approvals)
--   (f) tasks record-link FKs SET NULL (task survives record delete)
--   (g) users.updated_at maintained; probability_pct 0..100 CHECK
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(19);

-- The splits-sum guard is a DEFERRABLE constraint trigger (fires at commit); a
-- pgTAP suite rolls back, so force immediate checking to exercise it in-txn.
SET CONSTRAINTS ALL IMMEDIATE;

-- ── Users (auth trigger auto-creates public.users; upsert to set fields) ───────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a@nodwin.com', '{"full_name":"A"}'),
  ('a0000000-0000-0000-0000-000000000002', 'b@nodwin.com', '{"full_name":"B"}'),
  ('a0000000-0000-0000-0000-000000000003', 'c@nodwin.com', '{"full_name":"C"}'),
  ('a0000000-0000-0000-0000-000000000004', 'm@nodwin.com', '{"full_name":"Mgr"}'),
  ('a0000000-0000-0000-0000-000000000005', 'o@nodwin.com', '{"full_name":"Owner"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a@nodwin.com', 'A',     'sales_rep', NULL),
  ('a0000000-0000-0000-0000-000000000002', 'b@nodwin.com', 'B',     'sales_rep', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'c@nodwin.com', 'C',     'sales_rep', NULL),
  ('a0000000-0000-0000-0000-000000000004', 'm@nodwin.com', 'Mgr',   'sales_rep', NULL),
  ('a0000000-0000-0000-0000-000000000005', 'o@nodwin.com', 'Owner', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- B reports to A (valid — no cycle).
UPDATE public.users SET manager_user_id = 'a0000000-0000-0000-0000-000000000001'
 WHERE id = 'a0000000-0000-0000-0000-000000000002';

-- ── Base fixtures ─────────────────────────────────────────────────────────────
INSERT INTO public.entities (id, name) VALUES
  ('e0000000-0000-0000-0000-00000000000e', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('b0000000-0000-0000-0000-0000000000b1', 'BU-split', 'e0000000-0000-0000-0000-00000000000e', 'sales', NULL),
  ('b0000000-0000-0000-0000-0000000000b2', 'BU-plain', 'e0000000-0000-0000-0000-00000000000e', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by) VALUES
  ('ac000000-0000-0000-0000-0000000000a1', 'Acct', ARRAY['a.com'],
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005'),
  -- Dedicated account for the task-cascade section so it can be hard-deleted
  -- without tripping the RESTRICT FK from the other opportunities on a1.
  ('ac000000-0000-0000-0000-0000000000a2', 'AcctTask', ARRAY['t.com'],
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005');
INSERT INTO public.contacts (id, full_name, primary_account_id) VALUES
  ('c0000000-0000-0000-0000-0000000000c1', 'Contact', 'ac000000-0000-0000-0000-0000000000a1');

-- ═══ (c) Manager-chain cycle guard ═══════════════════════════════════════════
SELECT throws_ok(
  $$ UPDATE public.users SET manager_user_id = 'a0000000-0000-0000-0000-000000000001'
      WHERE id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'self-manager is rejected');

-- A→B→A: A currently is B's manager; making B A's manager closes the loop.
SELECT throws_ok(
  $$ UPDATE public.users SET manager_user_id = 'a0000000-0000-0000-0000-000000000002'
      WHERE id = 'a0000000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'ancestor cycle is rejected');

-- A valid (acyclic) manager assignment still succeeds.
SELECT lives_ok(
  $$ UPDATE public.users SET manager_user_id = 'a0000000-0000-0000-0000-000000000001'
      WHERE id = 'a0000000-0000-0000-0000-000000000003' $$,
  'valid manager assignment still succeeds');

-- ═══ (b) Line-item DIRECT DML recomputes opportunities.amount ════════════════
INSERT INTO public.opportunities
  (id, name, account_id, stage, sales_initiator_user_id, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('0d000000-0000-0000-0000-000000000011', 'LI', 'ac000000-0000-0000-0000-0000000000a1', 'qualify',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   'b0000000-0000-0000-0000-0000000000b2', 0, 'USD', 'standard');

-- Direct INSERT (NOT via the RPC) → statement trigger recomputes amount.
INSERT INTO public.opportunity_line_items
  (opportunity_id, description, quantity, unit_price_amount)
VALUES ('0d000000-0000-0000-0000-000000000011', 'Widget', 2, 100);
SELECT is(
  (SELECT amount FROM public.opportunities WHERE id = '0d000000-0000-0000-0000-000000000011'),
  200::numeric, 'direct line-item INSERT recomputes amount (200)');

-- Direct UPDATE → recompute again.
UPDATE public.opportunity_line_items SET quantity = 3
 WHERE opportunity_id = '0d000000-0000-0000-0000-000000000011';
SELECT is(
  (SELECT amount FROM public.opportunities WHERE id = '0d000000-0000-0000-0000-000000000011'),
  300::numeric, 'direct line-item UPDATE recomputes amount (300)');

-- ═══ (a) business_units manager change recomputes split-unit visibility ══════
INSERT INTO public.opportunities
  (id, name, account_id, stage, sales_initiator_user_id, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('0d000000-0000-0000-0000-000000000022', 'BUV', 'ac000000-0000-0000-0000-0000000000a1', 'qualify',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   'b0000000-0000-0000-0000-0000000000b1', 100, 'USD', 'standard');
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct) VALUES
  ('0d000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-0000000000b1', 100);

-- Before: BU-split has no manager → no split_unit_manager visibility for Mgr.
UPDATE public.business_units SET manager_user_id = 'a0000000-0000-0000-0000-000000000004'
 WHERE id = 'b0000000-0000-0000-0000-0000000000b1';
SELECT is(
  (SELECT count(*) FROM public.opportunity_visibility
    WHERE opportunity_id = '0d000000-0000-0000-0000-000000000022'
      AND user_id = 'a0000000-0000-0000-0000-000000000004'
      AND reason = 'split_unit_manager'),
  1::bigint, 'BU manager change grants split_unit_manager visibility');

-- ═══ (d) Splits can be fully cleared (sum 0 tolerated) ═══════════════════════
SELECT lives_ok(
  $$ DELETE FROM public.opportunity_splits
      WHERE opportunity_id = '0d000000-0000-0000-0000-000000000022' $$,
  'clearing all splits (sum 0) is allowed');

-- A partial (non-0, non-100) sum is still rejected.
SELECT throws_ok(
  $$ INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct)
     VALUES ('0d000000-0000-0000-0000-000000000022', 'b0000000-0000-0000-0000-0000000000b1', 50) $$,
  'P0001', NULL, 'a partial split sum (50) is still rejected');

-- ═══ (g) probability_pct 0..100 CHECK ════════════════════════════════════════
SELECT throws_ok(
  $$ UPDATE public.opportunities SET probability_pct = 150
      WHERE id = '0d000000-0000-0000-0000-000000000011' $$,
  '23514', NULL, 'probability_pct > 100 is rejected');

-- ═══ (g) users.updated_at maintained by trigger ══════════════════════════════
UPDATE public.users
   SET updated_at = '2000-01-01T00:00:00Z', full_name = 'Renamed'
 WHERE id = 'a0000000-0000-0000-0000-000000000005';
SELECT ok(
  (SELECT updated_at FROM public.users WHERE id = 'a0000000-0000-0000-0000-000000000005')
    >= now() - interval '1 minute',
  'users.updated_at is forced to now() (stale value overridden)');

-- ═══ (f) tasks record links SET NULL on record delete; (e) stage_history CASCADE
INSERT INTO public.opportunities
  (id, name, account_id, stage, sales_initiator_user_id, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('0d000000-0000-0000-0000-000000000033', 'TaskOpp', 'ac000000-0000-0000-0000-0000000000a2', 'qualify',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   'b0000000-0000-0000-0000-0000000000b2', 100, 'USD', 'standard');
INSERT INTO public.tasks (id, title, assignee_user_id, created_by, opportunity_id, account_id, contact_id) VALUES
  ('7a000000-0000-0000-0000-000000000071', 'Follow up',
   'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000005',
   '0d000000-0000-0000-0000-000000000033', 'ac000000-0000-0000-0000-0000000000a2',
   'c0000000-0000-0000-0000-0000000000c1');
INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, event, created_by) VALUES
  ('0d000000-0000-0000-0000-000000000033', 'qualify', 'propose', 'advance',
   'a0000000-0000-0000-0000-000000000005');

-- Delete each linked record; the task must survive with the link nulled.
DELETE FROM public.contacts       WHERE id = 'c0000000-0000-0000-0000-0000000000c1';
DELETE FROM public.opportunities  WHERE id = '0d000000-0000-0000-0000-000000000033';
DELETE FROM public.accounts       WHERE id = 'ac000000-0000-0000-0000-0000000000a2';

SELECT results_eq(
  $$ SELECT opportunity_id, account_id, contact_id, assignee_user_id
       FROM public.tasks WHERE id = '7a000000-0000-0000-0000-000000000071' $$,
  $$ VALUES (NULL::uuid, NULL::uuid, NULL::uuid, 'a0000000-0000-0000-0000-000000000005'::uuid) $$,
  'task survives record deletion with links SET NULL, assignee intact');

SELECT is(
  (SELECT count(*) FROM public.opportunity_stage_history
    WHERE opportunity_id = '0d000000-0000-0000-0000-000000000033'),
  0::bigint, 'stage history CASCADE-deleted with its opportunity');

-- ═══ (e)/(f) FK delete-action catalog checks ═════════════════════════════════
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'tasks_opportunity_id_fkey'),
  'n', 'tasks.opportunity_id FK is ON DELETE SET NULL');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'tasks_account_id_fkey'),
  'n', 'tasks.account_id FK is ON DELETE SET NULL');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'tasks_contact_id_fkey'),
  'n', 'tasks.contact_id FK is ON DELETE SET NULL');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'approval_instances_opportunity_id_fkey'),
  'c', 'approval_instances.opportunity_id FK is ON DELETE CASCADE');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'opportunity_stage_history_opportunity_id_fkey'),
  'c', 'opportunity_stage_history.opportunity_id FK is ON DELETE CASCADE');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'opportunity_stage_history_created_by_fkey'),
  'n', 'opportunity_stage_history.created_by FK is ON DELETE SET NULL');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'opportunities_primary_contact_id_fkey'),
  'n', 'opportunities.primary_contact_id FK is ON DELETE SET NULL');

SELECT * FROM finish();
ROLLBACK;
