-- supabase/migrations/20260703390000_email_transport.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (holds email credentials).
--
-- Admin-configurable email transport. Replaces the hardcoded Resend env config
-- with an admin-panel setting: pick SMTP (host/port/user/pass) or Resend
-- (API key). Unlike the existing email_settings table (which is SELECT read-all
-- and must NEVER hold secrets), this table's SELECT is ADMIN-ONLY so the
-- SMTP password / API key never leak to non-admins. The server reads it via the
-- service-role client (bypasses RLS) to actually send.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.email_transport (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text        NOT NULL DEFAULT 'resend' CHECK (provider IN ('smtp', 'resend')),
  from_name     text,
  from_address  text,
  -- SMTP
  smtp_host     text,
  smtp_port     int,
  smtp_secure   boolean     NOT NULL DEFAULT true,
  smtp_username text,
  smtp_password text,        -- SECRET — write-only in the UI, admin-only + service-role read
  -- Resend
  resend_api_key text,       -- SECRET
  resend_domain text,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid,
  updated_by    uuid
);

COMMENT ON TABLE public.email_transport IS
  'Admin-configurable email transport (SMTP or Resend). Holds credentials — '
  'SELECT is admin-only so secrets never leak; the server reads via service role.';

DROP TRIGGER IF EXISTS email_transport_timestamps ON public.email_transport;
CREATE TRIGGER email_transport_timestamps
  BEFORE UPDATE ON public.email_transport
  FOR EACH ROW EXECUTE FUNCTION public.set_integration_config_timestamps();

SELECT audit.attach_trigger('public.email_transport');

-- ── RLS: admin-only (NOT read-all) so the credentials never leak ─────────────
ALTER TABLE public.email_transport ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_transport_select_admin" ON public.email_transport;
CREATE POLICY "email_transport_select_admin"
  ON public.email_transport FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_transport_insert_admin" ON public.email_transport;
CREATE POLICY "email_transport_insert_admin"
  ON public.email_transport FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_transport_update_admin" ON public.email_transport;
CREATE POLICY "email_transport_update_admin"
  ON public.email_transport FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_transport_delete_admin" ON public.email_transport;
CREATE POLICY "email_transport_delete_admin"
  ON public.email_transport FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_transport_service_role" ON public.email_transport;
CREATE POLICY "email_transport_service_role"
  ON public.email_transport TO service_role
  USING (true) WITH CHECK (true);
