-- ORR-797: Backfill close_date for already-closed deals that never got one.
--
-- Before this ticket, moving a deal to closed_won/closed_lost (kanban drag,
-- stage-only update, or bulk update) wrote only { stage } and never set
-- close_date. Every "won"/"lost" rollup — forecast_pipeline_agg,
-- rep_scorecard_agg, and getMyTargetProgress — filters by close_date, so those
-- deals silently dropped out of committed revenue, scorecards, and quota
-- attainment. The application paths are fixed going forward; this migration
-- repairs the existing rows.
--
-- Best available proxy for the real close date, in priority order:
--   1. created_at of the most recent opportunity_stage_history entry that
--      transitioned INTO a closed stage (to_stage IN closed_won/closed_lost).
--   2. Fallback: the opportunity's own updated_at::date, for deals whose close
--      predates stage-history tracking (or whose history is missing).
--
-- Idempotent + guarded: only touches rows that are in a closed stage AND still
-- have a NULL close_date, so re-running is a no-op once every row is populated.

UPDATE public.opportunities o
SET close_date = COALESCE(
  (
    SELECT h.created_at::date
    FROM public.opportunity_stage_history h
    WHERE h.opportunity_id = o.id
      AND h.to_stage IN ('closed_won', 'closed_lost')
    ORDER BY h.created_at DESC
    LIMIT 1
  ),
  o.updated_at::date
)
WHERE o.close_date IS NULL
  AND o.stage IN ('closed_won', 'closed_lost');
