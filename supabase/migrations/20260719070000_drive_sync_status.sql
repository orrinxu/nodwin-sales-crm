-- supabase/migrations/20260719070000_drive_sync_status.sql
-- HIGH-RISK FILE — see AGENTS.md §6.  SECURITY-RELEVANT (Drive access grants).
--
-- ORR-810 Drive-sync fix cluster.
--
-- (a) DRAIN STARVATION. The Drive folder drain
--     (lib/integrations/drive/sync.ts:syncPendingOpportunityFolders) selected
--     `drive_folder_id IS NULL` with no ORDER BY and no skip-marker, so
--     opportunities that permanently `skipped` (no selling entity, or the entity
--     has no opportunities_parent_folder_id configured) kept `drive_folder_id`
--     NULL and re-occupied the heap-order head of the queue every cron run —
--     starving newly-created, fully-configured deals. This adds a
--     `drive_sync_status` skip-marker (+ `drive_sync_next_attempt_at` backoff) so
--     permanently-skipped rows LEAVE the hot path, and reset triggers so they
--     RE-ENTER it only when the relevant config actually changes.
--
-- (b) STALE PERMISSION GRANTS (security). The drain was the ONLY caller of
--     syncOpportunityDriveFolder / client.syncPermissions, and it only picked
--     folder-LESS rows. Once a folder existed, no owner / tier / region / team
--     change (all of which rewrite `opportunity_visibility`) ever re-ran
--     syncPermissions, so revoked collaborators kept Drive reader access to the
--     folder and its documents indefinitely. This reuses `drive_sync_status =
--     'stale'` as a targeted re-reconcile queue: a statement-level trigger on
--     `opportunity_visibility` marks every affected FOLDER-HAVING opportunity
--     stale, and the drain re-runs syncPermissions (which revokes correctly) for
--     stale rows.
--
-- drive_sync_status state machine (governs the drain's two work queues):
--   NULL      — needs a folder (initial state, or reset after a config change).
--   'failed'  — transient error creating the folder; retried after
--               drive_sync_next_attempt_at (backoff). Still folder-less.
--   'skipped' — no selling entity / no parent-folder config. OUT of the hot path
--               until a config change resets it to NULL. Still folder-less.
--   'synced'  — folder created + permissions reconciled; up to date.
--   'stale'   — has a folder, but the visibility set changed; needs a permission
--               re-reconcile. Reset to 'synced' once the drain re-runs.
--
-- Idempotent: safe to re-run.

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS drive_sync_status text,
  ADD COLUMN IF NOT EXISTS drive_sync_next_attempt_at timestamptz;

COMMENT ON COLUMN public.opportunities.drive_sync_status IS
  'Drive folder/permission sync state: NULL=needs folder, failed=retry after '
  'next_attempt_at, skipped=missing config (out of hot path until config change), '
  'synced=up to date, stale=folder exists but visibility changed (needs permission re-reconcile). ORR-810.';
COMMENT ON COLUMN public.opportunities.drive_sync_next_attempt_at IS
  'Earliest time the Drive drain may retry this row; set on transient failure for backoff. ORR-810.';

-- ── Drain hot-path indexes (partial, so they stay tiny) ──────────────────────
-- Folder-creation queue: folder-less rows that are not permanently skipped.
CREATE INDEX IF NOT EXISTS idx_opportunities_drive_sync_pending
  ON public.opportunities (created_at)
  WHERE drive_folder_id IS NULL AND drive_sync_status IS DISTINCT FROM 'skipped';

-- Permission re-reconcile queue: folder-having rows flagged stale.
CREATE INDEX IF NOT EXISTS idx_opportunities_drive_sync_stale
  ON public.opportunities (drive_sync_next_attempt_at)
  WHERE drive_sync_status = 'stale';

-- ═══ (a) Skip-marker reset — retry ONLY on config change ═════════════════════

-- Reset 1: an opportunity's selling entity is (re)assigned. A row skipped for
-- "no selling entity set" can now be synced, so clear the skip-marker in-row.
CREATE OR REPLACE FUNCTION public.trg_opp_drive_sync_reset_on_entity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.entity_sales_id IS DISTINCT FROM OLD.entity_sales_id
     AND NEW.drive_folder_id IS NULL
     AND NEW.drive_sync_status = 'skipped' THEN
    NEW.drive_sync_status := NULL;
    NEW.drive_sync_next_attempt_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_drive_sync_reset_trigger ON public.opportunities;
CREATE TRIGGER opportunity_drive_sync_reset_trigger
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_opp_drive_sync_reset_on_entity();

-- Reset 2: an entity's Drive config is created/updated (e.g. an admin finally
-- sets opportunities_parent_folder_id). Re-queue every folder-less, skipped
-- opportunity of that entity by clearing its skip-marker.
CREATE OR REPLACE FUNCTION public.trg_drive_config_reset_skipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opportunities
     SET drive_sync_status = NULL,
         drive_sync_next_attempt_at = NULL
   WHERE entity_sales_id = NEW.entity_id
     AND drive_folder_id IS NULL
     AND drive_sync_status = 'skipped';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS drive_config_reset_skipped_trigger ON public.drive_config;
CREATE TRIGGER drive_config_reset_skipped_trigger
  AFTER INSERT OR UPDATE ON public.drive_config
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_drive_config_reset_skipped();

-- ═══ (b) Re-reconcile queue — mark folder-having opps stale on visibility change ═
--
-- opportunity_visibility is fully DELETEd + re-INSERTed by
-- recompute_visibility_for_opportunities() on every visibility-affecting change
-- (owner / tier / confidentiality override / team members / splits / manager
-- chain). Marking the affected FOLDER-HAVING opportunities 'stale' here — rather
-- than editing that SECURITY-CRITICAL recompute function — decouples the
-- re-reconcile trigger from how the visibility set is produced: any future writer
-- of opportunity_visibility also feeds the queue.
--
-- Only rows with drive_folder_id IS NOT NULL are touched, so this never collides
-- with the (folder-less) skip-marker states, and the `IS DISTINCT FROM 'stale'`
-- guard makes redundant re-marks a no-op. Updating opportunities.drive_sync_status
-- does not change owner/tier/confidentiality or entity_sales_id, so it does not
-- re-fire the visibility recompute or the skip-reset trigger — no recursion.

CREATE OR REPLACE FUNCTION public.trg_drive_perm_mark_stale_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opportunities o
     SET drive_sync_status = 'stale',
         drive_sync_next_attempt_at = NULL
   WHERE o.drive_folder_id IS NOT NULL
     AND o.drive_sync_status IS DISTINCT FROM 'stale'
     AND o.id IN (SELECT DISTINCT opportunity_id FROM new_vis);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_drive_perm_mark_stale_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opportunities o
     SET drive_sync_status = 'stale',
         drive_sync_next_attempt_at = NULL
   WHERE o.drive_folder_id IS NOT NULL
     AND o.drive_sync_status IS DISTINCT FROM 'stale'
     AND o.id IN (SELECT DISTINCT opportunity_id FROM old_vis);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_visibility_drive_stale_ins ON public.opportunity_visibility;
CREATE TRIGGER opportunity_visibility_drive_stale_ins
  AFTER INSERT ON public.opportunity_visibility
  REFERENCING NEW TABLE AS new_vis
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_drive_perm_mark_stale_ins();

DROP TRIGGER IF EXISTS opportunity_visibility_drive_stale_del ON public.opportunity_visibility;
CREATE TRIGGER opportunity_visibility_drive_stale_del
  AFTER DELETE ON public.opportunity_visibility
  REFERENCING OLD TABLE AS old_vis
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_drive_perm_mark_stale_del();
