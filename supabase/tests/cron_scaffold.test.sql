-- supabase/tests/cron_scaffold.test.sql
-- pgTAP tests for the pg_cron scaffold (ORR-600 #6).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db  (all changes rolled back)

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-1111111c0f01', 'cronrep@nodwin.com',  '{}'),
  ('22222222-2222-2222-2222-2222222c0f02', 'cronadmin@nodwin.com', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('11111111-1111-1111-1111-1111111c0f01', 'cronrep@nodwin.com',  'Cron Rep',   'sales_rep'),
  ('22222222-2222-2222-2222-2222222c0f02', 'cronadmin@nodwin.com', 'Cron Admin', 'admin')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SET LOCAL ROLE postgres;

-- 1. the demo job runs and records an ok row
SELECT public.job_pipeline_health_snapshot();
SELECT isnt_empty(
  $$SELECT 1 FROM public.cron_job_runs WHERE job_name = 'pipeline_health_snapshot' AND status = 'ok'$$,
  'the demo job records an ok run');

-- 2. the run detail carries aggregate counts (not per-deal data)
SELECT ok(
  (SELECT (detail ? 'open_deals') AND (detail ? 'stalled_deals')
     FROM public.cron_job_runs
    WHERE job_name = 'pipeline_health_snapshot'
    ORDER BY ran_at DESC LIMIT 1),
  'the run detail carries open_deals + stalled_deals');

-- 3. the nightly job is registered with pg_cron
SELECT isnt_empty(
  $$SELECT 1 FROM cron.job WHERE jobname = 'pipeline-health-snapshot'$$,
  'the nightly cron job is scheduled');

-- 4. admin can read the run log
SELECT tests.as_user('cronadmin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT 1 FROM public.cron_job_runs$$,
  'admin can read cron_job_runs');

-- 5. non-admin cannot read the run log
SELECT tests.as_user('cronrep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT 1 FROM public.cron_job_runs$$,
  'non-admin cannot read cron_job_runs');

SELECT * FROM finish();
ROLLBACK;
