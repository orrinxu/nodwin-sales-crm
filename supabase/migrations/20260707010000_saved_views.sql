-- supabase/migrations/20260707010000_saved_views.sql
--
-- Per-user saved views for the opportunity/pipeline list (SOW §17 dashboards).
--
-- A saved view is a NAMED, reusable bundle of the list's client-side filter
-- state (search text, stage, owner, sort). Views are scoped to a list surface:
--   scope = 'mine' → /pipeline (my deals)   scope = 'all' → /opportunities (all)
-- so the same name can exist once per (user, scope).
--
-- Owner-only, exactly like user_preferences (20260703000000) and
-- user_notification_overrides (20260619000000): user_id FK, owner-or-admin RLS,
-- audit-fields trigger. Views are a DISPLAY convenience — `filters` never mutates
-- deal data and is re-validated in the app layer before it is applied.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.saved_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name       text NOT NULL,
  scope      text NOT NULL,
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT chk_saved_views_scope CHECK (scope IN ('mine', 'all')),
  CONSTRAINT chk_saved_views_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT uq_saved_views_user_scope_name UNIQUE (user_id, scope, name)
);

COMMENT ON TABLE public.saved_views IS
  'Per-user named saved filter/sort views for the opportunity list. Owner-only. '
  'scope (mine|all) picks the list surface (/pipeline vs /opportunities). filters '
  'is the serialized client filter state, re-validated in the app before applying '
  '— it never mutates deal data.';

CREATE INDEX IF NOT EXISTS idx_saved_views_user_scope
  ON public.saved_views(user_id, scope);

-- ── Audit fields trigger (mirrors set_user_preferences_audit_fields) ────────────

CREATE OR REPLACE FUNCTION public.set_saved_views_audit_fields()
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

DROP TRIGGER IF EXISTS saved_views_audit_fields_trigger ON public.saved_views;
CREATE TRIGGER saved_views_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.saved_views
  FOR EACH ROW
  EXECUTE FUNCTION public.set_saved_views_audit_fields();

-- ── RLS: owner-only (mirrors user_preferences) ──────────────────────────────────

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_views_select_own_or_admin" ON public.saved_views;
CREATE POLICY "saved_views_select_own_or_admin"
  ON public.saved_views
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "saved_views_insert_own_or_admin" ON public.saved_views;
CREATE POLICY "saved_views_insert_own_or_admin"
  ON public.saved_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "saved_views_update_own_or_admin" ON public.saved_views;
CREATE POLICY "saved_views_update_own_or_admin"
  ON public.saved_views
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "saved_views_delete_own_or_admin" ON public.saved_views;
CREATE POLICY "saved_views_delete_own_or_admin"
  ON public.saved_views
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );
