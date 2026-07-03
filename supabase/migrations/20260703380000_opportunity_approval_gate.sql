-- supabase/migrations/20260703380000_opportunity_approval_gate.sql
-- ORR-604 Phase 3c: mandatory approval gate for closing opportunities.
--
-- Business rule (Orrin): EVERY opportunity must have an approved approval before
-- it can be moved to Closed Won. Enforced in the opportunity update data layer
-- (the app's close path) via this helper, which bypasses RLS so the check is
-- correct regardless of whether the closer is the approval's triggerer/approver.
--
-- Idempotent: safe to re-run.

CREATE OR REPLACE FUNCTION public.opportunity_has_approved_approval(_opportunity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_instances
    WHERE entity_type = 'opportunity'
      AND entity_id = _opportunity_id
      AND status = 'approved'
  );
$$;
REVOKE ALL ON FUNCTION public.opportunity_has_approved_approval(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.opportunity_has_approved_approval(uuid) TO authenticated;
