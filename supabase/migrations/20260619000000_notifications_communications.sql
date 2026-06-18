-- supabase/migrations/20260619000000_notifications_communications.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the notification & communication schema for the admin Notifications &
-- Communication section (ORR-507-db / ORR-524).
--
-- Tables:
--   1. notification_routing      — org-level event × channel on/off matrix
--   2. user_notification_overrides — per-user opt-in / opt-out
--   3. email_templates           — editable transactional email templates
--   4. user_notifications        — in-app notification inbox
--
-- Also adds comms_tracking_enabled boolean column to public.entities.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 0. Enums
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'notification_event_type'
  ) THEN
    CREATE TYPE public.notification_event_type AS ENUM (
      'stage_change',
      'deal_assigned',
      'approval_requested',
      'mention',
      'deal_won',
      'deal_lost'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'notification_channel'
  ) THEN
    CREATE TYPE public.notification_channel AS ENUM (
      'in_app',
      'email',
      'slack'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. notification_routing — org-level event × channel matrix
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_routing (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  public.notification_event_type  NOT NULL,
  channel     public.notification_channel     NOT NULL,
  enabled     boolean                         NOT NULL DEFAULT true,
  entity_id   uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  created_at  timestamptz                     NOT NULL DEFAULT now(),
  updated_at  timestamptz                     NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  UNIQUE (event_type, channel, entity_id)
);

COMMENT ON TABLE public.notification_routing IS
  'Org-level event × channel routing matrix. Each row enables or disables a '
  'specific notification event type on a given channel. entity_id IS NULL '
  'represents the org-wide default.';

CREATE INDEX IF NOT EXISTS idx_notification_routing_event_type
  ON public.notification_routing(event_type);

CREATE INDEX IF NOT EXISTS idx_notification_routing_channel
  ON public.notification_routing(channel);

CREATE INDEX IF NOT EXISTS idx_notification_routing_enabled
  ON public.notification_routing(enabled)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_notification_routing_entity_id
  ON public.notification_routing(entity_id)
  WHERE entity_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. user_notification_overrides — per-user opt-in / opt-out
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_notification_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  event_type  public.notification_event_type                     NOT NULL,
  channel     public.notification_channel                        NOT NULL,
  enabled     boolean                                            NOT NULL DEFAULT true,
  created_at  timestamptz                                        NOT NULL DEFAULT now(),
  updated_at  timestamptz                                        NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid,
  UNIQUE (user_id, event_type, channel)
);

COMMENT ON TABLE public.user_notification_overrides IS
  'Per-user notification preference overrides. Users can opt in or out of '
  'specific event types on specific channels. Falls back to the org-level '
  'notification_routing table when no override row exists.';

CREATE INDEX IF NOT EXISTS idx_user_notification_overrides_user_id
  ON public.user_notification_overrides(user_id);

CREATE INDEX IF NOT EXISTS idx_user_notification_overrides_event_type
  ON public.user_notification_overrides(user_id, event_type);

CREATE INDEX IF NOT EXISTS idx_user_notification_overrides_enabled
  ON public.user_notification_overrides(user_id, enabled)
  WHERE enabled = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. email_templates — editable transactional email templates
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  subject     text        NOT NULL,
  body_html   text        NOT NULL,
  body_text   text,
  variables   jsonb       NOT NULL DEFAULT '[]',
  active      boolean     NOT NULL DEFAULT true,
  entity_id   uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid
);

COMMENT ON TABLE public.email_templates IS
  'Editable transactional email templates. The variables column stores a JSON '
  'array of placeholder variable names that the template engine replaces at '
  'send time.';

CREATE INDEX IF NOT EXISTS idx_email_templates_name
  ON public.email_templates(name);

CREATE INDEX IF NOT EXISTS idx_email_templates_active
  ON public.email_templates(active)
  WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_name_entity_unique
  ON public.email_templates(name, entity_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. user_notifications — in-app notification inbox
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title        text                                                NOT NULL,
  message      text                                                NOT NULL,
  link_url     text,
  read_at      timestamptz,
  entity_id    uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  metadata     jsonb      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  updated_by   uuid
);

COMMENT ON TABLE public.user_notifications IS
  'In-app notification inbox. Notifications are pushed by backend services '
  '(service_role) and read by the target user. read_at IS NULL = unread. '
  'link_url is an optional deep link to the relevant resource.';

COMMENT ON COLUMN public.user_notifications.link_url IS
  'Optional deep link to the relevant resource, e.g. /opportunities/abc123.';

COMMENT ON COLUMN public.user_notifications.read_at IS
  'Set when the user views / dismisses the notification. NULL = unread.';

COMMENT ON COLUMN public.user_notifications.metadata IS
  'Arbitrary payload, e.g. { event_type, opportunity_id, actor_id }.';

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id
  ON public.user_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications(user_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at
  ON public.user_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_entity_id
  ON public.user_notifications(entity_id)
  WHERE entity_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Extend entities: comms_tracking_enabled
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'entities'
      AND column_name  = 'comms_tracking_enabled'
  ) THEN
    ALTER TABLE public.entities
      ADD COLUMN comms_tracking_enabled boolean NOT NULL DEFAULT true;
  END IF;
END;
$$;

COMMENT ON COLUMN public.entities.comms_tracking_enabled IS
  'When true, outbound communications are logged for this entity.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Audit field triggers
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_notification_routing_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notification_routing_audit_fields_trigger ON public.notification_routing;
CREATE TRIGGER notification_routing_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.notification_routing
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_routing_audit_fields();

CREATE OR REPLACE FUNCTION public.set_user_notification_overrides_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notification_overrides_audit_fields_trigger ON public.user_notification_overrides;
CREATE TRIGGER user_notification_overrides_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.user_notification_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_notification_overrides_audit_fields();

CREATE OR REPLACE FUNCTION public.set_email_templates_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_templates_audit_fields_trigger ON public.email_templates;
CREATE TRIGGER email_templates_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_email_templates_audit_fields();

CREATE OR REPLACE FUNCTION public.set_user_notifications_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_notifications_audit_fields_trigger ON public.user_notifications;
CREATE TRIGGER user_notifications_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_notifications_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Audit log triggers
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.notification_routing');
SELECT audit.attach_trigger('public.user_notification_overrides');
SELECT audit.attach_trigger('public.email_templates');
SELECT audit.attach_trigger('public.user_notifications');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.notification_routing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- ── notification_routing ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "notification_routing_select_authenticated" ON public.notification_routing;
CREATE POLICY "notification_routing_select_authenticated"
  ON public.notification_routing
  FOR SELECT
  TO authenticated
  USING (true);

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

DROP POLICY IF EXISTS "user_notification_overrides_select_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_select_own_or_admin"
  ON public.user_notification_overrides
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_notification_overrides_insert_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_insert_own_or_admin"
  ON public.user_notification_overrides
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_notification_overrides_update_own_or_admin" ON public.user_notification_overrides;
CREATE POLICY "user_notification_overrides_update_own_or_admin"
  ON public.user_notification_overrides
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

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

DROP POLICY IF EXISTS "email_templates_select_authenticated" ON public.email_templates;
CREATE POLICY "email_templates_select_authenticated"
  ON public.email_templates
  FOR SELECT
  TO authenticated
  USING (true);

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

DROP POLICY IF EXISTS "user_notifications_select_own_or_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_select_own_or_admin"
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_notifications_insert_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_insert_admin"
  ON public.user_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "user_notifications_update_own_or_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_update_own_or_admin"
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "user_notifications_delete_admin" ON public.user_notifications;
CREATE POLICY "user_notifications_delete_admin"
  ON public.user_notifications
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. Service role policies (for backend push)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "user_notifications_service_role" ON public.user_notifications;
CREATE POLICY "user_notifications_service_role"
  ON public.user_notifications
  TO service_role
  USING (true)
  WITH CHECK (true);
