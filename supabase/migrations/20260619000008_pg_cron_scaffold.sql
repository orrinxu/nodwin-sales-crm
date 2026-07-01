-- supabase/migrations/20260619000008_pg_cron_scaffold.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Background-jobs scaffold (ORR-600 #6). Establishes pg_cron plus a run-audit
-- table and one safe demo job, so future scheduled work (AI-usage rollups, Drive
-- re-sync, P&L generation, inbound-email post-processing per SOW §6.7) can be
-- added by dropping in a SECURITY DEFINER function + a `cron.schedule(...)` call.
--
-- Pattern for adding a job:
--   1. write `public.job_<name>()` (SECURITY DEFINER; wrap work in BEGIN/EXCEPTION
--      and record success/failure into public.cron_job_runs);
--   2. `SELECT cron.schedule('<name>', '<cron expr>', $$ SELECT public.job_<name>(); $$);`
--      (cron.schedule upserts by name, so re-running the migration is idempotent).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Run-audit table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_job_runs (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name  text NOT NULL,
  status    text NOT NULL DEFAULT 'ok',   -- 'ok' | 'error'
  detail    jsonb,
  ran_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cron_job_runs_job_name_ran_at_idx
  ON public.cron_job_runs (job_name, ran_at DESC);

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

-- Rows are written by the scheduled jobs (running as the table owner), not by app
-- users, so there is no write policy for authenticated. Admins may read the log.
DROP POLICY IF EXISTS "cron_job_runs_select_admin" ON public.cron_job_runs;
CREATE POLICY "cron_job_runs_select_admin"
  ON public.cron_job_runs
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── Demo job: nightly pipeline-health snapshot ───────────────────────────────
-- Records aggregate counts only (no per-deal data), so it is safe with respect to
-- the Confidential-tier masking. Doubles as a heartbeat proving cron is alive.
CREATE OR REPLACE FUNCTION public.job_pipeline_health_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _open    integer;
  _stalled integer;
BEGIN
  SELECT count(*) INTO _open
    FROM public.opportunities
   WHERE stage NOT IN ('closed_won', 'closed_lost');

  SELECT count(*) INTO _stalled
    FROM public.opportunities
   WHERE stage NOT IN ('closed_won', 'closed_lost')
     AND updated_at < now() - interval '14 days';

  INSERT INTO public.cron_job_runs (job_name, status, detail)
  VALUES ('pipeline_health_snapshot', 'ok',
          jsonb_build_object('open_deals', _open, 'stalled_deals', _stalled));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.cron_job_runs (job_name, status, detail)
  VALUES ('pipeline_health_snapshot', 'error', jsonb_build_object('error', SQLERRM));
END;
$$;

-- Nightly at 02:00 UTC. cron.schedule upserts by job name → idempotent.
SELECT cron.schedule(
  'pipeline-health-snapshot',
  '0 2 * * *',
  $$ SELECT public.job_pipeline_health_snapshot(); $$
);
