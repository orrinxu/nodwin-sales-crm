-- supabase/migrations/20260716050000_role_user_counts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-761 (perf audit, low). getRoles ran one `count(*) FROM users WHERE
-- role_id = ?` per role via Promise.all — bounded by #roles (<20) but N
-- round-trips. This single GROUP BY tallies every role's head count in one call.
-- SECURITY INVOKER, so the same users RLS applies as the per-role counts did.
--
-- Idempotent: safe to re-run.
CREATE OR REPLACE FUNCTION public.role_user_counts()
RETURNS TABLE (role_id uuid, user_count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT u.role_id, count(*) AS user_count
  FROM public.users u
  WHERE u.role_id IS NOT NULL
  GROUP BY u.role_id
$$;

COMMENT ON FUNCTION public.role_user_counts() IS
  'Per-role assigned-user head counts in one GROUP BY over RLS-visible users. Replaces the per-role count round-trips in getRoles (ORR-761).';

REVOKE ALL ON FUNCTION public.role_user_counts() FROM public;
GRANT EXECUTE ON FUNCTION public.role_user_counts() TO authenticated;
