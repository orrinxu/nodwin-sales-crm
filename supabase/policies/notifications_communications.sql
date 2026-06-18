-- supabase/policies/notifications_communications.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for public.notification_routing, public.user_notification_overrides,
-- public.email_templates, and public.user_notifications.
-- Embedded in 20260619000000_notifications_communications.sql for self-contained
-- migrations; this file exists for security-review readability.
--
-- (ORR-507-db / ORR-524)

-- ── notification_routing ──────────────────────────────────────────────────────
ALTER TABLE public.notification_routing ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the org-level routing matrix.
DROP POLICY IF EXISTS "notification_routing_select_authenticated" ON public.notification_routing;
CREATE POLICY "notification_routing_select_authenticated"
  ON public.notification_routing
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify the routing matrix.
DROP POLICY IF EXISTS "notification_routing_insert_admin" ON public.notification_routing;
CREATE POLICY "notification_routing_insert_admin"
  ON public.notification_routing
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "notification_routing_update_admin" ON public.notification_routing;
CREATE POLICY "notification_routing_update_admin"
  ON public.notification_routing
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "notification_routing_delete_admin" ON public.notification_routing;
CREATE POLICY "notification_routing_delete_admin"
  ON public.notification_routing
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── user_notification_overrides ───────────────────────────────────────────────
ALTER TABLE public.user_notification_overrides ENABLE ROW LEVEL SECURITY;

-- Users can read their own overrides; admins can read all.
DROP POLICY IF EXISTS "user_notification_overrides_select_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_select_own_or_admin"
  ON public.user_notification_overrides
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Users can create overrides for themselves; admins can create for anyone.
DROP POLICY IF EXISTS "user_notification_overrides_insert_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_insert_own_or_admin"
  ON public.user_notification_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Users can update their own overrides; admins can update any.
DROP POLICY IF EXISTS "user_notification_overrides_update_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_update_own_or_admin"
  ON public.user_notification_overrides
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Users can delete their own overrides; admins can delete any.
DROP POLICY IF EXISTS "user_notification_overrides_delete_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_delete_own_or_admin"
  ON public.user_notification_overrides
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- ── email_templates ───────────────────────────────────────────────────────────
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read templates (used client-side for previews).
DROP POLICY IF EXISTS "email_templates_select_authenticated" ON public.email_templates;
CREATE POLICY "email_templates_select_authenticated"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify templates.
DROP POLICY IF EXISTS "email_templates_insert_admin" ON public.email_templates;
CREATE POLICY "email_templates_insert_admin"
  ON public.email_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_templates_update_admin" ON public.email_templates;
CREATE POLICY "email_templates_update_admin"
  ON public.email_templates
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_templates_delete_admin" ON public.email_templates;
CREATE POLICY "email_templates_delete_admin"
  ON public.email_templates
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── user_notifications ────────────────────────────────────────────────────────
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications; admins can read all.
DROP POLICY IF EXISTS "user_notifications_select_own_or_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_select_own_or_admin"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Only admins can insert notifications (backend uses service_role).
DROP POLICY IF EXISTS "user_notifications_insert_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_insert_admin"
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Users can update their own notifications (mark as read); admins can update any.
DROP POLICY IF EXISTS "user_notifications_update_own_or_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_update_own_or_admin"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- Only admins can delete notifications.
DROP POLICY IF EXISTS "user_notifications_delete_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_delete_admin"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Service role has unrestricted access for backend push.
DROP POLICY IF EXISTS "user_notifications_service_role" ON public.user_notifications;
CREATE POLICY "user_notifications_service_role"
  ON public.user_notifications
  TO service_role
  USING (true)
  WITH CHECK (true);
