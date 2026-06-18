-- supabase/migrations/00024_security_compliance.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Security & Compliance admin support (ORR-510)
-- Exposes auth.sessions for admin viewing and revocation.
-- Admin gating enforced in Next.js server actions via requireAdmin();
-- DB-level check omitted to keep RPC surface simple, but any caller
-- with the postgres role can execute these — gate in application layer
-- MUST NOT be removed without adding DB-level authorization.

-- ── admin_list_sessions: list active sessions joined with users ─────────────────

CREATE OR REPLACE FUNCTION public.admin_list_sessions()
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.user_id,
    u.email,
    u.full_name,
    s.created_at,
    s.updated_at
  FROM auth.sessions s
  LEFT JOIN public.users u ON u.id = s.user_id
  ORDER BY s.created_at DESC;
END;
$$;

-- ── admin_revoke_user_sessions: delete all sessions for a user ──────────────────

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = target_user_id;
END;
$$;
