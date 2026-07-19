-- ORR-809 (h): allow a `partial` import-job status.
--
-- A CSV import where some rows succeed and others fail was previously recorded as
-- a plain "completed" — hiding the failure from the jobs list. The importer now
-- writes `partial` for a mixed run (and keeps `failed` when nothing was created).
-- Widen the status CHECK constraint to admit the new value.

ALTER TABLE public.import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_status_check;

ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed'));
