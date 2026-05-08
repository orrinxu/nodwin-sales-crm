-- supabase/migrations/20260506000003_admin_alerts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the admin_alerts table for in-app admin notifications (ORR-289 /
-- T-010b). Replaces console.error / TODO placeholders with a durable
-- notification that the frontend can surface in the admin dashboard.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- admin_alerts
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  message          text NOT NULL,
  type             text NOT NULL DEFAULT 'info',
  metadata         jsonb NOT NULL DEFAULT '{}',
  acknowledged_at  timestamptz,
  created_by       uuid NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_alerts IS
  'In-app notifications surfaced on the admin dashboard. Written by backend '
  'services (service_role), read/acknowledged by admin users (authenticated).';

COMMENT ON COLUMN public.admin_alerts.type IS
  'Categorisation: info, warning, error, deadletter, etc.';

COMMENT ON COLUMN public.admin_alerts.metadata IS
  'Arbitrary payload, e.g. { deadletterId, reason, fromAddress }';

COMMENT ON COLUMN public.admin_alerts.acknowledged_at IS
  'Set when an admin dismisses / reads the alert. NULL = unread.';

CREATE INDEX IF NOT EXISTS idx_admin_alerts_acknowledged_at
  ON public.admin_alerts(acknowledged_at)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_alerts_type
  ON public.admin_alerts(type);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_created_at
  ON public.admin_alerts(created_at);

SELECT audit.attach_trigger('public.admin_alerts');

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_alerts_select_all_authenticated" ON public.admin_alerts;
CREATE POLICY "admin_alerts_select_all_authenticated"
  ON public.admin_alerts
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_insert_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_insert_admin"
  ON public.admin_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_update_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_update_admin"
  ON public.admin_alerts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_delete_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_delete_admin"
  ON public.admin_alerts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
