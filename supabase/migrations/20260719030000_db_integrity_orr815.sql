-- supabase/migrations/20260719030000_db_integrity_orr815.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (touches visibility recompute, financial
-- rollup, and referential integrity across core tables).
--
-- ORR-815 (Major) — DB integrity cluster. Seven independent correctness fixes,
-- all additive / idempotent:
--
--   (a) business_units.manager_user_id change never recomputed visibility.
--   (b) Line-item direct DML desynced opportunities.amount from the rollup.
--   (c) users.manager_user_id had no cycle / self-manager guard.
--   (d) opportunity_splits could never be cleared once set (sum must == 100).
--   (e) Missing FKs: opportunity_stage_history.{opportunity_id,created_by},
--       opportunities.primary_contact_id; approval_instances dual-identity.
--   (f) tasks record-link FKs CASCADE-deleted the assignee's work item.
--   (g) users.updated_at unmaintained; probability_pct had no DB CHECK.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- (a) business_units.manager_user_id → recompute affected opportunities' visibility
--     Mirrors trg_user_manager_visibility_stmt (20260716040000). Visibility branch
--     5 (split_unit_manager) derives from bu.manager_user_id, so when a unit's
--     manager changes, every opportunity SPLIT INTO that unit must be recomputed.
--     Statement-level with transition tables so one re-org fires one set-based pass.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_bu_manager_visibility_stmt()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(DISTINCT os.opportunity_id)
       FROM public.opportunity_splits os
       JOIN (
         SELECT n.id
           FROM new_rows n
           JOIN old_rows o ON o.id = n.id
          WHERE o.manager_user_id IS DISTINCT FROM n.manager_user_id
       ) changed_bu ON changed_bu.id = os.sales_unit_id)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS business_units_manager_visibility_trigger ON public.business_units;
CREATE TRIGGER business_units_manager_visibility_trigger
  AFTER UPDATE ON public.business_units
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_bu_manager_visibility_stmt();

-- ═══════════════════════════════════════════════════════════════════════════════
-- (b) Line-item amount rollup safety net for DIRECT DML.
--     The two SECURITY DEFINER RPCs (replace_opportunity_line_items,
--     set_opportunity_line_items_pricing) already recompute opportunities.amount.
--     But the RLS policies (20260715080000) also permit direct PostgREST
--     INSERT/UPDATE/DELETE on opportunity_line_items by any visibility holder,
--     which bypasses the recompute and silently desyncs the stored amount.
--
--     Chosen fix = statement-level table trigger (NOT revoking the direct-DML
--     policies). Rationale: revoking DML risks breaking any client that writes
--     lines directly; a trigger is a pure safety net that preserves the existing
--     access model and is idempotent with the RPC path (recompute is a no-op when
--     nothing relevant changed / override is on / zero lines remain — it never
--     clobbers a manual amount). Separate ins/del/upd functions (transition tables)
--     mirror the visibility-trigger house pattern.
-- ═══════════════════════════════════════════════════════════════════════════════

-- INSERT: recompute every opportunity touched by the new rows.
CREATE OR REPLACE FUNCTION public.trg_line_items_rollup_ins()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT DISTINCT opportunity_id FROM new_rows LOOP
    PERFORM public.recompute_opportunity_amount_from_line_items(_id);
  END LOOP;
  RETURN NULL;
END;
$$;

-- DELETE: recompute every opportunity the removed rows belonged to.
CREATE OR REPLACE FUNCTION public.trg_line_items_rollup_del()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  FOR _id IN SELECT DISTINCT opportunity_id FROM old_rows LOOP
    PERFORM public.recompute_opportunity_amount_from_line_items(_id);
  END LOOP;
  RETURN NULL;
END;
$$;

-- UPDATE: recompute both the old and new opportunity (the FK could move).
CREATE OR REPLACE FUNCTION public.trg_line_items_rollup_upd()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  FOR _id IN
    SELECT opportunity_id FROM old_rows
    UNION
    SELECT opportunity_id FROM new_rows
  LOOP
    PERFORM public.recompute_opportunity_amount_from_line_items(_id);
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_line_items_rollup_insert ON public.opportunity_line_items;
CREATE TRIGGER opportunity_line_items_rollup_insert
  AFTER INSERT ON public.opportunity_line_items
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_line_items_rollup_ins();

DROP TRIGGER IF EXISTS opportunity_line_items_rollup_delete ON public.opportunity_line_items;
CREATE TRIGGER opportunity_line_items_rollup_delete
  AFTER DELETE ON public.opportunity_line_items
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_line_items_rollup_del();

DROP TRIGGER IF EXISTS opportunity_line_items_rollup_update ON public.opportunity_line_items;
CREATE TRIGGER opportunity_line_items_rollup_update
  AFTER UPDATE ON public.opportunity_line_items
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_line_items_rollup_upd();

-- ═══════════════════════════════════════════════════════════════════════════════
-- (c) Manager-chain cycle guard on public.users.
--     Rejects a self-manager and any ancestor cycle BEFORE the row is written, so
--     the AFTER-statement visibility recompute (and every recursive CTE: mgr_chain,
--     subtree, team_member_ids) can never see a cyclic graph. The recursive walk
--     uses UNION (dedup) so it terminates even if a malformed cycle already exists.
--     This is the standing guard against a UNION→UNION ALL regression that would
--     otherwise hang every opportunity write in an infinite recursive CTE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER so the ancestor walk sees the full users graph regardless of
-- the invoker's RLS (a hidden ancestor must not blind the cycle check), matching
-- prevent_role_escalation.
CREATE OR REPLACE FUNCTION public.check_user_manager_cycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.manager_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.manager_user_id = NEW.id THEN
    RAISE EXCEPTION 'user % cannot be their own manager', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Walk up from the proposed manager; if we reach NEW.id, the edge closes a loop.
  IF EXISTS (
    WITH RECURSIVE chain(id) AS (
      SELECT NEW.manager_user_id
      UNION
      SELECT u.manager_user_id
        FROM public.users u
        JOIN chain c ON u.id = c.id
       WHERE u.manager_user_id IS NOT NULL
    )
    SELECT 1 FROM chain WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'manager assignment for user % would create a manager-chain cycle', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_user_manager_cycle_trigger ON public.users;
CREATE TRIGGER check_user_manager_cycle_trigger
  BEFORE INSERT OR UPDATE OF manager_user_id ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.check_user_manager_cycle();

-- ═══════════════════════════════════════════════════════════════════════════════
-- (d) Allow opportunity_splits to be fully cleared (replace with []).
--     The deferred sum trigger (20260705020000) required exactly 100, so an empty
--     replace aborted at commit (sum drops to 0). Zero splits is a legitimate state
--     (it is allowed at create time — no rows, trigger never fires). Tolerate a
--     fully-cleared set: accept 0 as well as 100. Any other partial sum still fails.
--     Same function, so the existing DEFERRABLE constraint trigger keeps firing.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_opportunity_splits_sum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total numeric(5,2);
  _opp_id uuid;
BEGIN
  _opp_id := COALESCE(NEW.opportunity_id, OLD.opportunity_id);

  IF NOT EXISTS (SELECT 1 FROM public.opportunities WHERE id = _opp_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(pct), 0) INTO _total
    FROM public.opportunity_splits
   WHERE opportunity_id = _opp_id;

  -- 0 = fully cleared (splits removed), 100 = valid split set. Anything else is a
  -- partial/invalid set.
  IF _total <> 100 AND _total <> 0 THEN
    RAISE EXCEPTION 'Opportunity splits must sum to exactly 100 (current: %)', _total;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (e) Missing / mis-wired foreign keys.
--     Each ADD is guarded against pre-existing orphan rows (a FK add fails if any
--     referencing value has no parent). CI runs on an empty DB, but production
--     (self-host) may carry orphans from before these FKs existed, so we reconcile
--     first, then add. Constraint names use the PostgREST-conventional
--     <table>_<column>_fkey so a later CREATE-embed resolves the relationship.
-- ═══════════════════════════════════════════════════════════════════════════════

-- opportunity_stage_history.opportunity_id → opportunities(id) ON DELETE CASCADE.
-- History belongs to the deal; a hard-deleted deal takes its history with it.
DELETE FROM public.opportunity_stage_history h
 WHERE NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = h.opportunity_id);

ALTER TABLE public.opportunity_stage_history
  DROP CONSTRAINT IF EXISTS opportunity_stage_history_opportunity_id_fkey;
ALTER TABLE public.opportunity_stage_history
  ADD CONSTRAINT opportunity_stage_history_opportunity_id_fkey
  FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

-- opportunity_stage_history.created_by → users(id) ON DELETE SET NULL.
-- The author is an attribution pointer; a deleted user just nulls it (column is
-- nullable), preserving the history row.
UPDATE public.opportunity_stage_history h
   SET created_by = NULL
 WHERE h.created_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = h.created_by);

ALTER TABLE public.opportunity_stage_history
  DROP CONSTRAINT IF EXISTS opportunity_stage_history_created_by_fkey;
ALTER TABLE public.opportunity_stage_history
  ADD CONSTRAINT opportunity_stage_history_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- opportunities.primary_contact_id → contacts(id) ON DELETE SET NULL.
-- A hard-deleted contact nulls the pointer rather than leaving a dangling id.
UPDATE public.opportunities o
   SET primary_contact_id = NULL
 WHERE o.primary_contact_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = o.primary_contact_id);

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_primary_contact_id_fkey;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_primary_contact_id_fkey
  FOREIGN KEY (primary_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- approval_instances dual identity. The app looks approvals up by the polymorphic,
-- un-FK'd (entity_type, entity_id) pair; the FK'd opportunity_id column (added in
-- 20260704000000) previously SET NULL on deal delete, leaving a dangling pending
-- instance nobody could cancel. entity_id CANNOT be FK'd (polymorphic + NOT NULL),
-- and repointing the app to opportunity_id is unsafe (that column was never
-- backfilled, so pre-existing instances have it NULL and would vanish from the
-- app's lookups). Safe, non-breaking reconciliation: make the FK'd opportunity_id
-- CASCADE, so a hard-deleted deal removes its approval instance (and its
-- approval_steps / approval_decisions, both already ON DELETE CASCADE) — no
-- dangling instance remains, and the app keeps querying entity_id unchanged.
ALTER TABLE public.approval_instances
  DROP CONSTRAINT IF EXISTS approval_instances_opportunity_id_fkey;
ALTER TABLE public.approval_instances
  ADD CONSTRAINT approval_instances_opportunity_id_fkey
  FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (f) tasks record-link FKs: CASCADE → SET NULL.
--     A task is the assignee's own work item (per 20260715110000's own rationale
--     and the activities SET NULL policy). Deleting the linked deal/account/contact
--     must NOT destroy the task — just unlink it. assignee_user_id and created_by
--     stay ON DELETE CASCADE (deleting the user is deleting the work item's owner).
--     The three link columns are already nullable.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_opportunity_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_opportunity_id_fkey
  FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_account_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_contact_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (g) Misc constraint / maintenance gaps.
-- ═══════════════════════════════════════════════════════════════════════════════

-- users.updated_at maintenance (there was no BEFORE UPDATE trigger for it).
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_users_updated_at_trigger ON public.users;
CREATE TRIGGER set_users_updated_at_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();

-- opportunities.probability_pct 0..100 CHECK (numeric(5,2) otherwise accepts
-- 999.99 via direct PostgREST; zod only guards the app path). Clamp any existing
-- out-of-range value first so the ADD cannot fail on legacy data.
UPDATE public.opportunities
   SET probability_pct = LEAST(100, GREATEST(0, probability_pct))
 WHERE probability_pct < 0 OR probability_pct > 100;

ALTER TABLE public.opportunities
  DROP CONSTRAINT IF EXISTS opportunities_probability_pct_range;
ALTER TABLE public.opportunities
  ADD CONSTRAINT opportunities_probability_pct_range
  CHECK (probability_pct >= 0 AND probability_pct <= 100);
