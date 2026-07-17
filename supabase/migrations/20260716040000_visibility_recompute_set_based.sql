-- supabase/migrations/20260716040000_visibility_recompute_set_based.sql
-- HIGH-RISK FILE — see AGENTS.md §6.  SECURITY-CRITICAL (RLS visibility).
--
-- ORR-758 (perf audit). recompute_visibility_for_opportunity fired FOR EACH ROW
-- on opportunities / opportunity_team_members / opportunity_splits and did a full
-- DELETE + recursive-UNION rebuild PER ROW; recompute_visibility_for_user(_subtree)
-- looped per user × per opportunity. A bulk import (Salesforce/CSV) or a manager
-- re-org therefore fired a complete recursive rebuild for every affected row.
--
-- This makes the recompute SET-BASED and the triggers STATEMENT-LEVEL (transition
-- tables), so one multi-row statement does ONE set-based rebuild. **The produced
-- opportunity_visibility (opportunity_id, user_id, reason) tuples are identical**
-- — this is a pure perf change:
--   * the 5 visibility branches are the same, just keyed by a set of opp ids;
--   * the manager-chain recursion carries opportunity_id so each opp's chain is
--     walked independently (same reachable managers). The recursive term uses
--     UNION (not UNION ALL) — same reachable set, and now cycle-safe rather than
--     looping forever on a (malformed) cyclic manager chain;
--   * owner_user_id is NOT NULL, so the old "skip opps with a null owner" early
--     return can never apply — the set-based DELETE+INSERT is equivalent.
-- Helpers stay `plpgsql SECURITY DEFINER`; the recompute is set-based SQL inside.
--
-- Idempotent: safe to re-run.

-- ── Set-based core: recompute a SET of opportunities in one pass ──────────────
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_opportunities(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _ids IS NULL OR cardinality(_ids) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM public.opportunity_visibility
   WHERE opportunity_id = ANY(_ids);

  INSERT INTO public.opportunity_visibility (opportunity_id, user_id, reason)
  WITH RECURSIVE mgr_chain AS (
    -- Anchor: owner's manager + every team member's manager, per standard-tier opp.
    SELECT o.id AS opportunity_id, u.manager_user_id AS manager_user_id
      FROM public.opportunities o
      JOIN public.users u ON u.id = o.owner_user_id
     WHERE o.id = ANY(_ids)
       AND o.visibility_tier = 'standard'
       AND u.manager_user_id IS NOT NULL
    UNION
    SELECT o.id, u.manager_user_id
      FROM public.opportunities o
      JOIN public.opportunity_team_members tm ON tm.opportunity_id = o.id
      JOIN public.users u ON u.id = tm.user_id
     WHERE o.id = ANY(_ids)
       AND o.visibility_tier = 'standard'
       AND u.manager_user_id IS NOT NULL
    UNION
    -- Recursive: walk up the chain, carrying the opportunity it belongs to.
    SELECT mc.opportunity_id, u.manager_user_id
      FROM public.users u
      JOIN mgr_chain mc ON u.id = mc.manager_user_id
     WHERE u.manager_user_id IS NOT NULL
  )
  SELECT opportunity_id, user_id, reason
    FROM (
      -- 1. Owner always sees the deal.
      SELECT o.id AS opportunity_id, o.owner_user_id AS user_id, 'owner'::text AS reason
        FROM public.opportunities o
       WHERE o.id = ANY(_ids) AND o.owner_user_id IS NOT NULL

      UNION

      -- 2. Confidentiality overrides always see the deal.
      SELECT o.id, unnest(o.confidentiality_override_user_ids), 'confidentiality_override'
        FROM public.opportunities o
       WHERE o.id = ANY(_ids)
         AND cardinality(o.confidentiality_override_user_ids) > 0

      UNION

      -- 3. Team members (standard + restricted only).
      SELECT tm.opportunity_id, tm.user_id, 'team:' || tm.role::text
        FROM public.opportunity_team_members tm
        JOIN public.opportunities o ON o.id = tm.opportunity_id
       WHERE tm.opportunity_id = ANY(_ids)
         AND o.visibility_tier IN ('standard', 'restricted')

      UNION

      -- 4. Manager chain (standard tier only).
      SELECT opportunity_id, manager_user_id, 'manager_chain'
        FROM mgr_chain

      UNION

      -- 5. Split-unit managers (standard tier only).
      SELECT os.opportunity_id, bu.manager_user_id, 'split_unit_manager'
        FROM public.opportunity_splits os
        JOIN public.business_units bu ON bu.id = os.sales_unit_id
        JOIN public.opportunities o ON o.id = os.opportunity_id
       WHERE os.opportunity_id = ANY(_ids)
         AND bu.manager_user_id IS NOT NULL
         AND o.visibility_tier = 'standard'
    ) visibility_sources
   WHERE user_id IS NOT NULL;
END;
$$;

-- Backwards-compatible single-opportunity wrapper (kept: other code + the audit
-- surface reference it). Now a thin delegate to the set-based core.
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_opportunity(_opportunity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(ARRAY[_opportunity_id]);
END;
$$;

-- ── Set-based user-subtree recompute ─────────────────────────────────────────
-- The opportunities whose visibility a manager change can affect = every deal
-- TOUCHED (owner / team member / split user / split-unit manager) by any user in
-- the reparented users' recursive report subtrees. Same set the old
-- recompute_visibility_for_user_subtree → recompute_visibility_for_user →
-- recompute_visibility_for_opportunity chain visited, computed once.
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_users_subtrees(_user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _opp_ids uuid[];
BEGIN
  IF _user_ids IS NULL OR cardinality(_user_ids) = 0 THEN
    RETURN;
  END IF;

  WITH RECURSIVE subtree AS (
    SELECT unnest(_user_ids) AS id
    UNION
    SELECT u.id FROM public.users u JOIN subtree s ON u.manager_user_id = s.id
  )
  SELECT array_agg(DISTINCT o.id) INTO _opp_ids
    FROM public.opportunities o
   WHERE o.owner_user_id IN (SELECT id FROM subtree)
      OR EXISTS (
        SELECT 1 FROM public.opportunity_team_members tm
         WHERE tm.opportunity_id = o.id AND tm.user_id IN (SELECT id FROM subtree)
      )
      OR EXISTS (
        SELECT 1 FROM public.opportunity_splits os
         WHERE os.opportunity_id = o.id AND os.user_id IN (SELECT id FROM subtree)
      )
      OR EXISTS (
        SELECT 1 FROM public.opportunity_splits os
          JOIN public.business_units bu ON bu.id = os.sales_unit_id
         WHERE os.opportunity_id = o.id AND bu.manager_user_id IN (SELECT id FROM subtree)
      );

  PERFORM public.recompute_visibility_for_opportunities(_opp_ids);
END;
$$;

-- Backwards-compatible single-user wrappers.
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_user_subtree(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_users_subtrees(ARRAY[_user_id]);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_visibility_for_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _opp_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT o.id) INTO _opp_ids
    FROM public.opportunities o
   WHERE o.owner_user_id = _user_id
      OR EXISTS (SELECT 1 FROM public.opportunity_team_members tm
                  WHERE tm.opportunity_id = o.id AND tm.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.opportunity_splits os
                  WHERE os.opportunity_id = o.id AND os.user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.opportunity_splits os
                   JOIN public.business_units bu ON bu.id = os.sales_unit_id
                  WHERE os.opportunity_id = o.id AND bu.manager_user_id = _user_id);
  PERFORM public.recompute_visibility_for_opportunities(_opp_ids);
END;
$$;

-- ═══ Statement-level trigger functions (transition tables) ═══════════════════

-- opportunities INSERT: recompute every new row.
CREATE OR REPLACE FUNCTION public.trg_opp_visibility_ins()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(id) FROM new_opps)
  );
  RETURN NULL;
END;
$$;

-- opportunities UPDATE: recompute only rows whose visibility-affecting columns
-- (owner / tier / confidentiality override) actually changed. Postgres forbids a
-- transition table on an `UPDATE OF <cols>` trigger, so we fire on any UPDATE and
-- diff OLD vs NEW here — equivalent to the old column-list trigger, and it also
-- skips the wasteful recompute when one of those columns is SET to its own value.
CREATE OR REPLACE FUNCTION public.trg_opp_visibility_upd()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(n.id)
       FROM new_opps n JOIN old_opps o ON o.id = n.id
      WHERE o.owner_user_id IS DISTINCT FROM n.owner_user_id
         OR o.visibility_tier IS DISTINCT FROM n.visibility_tier
         OR o.confidentiality_override_user_ids IS DISTINCT FROM n.confidentiality_override_user_ids)
  );
  RETURN NULL;
END;
$$;

-- opportunity_team_members / opportunity_splits — INSERT (NEW rows' opps).
CREATE OR REPLACE FUNCTION public.trg_child_visibility_ins()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(DISTINCT opportunity_id) FROM new_rows)
  );
  RETURN NULL;
END;
$$;

-- ... DELETE (OLD rows' opps).
CREATE OR REPLACE FUNCTION public.trg_child_visibility_del()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(DISTINCT opportunity_id) FROM old_rows)
  );
  RETURN NULL;
END;
$$;

-- ... UPDATE (both OLD and NEW opps — the FK could move, though it rarely does).
CREATE OR REPLACE FUNCTION public.trg_child_visibility_upd()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_opportunities(
    (SELECT array_agg(DISTINCT opportunity_id)
       FROM (SELECT opportunity_id FROM old_rows
             UNION
             SELECT opportunity_id FROM new_rows) u)
  );
  RETURN NULL;
END;
$$;

-- users UPDATE OF manager_user_id: recompute the subtrees of every reparented user.
CREATE OR REPLACE FUNCTION public.trg_user_manager_visibility_stmt()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.recompute_visibility_for_users_subtrees(
    (SELECT array_agg(n.id)
       FROM new_rows n
       JOIN old_rows o ON o.id = n.id
      WHERE o.manager_user_id IS DISTINCT FROM n.manager_user_id)
  );
  RETURN NULL;
END;
$$;

-- ═══ Swap row-level triggers for statement-level ═════════════════════════════

DROP TRIGGER IF EXISTS opportunity_visibility_trigger ON public.opportunities;
CREATE TRIGGER opportunity_visibility_insert_trigger
  AFTER INSERT ON public.opportunities
  REFERENCING NEW TABLE AS new_opps
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_opp_visibility_ins();
CREATE TRIGGER opportunity_visibility_update_trigger
  AFTER UPDATE ON public.opportunities
  REFERENCING OLD TABLE AS old_opps NEW TABLE AS new_opps
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_opp_visibility_upd();

DROP TRIGGER IF EXISTS opportunity_team_visibility_trigger ON public.opportunity_team_members;
CREATE TRIGGER opportunity_team_visibility_insert_trigger
  AFTER INSERT ON public.opportunity_team_members
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_ins();
CREATE TRIGGER opportunity_team_visibility_delete_trigger
  AFTER DELETE ON public.opportunity_team_members
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_del();
CREATE TRIGGER opportunity_team_visibility_update_trigger
  AFTER UPDATE ON public.opportunity_team_members
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_upd();

DROP TRIGGER IF EXISTS opportunity_splits_visibility_trigger ON public.opportunity_splits;
CREATE TRIGGER opportunity_splits_visibility_insert_trigger
  AFTER INSERT ON public.opportunity_splits
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_ins();
CREATE TRIGGER opportunity_splits_visibility_delete_trigger
  AFTER DELETE ON public.opportunity_splits
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_del();
CREATE TRIGGER opportunity_splits_visibility_update_trigger
  AFTER UPDATE ON public.opportunity_splits
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_child_visibility_upd();

-- No `UPDATE OF manager_user_id` column list — Postgres forbids it alongside a
-- transition table, so we fire on any user UPDATE and the function recomputes only
-- rows whose manager_user_id actually changed (see the IS DISTINCT FROM filter).
DROP TRIGGER IF EXISTS user_manager_visibility_trigger ON public.users;
CREATE TRIGGER user_manager_visibility_trigger
  AFTER UPDATE ON public.users
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.trg_user_manager_visibility_stmt();
