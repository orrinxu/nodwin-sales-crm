-- supabase/migrations/20260619000005_rbac_domain_check_function.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RBAC hardening (ORR-600, batch item #2).
--
-- The OAuth callback (app/api/auth/callback/route.ts) previously hard-coded the
-- allow-listed email domains, so it could silently diverge from the DB table
-- auth_allowed_domains that the sign-up Edge hook uses — a domain added by an
-- admin would pass the hook but still be rejected by the callback. But
-- auth_allowed_domains has service_role-only RLS, so the anon/authenticated
-- client in the callback cannot read it directly.
--
-- Expose a single SECURITY DEFINER predicate the callback can call, so both the
-- Edge hook and the callback consult the same source of truth.

CREATE OR REPLACE FUNCTION public.is_email_domain_allowed(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Domain = the part after a single '@'. The anchored pattern requires exactly
  -- one '@' (a non-empty local part and a non-empty domain, neither containing
  -- '@'), so malformed or multi-'@' addresses yield NULL → no match → rejected.
  SELECT EXISTS (
    SELECT 1
    FROM public.auth_allowed_domains
    WHERE lower(domain) = lower(substring(_email FROM '^[^@]+@([^@]+)$'))
  );
$$;

COMMENT ON FUNCTION public.is_email_domain_allowed(text) IS
  'Returns true if the email address''s domain is in auth_allowed_domains. SECURITY DEFINER so anon/authenticated callers (OAuth callback) can consult the service_role-only table.';

REVOKE ALL ON FUNCTION public.is_email_domain_allowed(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_email_domain_allowed(text) TO anon, authenticated;
