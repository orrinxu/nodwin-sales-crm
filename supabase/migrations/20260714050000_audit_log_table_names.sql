-- ORR-700 — distinct audited table names for the audit-log viewer filter.
--
-- SECURITY INVOKER (default) so the audit_log RLS (admin-only SELECT) still gates
-- it — a non-admin gets an empty list. Server-side DISTINCT avoids the PostgREST
-- max_rows client-reduce truncation trap (see the stuck-deals precedent).
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.audit_log_table_names()
RETURNS TABLE (table_name text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT a.table_name
  FROM public.audit_log a
  ORDER BY a.table_name
$$;

COMMENT ON FUNCTION public.audit_log_table_names() IS
  'ORR-700: distinct table names present in audit_log, for the viewer filter. '
  'SECURITY INVOKER — audit_log RLS (admin-only) applies, so non-admins get none.';

REVOKE ALL ON FUNCTION public.audit_log_table_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_log_table_names() TO authenticated, service_role;
