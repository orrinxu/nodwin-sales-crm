-- supabase/tests/opportunity_revenue_schedule.test.sql
-- pgTAP: opportunity_revenue_schedule write path (GH #148).
--   • replace_revenue_schedule RPC is authorised (visibility OR admin) and atomic
--     (a duplicate-month failure rolls back the delete — no data loss).
--   • the repointed policies (now via can_access_opportunity_schedule) still
--     enforce visibility-based read/write identically.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(13);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('d0000000-0000-0000-0000-0000000000f1', 'owner@nodwin.com', '{"full_name":"Owner"}'),
  ('d0000000-0000-0000-0000-0000000000f2', 'other@nodwin.com', '{"full_name":"Other"}'),
  ('d0000000-0000-0000-0000-0000000000f3', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('d0e00000-0000-0000-0000-0000000000e1', 'Rev Sched Entity')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('d0000000-0000-0000-0000-0000000000f1', 'owner@nodwin.com', 'Owner', 'sales_rep', 'd0e00000-0000-0000-0000-0000000000e1'),
  ('d0000000-0000-0000-0000-0000000000f2', 'other@nodwin.com', 'Other', 'sales_rep', 'd0e00000-0000-0000-0000-0000000000e1'),
  ('d0000000-0000-0000-0000-0000000000f3', 'admin@nodwin.com', 'Admin', 'admin',     'd0e00000-0000-0000-0000-0000000000e1')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('d0b00000-0000-0000-0000-0000000000b1', 'Rev Sched BU', 'd0e00000-0000-0000-0000-0000000000e1', 'sales', 'd0000000-0000-0000-0000-0000000000f1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('d0a00000-0000-0000-0000-0000000000a1', 'Rev Sched Acct', 'd0000000-0000-0000-0000-0000000000f1', 'd0000000-0000-0000-0000-0000000000f1')
ON CONFLICT (id) DO NOTHING;

-- Opportunity owned by Owner — the visibility trigger grants Owner (only) a row.
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES (
  'd0000000-0000-0000-0000-000000000001', 'Rev Sched Opp',
  'd0a00000-0000-0000-0000-0000000000a1', 'qualify',
  'd0000000-0000-0000-0000-0000000000f1', 'd0b00000-0000-0000-0000-0000000000b1',
  100000, 'USD', 'standard'
) ON CONFLICT (id) DO NOTHING;

-- ── RPC: authorisation ───────────────────────────────────────────────────────
-- 1. Owner (has visibility) can replace the schedule via the RPC.
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.replace_revenue_schedule('d0000000-0000-0000-0000-000000000001',
    '[{"month":"2026-01-01","amount":"60000"},{"month":"2026-02-01","amount":"40000"}]'::jsonb)$$,
  'owner can replace the revenue schedule via the RPC'
);
-- 2. The two rows are present.
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001'),
  2, 'RPC inserted both schedule rows'
);

-- 3. A user without visibility cannot replace the schedule (raises 42501).
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.replace_revenue_schedule('d0000000-0000-0000-0000-000000000001',
    '[{"month":"2026-03-01","amount":"100000"}]'::jsonb)$$,
  '42501', NULL, 'user without opportunity visibility cannot replace the schedule'
);
-- 4. The unauthorised call changed nothing.
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001'),
  2, 'unauthorised RPC left the schedule untouched'
);

-- ── RPC: atomicity (the core data-loss fix) ──────────────────────────────────
-- 5. A duplicate month violates UNIQUE(opportunity_id, month) → 23505.
SELECT throws_ok(
  $$SELECT public.replace_revenue_schedule('d0000000-0000-0000-0000-000000000001',
    '[{"month":"2026-05-01","amount":"50000"},{"month":"2026-05-01","amount":"50000"}]'::jsonb)$$,
  '23505', NULL, 'duplicate month in payload fails (unique violation)'
);
-- 6. ATOMIC: the failed insert rolled back the delete — the prior schedule survives.
SELECT results_eq(
  $$SELECT to_char(month,'YYYY-MM-DD'), amount::text FROM public.opportunity_revenue_schedule
    WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001' ORDER BY month$$,
  $$VALUES ('2026-01-01', '60000.0000'), ('2026-02-01', '40000.0000')$$,
  'atomic: prior schedule survives a failed replace (delete rolled back)'
);

-- ── RPC: admin bypass + clear ────────────────────────────────────────────────
-- 7. Admin (no visibility row, but admin role) can replace.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.replace_revenue_schedule('d0000000-0000-0000-0000-000000000001',
    '[{"month":"2026-04-01","amount":"100000"}]'::jsonb)$$,
  'admin can replace the schedule'
);
-- 8. Admin replace swapped the whole set to a single row.
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001'),
  1, 'admin replace is last-write-wins'
);
-- 9. Empty array clears the schedule.
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.replace_revenue_schedule('d0000000-0000-0000-0000-000000000001', '[]'::jsonb)$$,
  'owner can clear the schedule with an empty array'
);
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'empty replace clears the schedule'
);

-- ── Repointed policies still enforce visibility on DIRECT table ops ───────────
-- 10. Owner can directly INSERT a schedule row (insert policy via helper).
SELECT lives_ok(
  $$INSERT INTO public.opportunity_revenue_schedule (opportunity_id, month, amount)
    VALUES ('d0000000-0000-0000-0000-000000000001','2026-06-01', 100000)$$,
  'owner can directly insert a schedule row (repointed INSERT policy)'
);
-- 11. Owner can directly SELECT it (select policy via helper).
SELECT isnt_empty(
  $$SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id = 'd0000000-0000-0000-0000-000000000001'$$,
  'owner can read the schedule (repointed SELECT policy)'
);
-- 12. A user without visibility cannot directly INSERT (WITH CHECK via helper).
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.opportunity_revenue_schedule (opportunity_id, month, amount)
    VALUES ('d0000000-0000-0000-0000-000000000001','2026-07-01', 100000)$$,
  '42501', NULL, 'user without visibility cannot directly insert a schedule row'
);

SELECT * FROM finish();

ROLLBACK;
